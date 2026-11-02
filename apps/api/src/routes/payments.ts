import { Router } from 'express';
import { z } from 'zod';
import { formatMoney, isSellable } from '../domain/pricing';
import { requireUser, type Ctx } from '../http/context';
import { accessSummary } from '../services/access-summary';
import { badRequest, notFound } from '../http/errors';
import {
  createPayment, getOwnedPayment, handleCallback, InvalidCallbackError, paymentView, refreshPayment,
} from '../services/payments';

const PROVIDERS = ['MTN_MOMO', 'AIRTEL_MONEY', 'MPESA'] as const;

const createSchema = z.object({
  provider: z.enum(PROVIDERS),
  msisdn: z.string().min(6).max(24),
  /** Optional: send the same key on a retry and you get the same payment back, never a second charge. */
  idempotencyKey: z.string().min(8).max(80).optional(),
});
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

  /** Order summary for the checkout screen: price, duration and the country's payment methods. */
  router.get('/me/checkout', async (req, res) => {
    const user = req.user!;
    const country = await prisma.country.findUniqueOrThrow({ where: { code: user.countryCode } });
    const [plan, methods] = await Promise.all([
      prisma.planConfig.findFirst({ where: { countryCode: country.code, code: 'FULL_ACCESS', active: true } }),
      prisma.paymentMethodConfig.findMany({ where: { countryCode: country.code, mode: { not: 'DISABLED' } }, orderBy: { sortOrder: 'asc' } }),
    ]);
    // Buying while active adds the days after the current end date: tell the payer when access will now run until.
    const access = await accessSummary(ctx, user.id, country.code);
    const base = access.current?.endsAt ?? ctx.now();
    res.json({
      country: { code: country.code, name: country.name, dialCode: country.dialCode, currencyCode: country.currencyCode },
      currentAccess: access.current,
      newAccessEndsAt: plan ? new Date(base.getTime() + plan.durationDays * 86_400_000) : null,
      plan: plan && {
        name: plan.name,
        priceMinor: plan.priceMinor,
        priceLabel: formatMoney(plan.priceMinor, plan.currencyCode, country.currencyExponent),
        durationDays: plan.durationDays,
        paidOnce: !plan.autoRenew,
        checkoutAvailable: country.status === 'LIVE' && isSellable(plan),
      },
      paymentMethods: methods.map((m) => ({ provider: m.provider, label: m.label, hint: m.hint })),
      prefillPhone: user.phone,
    });
  });

  /** "Pay RWF 2,000": send the request-to-pay. The payer approves on their phone. */
  router.post('/payments', async (req, res) => {
    const body = createSchema.parse(req.body);
    const out = await createPayment(ctx, { user: req.user!, provider: body.provider, msisdn: body.msisdn, idempotencyKey: body.idempotencyKey });
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
    const out = await createPayment(ctx, {
      user: req.user!, provider: old.provider as (typeof PROVIDERS)[number], msisdn: body.msisdn ?? old.msisdn, replacePaymentId: old.id,
    });
    res.status(out.created ? 201 : 200).json(await paymentView(ctx, out.payment));
  });

  return router;
}
