import { randomUUID } from 'node:crypto';
import type { Payment, PaymentStatus, Prisma, PrismaClient, User } from '@prisma/client';
import { coveredUntil, daysLeft, nextGrantWindow } from '../domain/access';
import { normalizePhone } from '../domain/phone';
import { formatMoney, isSellable } from '../domain/pricing';
import {
  candidateMessage, isExpiredPending, isTerminal, transition, type PaymentSignal, type PaymentStatusCode,
} from '../domain/payment-state';
import type { Ctx } from '../http/context';

/** What the payment flow uses (the sweeper in server.ts calls it without the interview providers). */
type PayCtx = Pick<Ctx, 'prisma' | 'config' | 'email' | 'providers' | 'now'>;
import { badRequest, conflict, forbidden, HttpError, notFound } from '../http/errors';
import { InvalidCallbackError, type CallbackRequest, type PaymentProvider, type ProviderCode, type ProviderStatus } from '../payments/types';

/**
 * Payment rules, in one place:
 *  - one Payment row per attempt to pay; a request-to-pay goes to the operator and the payer approves on their phone
 *  - the outcome arrives by webhook and by polling; both feed `applySignal`, which is idempotent:
 *    a duplicate delivery, a replayed poll, or a callback after a timeout can never grant access twice
 *  - success creates one AccessGrant (unique per payment), scoped to the payment's country, then an SMS receipt
 *  - a success that arrives after our timeout is honoured: the payer was charged, so they get access
 *  - nobody is ever asked for a PIN; we only hold the payer's phone number
 */

const POLL_THROTTLE_MS = 4000;
/** Keep checking recently expired payments, in case the payer approves late. */
const LATE_SUCCESS_WINDOW_MS = 60 * 60 * 1000;

const num = (v: unknown, fallback: number) => (typeof v === 'number' && v > 0 ? v : fallback);
async function settingNumber(prisma: PrismaClient, key: string, fallback: number) {
  return num((await prisma.setting.findUnique({ where: { key } }))?.value, fallback);
}

export function signalFor(status: ProviderStatus, reason?: string): PaymentSignal | null {
  switch (status) {
    case 'SUCCESSFUL': return { type: 'provider_success' };
    case 'DECLINED': return { type: 'provider_declined' };
    case 'FAILED': return { type: 'provider_failed', reason };
    case 'EXPIRED': return { type: 'timeout' };
    case 'PENDING': return null;
  }
}

// ───────────────────────── The idempotent core

export interface SignalMeta {
  source: 'webhook' | 'poll' | 'timeout' | 'admin';
  /** Dedupe key: a repeat delivery with the same id is ignored. */
  eventId: string;
  payload?: Prisma.InputJsonValue;
  transactionId?: string;
  /** Set when an admin confirmed the payment by hand. */
  manual?: { adminId: string; reason: string; transactionId: string };
  /** Runs inside the same database transaction when the signal changes something (used for the audit entry). */
  inTransaction?: (tx: Prisma.TransactionClient) => Promise<unknown>;
}

export async function applySignal(ctx: PayCtx, paymentId: string, signal: PaymentSignal, meta: SignalMeta) {
  const { prisma, now } = ctx;
  const at = now();

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { plan: true } });

    // ON CONFLICT DO NOTHING: a duplicate callback inserts nothing and changes nothing.
    const inserted = await tx.paymentEvent.createMany({
      data: [{ paymentId, source: meta.source, status: signal.type, dedupeKey: meta.eventId, payload: meta.payload ?? {}, createdAt: at }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return { payment, changed: false, grant: null };

    const t = transition(payment.status as PaymentStatusCode, signal);
    if (t.noop) return { payment, changed: false, grant: null };

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: t.next as PaymentStatus,
        ...(t.next === 'SUCCESSFUL' && { confirmedAt: at, failureReason: null }),
        ...(t.next !== 'SUCCESSFUL' && { failureReason: signal.type === 'provider_failed' ? (signal.reason ?? 'failed') : signal.type }),
        ...(meta.transactionId && { transactionId: meta.transactionId }),
      },
    });

    let grant = null;
    if (t.grantAccess) {
      const existing = await tx.accessGrant.findMany({ where: { userId: payment.userId, countryCode: payment.countryCode } });
      const window = nextGrantWindow(existing, payment.countryCode, payment.plan.durationDays, at);
      // The unique constraint on paymentId is the last line of defence against a double grant.
      grant = await tx.accessGrant.create({
        data: {
          userId: payment.userId, countryCode: payment.countryCode, planId: payment.planId, paymentId,
          startsAt: window.startsAt, endsAt: window.endsAt, source: meta.manual ? 'MANUAL' : 'PAYMENT',
          ...(meta.manual && { grantedById: meta.manual.adminId, reason: meta.manual.reason, externalTransactionId: meta.manual.transactionId }),
        },
      });
    }
    if (meta.inTransaction) await meta.inTransaction(tx);
    return { payment: updated, changed: true, grant };
  }, { timeout: 15_000 });

  // The receipt goes out after the commit, and a failing mail server never undoes a payment.
  if (outcome.grant) {
    try {
      await sendReceipt(ctx, outcome.payment, outcome.grant.endsAt);
    } catch (e) {
      console.error('receipt email failed for payment', paymentId, e);
    }
  }
  return outcome;
}

async function sendReceipt(ctx: PayCtx, payment: Payment, endsAt: Date) {
  const [user, country, method] = await Promise.all([
    ctx.prisma.user.findUniqueOrThrow({ where: { id: payment.userId } }),
    ctx.prisma.country.findUniqueOrThrow({ where: { code: payment.countryCode } }),
    ctx.prisma.paymentMethodConfig.findFirst({ where: { countryCode: payment.countryCode, provider: payment.provider } }),
  ]);
  const amount = formatMoney(payment.amountMinor, payment.currencyCode, country.currencyExponent);
  const until = endsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const ref = payment.transactionId ?? payment.providerReference ?? payment.id;
  await ctx.email.send({
    to: user.email,
    subject: `JobPrep receipt: ${amount}`,
    text: `We received ${amount} via ${method?.label ?? 'mobile money'}.

Full Access is active until ${until}.
Reference: ${ref}

Thank you for using JobPrep.`,
  });
}

// ───────────────────────── Creating a payment

export interface CreatePaymentInput {
  user: User;
  provider: ProviderCode;
  msisdn: string;
  idempotencyKey?: string;
  /** "Send again" / "Use a different number": close this pending request and start a fresh one. */
  replacePaymentId?: string;
}

export async function createPayment(ctx: PayCtx, input: CreatePaymentInput) {
  const { prisma, now, providers } = ctx;
  const { user } = input;
  const at = now();

  const country = await prisma.country.findUniqueOrThrow({ where: { code: user.countryCode } });
  if (country.status !== 'LIVE') throw badRequest('country_not_available');
  const plan = await prisma.planConfig.findFirst({ where: { countryCode: country.code, code: 'FULL_ACCESS', active: true } });
  // No price set → no checkout. The price is read here, never from the client.
  if (!plan || !isSellable(plan)) throw conflict('checkout_unavailable');
  const method = await prisma.paymentMethodConfig.findUnique({ where: { countryCode_provider: { countryCode: country.code, provider: input.provider } } });
  if (!method || method.mode === 'DISABLED') throw badRequest('payment_method_unavailable');
  const msisdn = normalizePhone(input.msisdn, country.dialCode);
  if (!msisdn) throw badRequest('invalid_phone');

  if (input.idempotencyKey) {
    const same = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (same) {
      if (same.userId !== user.id) throw conflict('idempotency_key_in_use');
      return { payment: same, created: false };
    }
  }

  if (input.replacePaymentId) {
    const old = await prisma.payment.findUnique({ where: { id: input.replacePaymentId } });
    if (!old || old.userId !== user.id) throw notFound('payment_not_found');
    const settled = await refreshPayment(ctx, old.id, { force: true });
    // If it was approved in the meantime there is nothing to resend — don't charge twice.
    if (settled.status === 'SUCCESSFUL') return { payment: settled, created: false };
    if (settled.status === 'PENDING') {
      await applySignal(ctx, old.id, { type: 'timeout' }, { source: 'admin', eventId: `replaced:${old.id}`, payload: { reason: 'replaced_by_new_request' } });
    }
  } else {
    // Double-tapping "Pay" must not send two prompts: reuse a live pending request for the same number.
    const pending = await prisma.payment.findFirst({
      where: { userId: user.id, provider: input.provider, msisdn, status: 'PENDING', expiresAt: { gt: at } },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) return { payment: pending, created: false };
  }

  const ttlMinutes = await settingNumber(prisma, 'payments.requestTtlMinutes', 3);
  const payment = await prisma.payment.create({
    data: {
      userId: user.id, countryCode: country.code, planId: plan.id, provider: input.provider, msisdn,
      amountMinor: plan.priceMinor!, // snapshot: a later price change never alters an open payment
      currencyCode: plan.currencyCode, status: 'PENDING',
      idempotencyKey: input.idempotencyKey ?? `auto_${randomUUID()}`,
      expiresAt: new Date(at.getTime() + ttlMinutes * 60_000), createdAt: at,
    },
  });

  const provider = providers.get(input.provider);
  try {
    const { providerReference } = await provider.requestToPay({
      paymentId: payment.id, msisdn, amountMinor: payment.amountMinor, currencyCode: payment.currencyCode,
      currencyExponent: country.currencyExponent, description: 'JobPrep Full Access',
      callbackUrl: providers.callbackUrl(input.provider),
    });
    return { payment: await prisma.payment.update({ where: { id: payment.id }, data: { providerReference } }), created: true };
  } catch (e) {
    console.error('request-to-pay failed', payment.id, e);
    await applySignal(ctx, payment.id, { type: 'provider_failed', reason: 'provider_error' }, { source: 'admin', eventId: `rtp-failed:${payment.id}` });
    // Nothing was sent to the payer, so they were not charged.
    throw new HttpError(502, 'provider_unavailable', { paymentId: payment.id });
  }
}

// ───────────────────────── Polling, expiry, status

/** Ask the operator what happened. Throttled so a client polling every few seconds doesn't hammer them. */
export async function pollPayment(ctx: PayCtx, paymentId: string, opts: { force?: boolean } = {}) {
  const { prisma, now, providers } = ctx;
  const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const late = p.status === 'EXPIRED' && now().getTime() - p.updatedAt.getTime() < LATE_SUCCESS_WINDOW_MS;
  if (!(p.status === 'PENDING' || late) || !p.providerReference) return p;
  if (!opts.force && p.lastCheckedAt && now().getTime() - p.lastCheckedAt.getTime() < POLL_THROTTLE_MS) return p;

  await prisma.payment.update({ where: { id: p.id }, data: { lastCheckedAt: now() } });
  let status;
  try {
    status = await providers.get(p.provider).getStatus(p.providerReference);
  } catch (e) {
    console.error('poll failed', p.id, (e as Error).message);
    return p; // can't tell: keep waiting — the next poll or the callback will settle it
  }
  const signal = signalFor(status.status, status.reason);
  if (signal) {
    await applySignal(ctx, p.id, signal, {
      source: 'poll', eventId: `poll:${p.id}:${status.status}`, transactionId: status.transactionId,
      payload: { status: status.status, reason: status.reason ?? null },
    });
  }
  return prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
}

/** Time ran out: look one last time (it may have just been approved), then expire. */
export async function expireIfDue(ctx: PayCtx, paymentId: string) {
  const p = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (!isExpiredPending(p.status as PaymentStatusCode, p.expiresAt, ctx.now())) return p;
  const polled = await pollPayment(ctx, paymentId, { force: true });
  if (polled.status !== 'PENDING') return polled;
  await applySignal(ctx, paymentId, { type: 'timeout' }, { source: 'timeout', eventId: `timeout:${paymentId}` });
  return ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
}

export async function refreshPayment(ctx: PayCtx, paymentId: string, opts: { force?: boolean } = {}) {
  await pollPayment(ctx, paymentId, opts);
  return expireIfDue(ctx, paymentId);
}

/** Background sweep: settle what the callbacks missed and expire what ran out. */
export async function sweepPayments(ctx: PayCtx): Promise<number> {
  const now = ctx.now();
  const rows = await ctx.prisma.payment.findMany({
    where: {
      OR: [
        { status: 'PENDING' },
        { status: 'EXPIRED', updatedAt: { gt: new Date(now.getTime() - LATE_SUCCESS_WINDOW_MS) }, providerReference: { not: null } },
      ],
    },
    select: { id: true, status: true },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  let n = 0;
  for (const r of rows) {
    try {
      const before = r.status;
      const after = await refreshPayment(ctx, r.id);
      if (after.status !== before) n++;
    } catch (e) {
      console.error('payment sweep failed for', r.id, e);
    }
  }
  return n;
}

// ───────────────────────── Webhooks

export async function handleCallback(ctx: PayCtx, provider: PaymentProvider, req: CallbackRequest) {
  const parsed = provider.parseCallback(req); // throws InvalidCallbackError on a bad signature/secret
  const payment = await ctx.prisma.payment.findFirst({
    where: {
      OR: [
        ...(parsed.providerReference ? [{ providerReference: parsed.providerReference }] : []),
        ...(parsed.paymentId ? [{ id: parsed.paymentId }] : []),
      ],
    },
  });
  // Unknown reference: acknowledge so the operator stops retrying, but do nothing.
  if (!payment) return { matched: false as const };
  if (provider.code !== 'FAKE' && !provider.aggregator && payment.provider !== provider.code) return { matched: false as const };

  const { status, reason } = parsed;
  let transactionId = parsed.transactionId;
  if (status === 'SUCCESSFUL' && provider.confirmSuccessByStatus) {
    // The callback only carries a shared secret. Confirm with the provider before granting access. If that call fails
    // it throws (HTTP 5xx), so the provider retries the callback; if it disagrees, the poller/sweeper settles it later.
    const confirmed = await provider.getStatus(parsed.providerReference ?? payment.providerReference ?? '');
    if (confirmed.status !== 'SUCCESSFUL') return { matched: true as const, changed: false, status: payment.status };
    transactionId = confirmed.transactionId ?? transactionId;
  }

  const signal = signalFor(status, reason);
  if (!signal) return { matched: true as const, changed: false, status: payment.status };
  const out = await applySignal(ctx, payment.id, signal, {
    source: 'webhook', eventId: parsed.eventId, transactionId,
    payload: { status, reason: reason ?? null },
  });
  return { matched: true as const, changed: out.changed, status: out.payment.status };
}
export { InvalidCallbackError };

// ───────────────────────── What the client sees

export async function paymentView(ctx: PayCtx, p: Payment) {
  const { prisma, now } = ctx;
  const [country, method, grant, allGrants] = await Promise.all([
    prisma.country.findUniqueOrThrow({ where: { code: p.countryCode } }),
    prisma.paymentMethodConfig.findFirst({ where: { countryCode: p.countryCode, provider: p.provider } }),
    p.status === 'SUCCESSFUL' ? prisma.accessGrant.findUnique({ where: { paymentId: p.id } }) : Promise.resolve(null),
    p.status === 'SUCCESSFUL' ? prisma.accessGrant.findMany({ where: { userId: p.userId, countryCode: p.countryCode } }) : Promise.resolve([]),
  ]);
  // "Access until" is the end of continuous coverage, which includes days bought earlier and still running.
  const accessEnd = grant ? (coveredUntil(allGrants, grant.countryCode, now()) ?? grant.endsAt) : null;
  const status = p.status as PaymentStatusCode;
  const label = method?.label ?? 'mobile money';
  return {
    id: p.id,
    status,
    terminal: isTerminal(status) && status !== 'EXPIRED',
    provider: p.provider,
    providerLabel: label,
    msisdn: p.msisdn,
    amountMinor: p.amountMinor,
    priceLabel: formatMoney(p.amountMinor, p.currencyCode, country.currencyExponent),
    currencyCode: p.currencyCode,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    secondsLeft: status === 'PENDING' ? Math.max(0, Math.ceil((p.expiresAt.getTime() - now().getTime()) / 1000)) : 0,
    message: candidateMessage(status),
    // The design's reassurance on declined / expired / failed.
    notCharged: status === 'DECLINED' || status === 'EXPIRED' || status === 'FAILED',
    approvalHint: `Approve the ${label} request on ${p.msisdn}. Enter your PIN on your phone — JobPrep never asks for it.`,
    transactionId: p.status === 'SUCCESSFUL' ? (p.transactionId ?? p.providerReference) : null,
    confirmedAt: p.confirmedAt,
    access: grant && accessEnd && { startsAt: grant.startsAt, endsAt: accessEnd, daysLeft: daysLeft({ endsAt: accessEnd }, now()), countryCode: grant.countryCode },
    canSendAgain: status === 'PENDING',
    canRetry: status === 'DECLINED' || status === 'EXPIRED' || status === 'FAILED',
  };
}

export async function getOwnedPayment(ctx: PayCtx, id: string, user: User) {
  const p = await ctx.prisma.payment.findUnique({ where: { id } });
  if (!p || p.userId !== user.id) throw notFound('payment_not_found');
  return p;
}
export { forbidden };
