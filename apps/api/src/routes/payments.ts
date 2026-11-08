import { Router } from 'express';
import { z } from 'zod';
import { formatMoney, isSellable } from '../domain/pricing';
import { requireUser, type Ctx } from '../http/context';
import { accessSummary } from '../services/access-summary';
import { badRequest, notFound } from '../http/errors';
import {
  createPayment, getOwnedPayment, handleCallback, InvalidCallbackError, paymentView, quoteFor, refreshPayment,
} from '../services/payments';
import { PLAN_CODES } from '../domain/plans';

const PROVIDERS = ['MTN_MOMO', 'AIRTEL_MONEY', 'MPESA'] as const;

const createSchema = z.object({
  provider: z.enum(PROVIDERS),
  msisdn: z.string().min(6).max(24),
  /** Optional: send the same key on a retry and you get the same payment back, never a second charge. */
  idempotencyKey: z.string().min(8).max(80).optional(),
  /** Which tier: Full Access (default) or Full Access + Interview prep. */
  plan: z.enum(['full_access', 'interview']).default('full_access'),
  /** Interview tier: `upgrade` = pay the difference for the current period; `new` = full price, fresh 30 days. */
  option: z.enum(['upgrade', 'new']).optional(),
});
const checkoutQuery = z.object({ plan: z.enum(['full_access', 'interview']).default('full_access'), option: z.enum(['upgrade', 'new']).optional() });
const resendSchema = z.object({ msisdn: z.string().min(6).max(24).optional() });

export function paymentsRouter(ctx: Ctx) {
  const router = Router();
  const { prisma } = ctx;

  // ───────────────────────── Operator webhooks (no session; authenticated by signature / shared secret)
  router.post('/payments/webhooks/:slug', async (req, res) => {
    const provider = ctx.providers.fromSlug(String(req.params.slug));
    if (!provider) throw notFound('unknown_provider');
    try {
      const out = await handleCallback(ctx, provider, {
        rawBody: req.rawBody ?? '',
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v])),
        query: Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, typeof v === 'string' ? v : undefined])),
      });
      res.json({ ok: true, matched: out.matched });
    } catch (e) {
      if (e instanceof InvalidCallbackError) return void res.status(401).json({ error: 'invalid_callback' });
      if (e instanceof SyntaxError) throw badRequest('invalid_json');
      throw e;
    }
  });

  // ───────────────────────── Candidate checkout
  router.use('/me/checkout', requireUser);
  router.use('/payments', requireUser);
  router.use('/me/payments', requireUser);

  /** Order summary for the checkout screen: price, duration and the country's payment methods. */
  router.get('/me/checkout', async (req, res) => {
    const user = req.user!;
    const q = checkoutQuery.parse(req.query);
    const country = await prisma.country.findUniqueOrThrow({ where: { code: user.countryCode } });
    // Accounts have no phone number any more: offer the number this person paid with last time.
    const lastPayer = await prisma.payment.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { msisdn: true } });
    const [quote, fallbackPlan, methods] = await Promise.all([
      quoteFor(ctx, user, country.code, q.plan, q.option),
      prisma.planConfig.findFirst({ where: { countryCode: country.code, code: PLAN_CODES[q.plan], active: true } }),
      prisma.paymentMethodConfig.findMany({ where: { countryCode: country.code, mode: { not: 'DISABLED' } }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const plan = quote?.plan ?? (q.plan === 'interview' && !ctx.config.INTERVIEW_PREP_ENABLED ? null : fallbackPlan);
    const money = (minor: number | null) => formatMoney(minor, country.currencyCode, country.currencyExponent);
    // Buying while active adds the days after the current end date: tell the payer when access will now run until.
    // An upgrade adds no days: access keeps its end date and the minutes run until then.
    const access = await accessSummary(ctx, user.id, country.code);
    const base = access.current?.endsAt ?? ctx.now();
    const upgrade = quote?.kind === 'UPGRADE';
    res.json({
      country: { code: country.code, name: country.name, dialCode: country.dialCode, currencyCode: country.currencyCode },
      currentAccess: access.current,
      newAccessEndsAt: !plan ? null : upgrade ? (access.current?.endsAt ?? null) : new Date(base.getTime() + plan.durationDays * 86_400_000),
      plan: plan && {
        code: q.plan,
        name: plan.name,
        priceMinor: quote?.amountMinor ?? plan.priceMinor,
        priceLabel: money(quote?.amountMinor ?? plan.priceMinor),
        durationDays: plan.durationDays,
        paidOnce: !plan.autoRenew,
        checkoutAvailable: country.status === 'LIVE' && !!quote && isSellable(plan),
        interviewMinutes: plan.interviewMinutes,
        kind: quote?.kind ?? 'PURCHASE',
      },
      // Interview tier: the options to choose between (an upgrade for the current period, and/or the full price).
      interviewOptions: quote?.interview && {
        upgrade: quote.interview.upgrade && { priceLabel: money(quote.interview.upgrade.amountMinor), minutesExpireAt: quote.interview.upgrade.minutesExpireAt },
        full: { priceLabel: money(quote.interview.full.amountMinor), accessEndsAt: quote.interview.full.accessEndsAt, minutesExpireAt: quote.interview.full.minutesExpireAt },
        showFull: quote.interview.showFull,
        selected: quote.kind === 'UPGRADE' ? 'upgrade' : 'new',
      },
      paymentMethods: methods.map((m) => ({ provider: m.provider, label: m.label, hint: m.hint })),
      prefillPhone: lastPayer?.msisdn ?? null,
    });
  });

  /** Payment history: the signed-in person's own payments, newest first. */
  router.get('/me/payments', async (req, res) => {
    const { page, pageSize } = z.object({
      page: z.coerce.number().int().min(1).max(1000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(req.query);
    const where = { userId: req.user!.id };
    const [total, rows, countries, methods] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
        include: { accessGrant: { select: { endsAt: true } } },
      }),
      prisma.country.findMany({ select: { code: true, currencyExponent: true } }),
      prisma.paymentMethodConfig.findMany({ select: { countryCode: true, provider: true, label: true } }),
    ]);
    const at = ctx.now().getTime();
    res.json({
      total, page, pageSize, hasMore: page * pageSize < total,
      payments: rows.map((p) => ({
        id: p.id, createdAt: p.createdAt, status: p.status,
        providerLabel: methods.find((m) => m.countryCode === p.countryCode && m.provider === p.provider)?.label ?? p.provider,
        amountMinor: p.amountMinor, currencyCode: p.currencyCode, countryCode: p.countryCode,
        priceLabel: formatMoney(p.amountMinor, p.currencyCode, countries.find((c) => c.code === p.countryCode)?.currencyExponent ?? 0),
        transactionId: p.status === 'SUCCESSFUL' ? (p.transactionId ?? p.providerReference) : null,
        accessUntil: p.accessGrant?.endsAt ?? null,
        // "Check payment": a pending payment, or one that expired in the last hour (a late approval is still honoured).
        canCheck: p.status === 'PENDING' || (p.status === 'EXPIRED' && p.expiresAt.getTime() > at - 3_600_000),
      })),
    });
  });

  /** One payment as a receipt. Does not ask the operator (use POST /payments/:id/check for that). */
  router.get('/me/payments/:id', async (req, res) => {
    const p = await getOwnedPayment(ctx, String(req.params.id), req.user!);
    const view = await paymentView(ctx, p);
    let receipt = null;
    if (p.status === 'SUCCESSFUL') {
      const [country, plan, grant] = await Promise.all([
        prisma.country.findUniqueOrThrow({ where: { code: p.countryCode }, select: { code: true, name: true } }),
        prisma.planConfig.findUniqueOrThrow({ where: { id: p.planId }, select: { name: true, durationDays: true } }),
        prisma.accessGrant.findUnique({ where: { paymentId: p.id }, select: { startsAt: true, endsAt: true } }),
      ]);
      receipt = {
        number: p.transactionId ?? p.providerReference ?? `JP-${p.id.slice(-8).toUpperCase()}`,
        issuedTo: { name: req.user!.name, email: req.user!.email },
        country, plan,
        paidAt: p.confirmedAt, accessStartsAt: grant?.startsAt ?? null, accessEndsAt: grant?.endsAt ?? null,
      };
    }
    res.json({ payment: view, receipt });
  });

  /** "Pay RWF 2,000": send the request-to-pay. The payer approves on their phone. */
  router.post('/payments', async (req, res) => {
    const body = createSchema.parse(req.body);
    const out = await createPayment(ctx, {
      user: req.user!, provider: body.provider, msisdn: body.msisdn, idempotencyKey: body.idempotencyKey, plan: body.plan, option: body.option,
    });
    res.status(out.created ? 201 : 200).json(await paymentView(ctx, out.payment));
  });

  /** Poll target for the "Approve on your phone" screen. Settles from the operator when the callback is late. */
  router.get('/payments/:id', async (req, res) => {
    const p = await getOwnedPayment(ctx, String(req.params.id), req.user!);
    res.json(await paymentView(ctx, await refreshPayment(ctx, p.id)));
  });

  /** "Check payment" for a stuck payment: ask the operator right now. */
  router.post('/payments/:id/check', async (req, res) => {
    const p = await getOwnedPayment(ctx, String(req.params.id), req.user!);
    res.json(await paymentView(ctx, await refreshPayment(ctx, p.id, { force: true })));
  });

  /** "Send again" (same number) or "Use a different number" (send msisdn). Never charges twice if it was approved meanwhile. */
  router.post('/payments/:id/resend', async (req, res) => {
    const body = resendSchema.parse(req.body ?? {});
    const old = await getOwnedPayment(ctx, String(req.params.id), req.user!);
    // Same tier and the same option (upgrade or full price) as the request being replaced.
    const oldPlan = await prisma.planConfig.findUniqueOrThrow({ where: { id: old.planId } });
    const out = await createPayment(ctx, {
      user: req.user!, provider: old.provider as (typeof PROVIDERS)[number], msisdn: body.msisdn ?? old.msisdn, replacePaymentId: old.id,
      plan: oldPlan.code === PLAN_CODES.interview ? 'interview' : 'full_access', option: old.kind === 'UPGRADE' ? 'upgrade' : oldPlan.code === PLAN_CODES.interview ? 'new' : undefined,
    });
    res.status(out.created ? 201 : 200).json(await paymentView(ctx, out.payment));
  });

  return router;
}
