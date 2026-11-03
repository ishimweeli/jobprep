import { Router } from 'express';
import type { Payment, Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertCountry, requirePermission } from '../../admin/auth';
import { writeAudit } from '../../admin/audit';
import { formatMoney } from '../../domain/pricing';
import type { Ctx } from '../../http/context';
import { conflict, notFound } from '../../http/errors';
import { applySignal, refreshPayment } from '../../services/payments';
import { countryCodes, inCodes, pageSchema, settingNumber, startOfDayUtc } from './util';

const TABS = ['all', 'pending', 'paid', 'failed'] as const;
const listQuery = pageSchema.extend({
  status: z.enum(TABS).default('all'),
  provider: z.enum(['MTN_MOMO', 'AIRTEL_MONEY', 'MPESA']).optional(),
  stuck: z.enum(['true']).optional(),
  q: z.string().trim().max(80).optional(),
  country: z.string().length(2).optional(),
});
const reasonField = z.string().trim().min(5, 'reason_too_short').max(300);

export function adminPaymentsRouter(ctx: Ctx) {
  const router = Router();
  const { prisma, now } = ctx;

  router.get('/payments', requirePermission('payments:read'), async (req, res) => {
    const f = listQuery.parse(req.query);
    const at = now();
    const codes = countryCodes(req.admin!, f.country);
    const stuckMinutes = await settingNumber(prisma, 'payments.stuckAfterMinutes', 10);
    const stuckBefore = new Date(at.getTime() - stuckMinutes * 60_000);
    const day = startOfDayUtc(at);

    const base: Prisma.PaymentWhereInput = { countryCode: inCodes(codes) };
    const digits = (f.q ?? '').replace(/\D/g, '');
    const where: Prisma.PaymentWhereInput = {
      ...base,
      ...(f.status === 'pending' && { status: 'PENDING' }),
      ...(f.status === 'paid' && { status: 'SUCCESSFUL' }),
      ...(f.status === 'failed' && { status: { in: ['FAILED', 'DECLINED', 'EXPIRED'] } }),
      ...(f.provider && { provider: f.provider }),
      ...(f.stuck && { status: 'PENDING', createdAt: { lte: stuckBefore } }),
      ...(f.q && {
        OR: [
          { user: { name: { contains: f.q, mode: 'insensitive' } } },
          { user: { email: { contains: f.q, mode: 'insensitive' } } },
          ...(digits.length >= 3 ? [{ msisdn: { contains: digits } }] : []),
          { providerReference: { contains: f.q, mode: 'insensitive' } },
          { transactionId: { contains: f.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, rows, countries, methods, paidToday, successToday, pendingNow, failedToday] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize,
        include: { user: { select: { id: true, name: true, email: true } }, accessGrant: { select: { endsAt: true } } },
      }),
      prisma.country.findMany(),
      prisma.paymentMethodConfig.findMany(),
      prisma.payment.groupBy({ by: ['currencyCode'], where: { ...base, status: 'SUCCESSFUL', confirmedAt: { gte: day } }, _sum: { amountMinor: true } }),
      prisma.payment.count({ where: { ...base, status: 'SUCCESSFUL', confirmedAt: { gte: day } } }),
      prisma.payment.count({ where: { ...base, status: 'PENDING' } }),
      prisma.payment.count({ where: { ...base, status: { in: ['FAILED', 'DECLINED', 'EXPIRED'] }, updatedAt: { gte: day } } }),
    ]);
    const exp = (code: string) => countries.find((c) => c.code === code)?.currencyExponent ?? 0;

    res.json({
      total, page: f.page, pageSize: f.pageSize, status: f.status, stuckAfterMinutes: stuckMinutes,
      summary: {
        paidToday: paidToday.map((p) => ({ currencyCode: p.currencyCode, amountMinor: p._sum.amountMinor ?? 0, label: formatMoney(p._sum.amountMinor ?? 0, p.currencyCode, countries.find((c) => c.currencyCode === p.currencyCode)?.currencyExponent ?? 0) })),
        successfulToday: successToday, pendingNow, failedOrExpiredToday: failedToday,
      },
      results: rows.map((p) => {
        const stuck = p.status === 'PENDING' && p.createdAt <= stuckBefore;
        const waitingMinutes = Math.floor((at.getTime() - p.createdAt.getTime()) / 60_000);
        return {
          id: p.id, createdAt: p.createdAt, user: p.user, countryCode: p.countryCode, provider: p.provider,
          providerLabel: methods.find((m) => m.countryCode === p.countryCode && m.provider === p.provider)?.label ?? p.provider,
          msisdn: p.msisdn, amountMinor: p.amountMinor, priceLabel: formatMoney(p.amountMinor, p.currencyCode, exp(p.countryCode)),
          status: p.status, stuck, waitingMinutes: p.status === 'PENDING' ? waitingMinutes : null,
          accessUntil: p.accessGrant?.endsAt ?? null, failureReason: p.failureReason,
          reference: p.transactionId ?? p.providerReference,
          // What the admin may do next: pending → check status; stuck, expired or failed → grant by hand.
          actions: [
            ...(p.status === 'PENDING' ? ['check'] : []),
            ...(stuck || p.status === 'EXPIRED' || p.status === 'FAILED' ? ['grant'] : []),
          ],
        };
      }),
    });
  });

  const loadPayment = async (id: string, admin: NonNullable<import('express').Request['admin']>) => {
    const p = await prisma.payment.findUnique({ where: { id }, include: { user: true } });
    if (!p) throw notFound('payment_not_found');
    assertCountry(admin, p.countryCode, 'payment_not_found');
    return p;
  };

  router.get('/payments/:id', requirePermission('payments:read'), async (req, res) => {
    const p = await loadPayment(String(req.params.id), req.admin!);
    const [events, grant, country] = await Promise.all([
      prisma.paymentEvent.findMany({ where: { paymentId: p.id }, orderBy: { createdAt: 'asc' } }),
      prisma.accessGrant.findUnique({ where: { paymentId: p.id }, include: { grantedBy: { select: { name: true } } } }),
      prisma.country.findUniqueOrThrow({ where: { code: p.countryCode } }),
    ]);
    res.json({
      payment: {
        id: p.id, status: p.status, provider: p.provider, msisdn: p.msisdn, createdAt: p.createdAt, expiresAt: p.expiresAt, confirmedAt: p.confirmedAt,
        priceLabel: formatMoney(p.amountMinor, p.currencyCode, country.currencyExponent), reference: p.providerReference, transactionId: p.transactionId,
        failureReason: p.failureReason, countryCode: p.countryCode,
      },
      user: { id: p.user.id, name: p.user.name, email: p.user.email },
      // The timeline: request sent, callbacks, polls, manual action, grant
      events: events.map((e) => ({ id: e.id, source: e.source, status: e.status, at: e.createdAt })),
      grant: grant && { id: grant.id, source: grant.source, startsAt: grant.startsAt, endsAt: grant.endsAt, grantedBy: grant.grantedBy?.name ?? null, reason: grant.reason },
    });
  });

  /** "Check status": ask the operator right now. */
  router.post('/payments/:id/check', requirePermission('payments:check'), async (req, res) => {
    const p = await loadPayment(String(req.params.id), req.admin!);
    const before = p.status;
    const after: Payment = await refreshPayment(ctx, p.id, { force: true });
    await writeAudit(prisma, req.admin!, {
      action: 'payment.check', entityType: 'payment', entityId: p.id, countryCode: p.countryCode,
      metadata: { result: after.status, previous: before, reference: p.providerReference },
    });
    res.json({ id: after.id, status: after.status, changed: after.status !== before });
  });

  /**
   * "Grant access manually": the operator took the money (the admin saw the transaction) but our callback never
   * arrived. Needs the operator's transaction id and a reason; allowed only while the payment is pending, expired
   * or failed — never for a declined payment, and never twice.
   */
  router.post('/payments/:id/manual-grant', requirePermission('payments:grant'), async (req, res) => {
    const body = z.object({ transactionId: z.string().trim().min(4).max(80), reason: reasonField }).parse(req.body);
    const p = await loadPayment(String(req.params.id), req.admin!);
    if (p.status === 'SUCCESSFUL') throw conflict('already_paid');
    if (p.status === 'DECLINED') throw conflict('payment_declined');
    const reused = await prisma.payment.findFirst({
      where: { id: { not: p.id }, status: 'SUCCESSFUL', OR: [{ transactionId: body.transactionId }, { providerReference: body.transactionId }] },
      select: { id: true },
    });
    const reusedManual = await prisma.accessGrant.findFirst({ where: { externalTransactionId: body.transactionId }, select: { id: true } });
    if (reused || reusedManual) throw conflict('transaction_id_in_use'); // one operator transaction can only pay once

    const admin = req.admin!;
    const out = await applySignal(ctx, p.id, { type: 'admin_confirm' }, {
      source: 'admin', eventId: `manual:${p.id}`, transactionId: body.transactionId,
      manual: { adminId: admin.id, reason: body.reason, transactionId: body.transactionId },
      payload: { admin: admin.name, reason: body.reason },
      inTransaction: (tx) => writeAudit(tx, admin, {
        action: 'payment.manual_grant', entityType: 'payment', entityId: p.id, countryCode: p.countryCode, reason: body.reason,
        metadata: { transactionId: body.transactionId, reference: p.providerReference, previousStatus: p.status, targetName: p.user.name },
      }),
    });
    if (!out.changed) throw conflict('payment_not_eligible');
    res.status(201).json({ id: out.payment.id, status: out.payment.status, accessUntil: out.grant?.endsAt ?? null });
  });

  return router;
}
