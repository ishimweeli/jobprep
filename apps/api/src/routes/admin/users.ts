import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertCountry, requirePermission } from '../../admin/auth';
import { writeAudit } from '../../admin/audit';
import { coveredUntil, daysLeft, nextGrantWindow } from '../../domain/access';
import { formatMoney } from '../../domain/pricing';
import type { Ctx } from '../../http/context';
import { badRequest, conflict, notFound } from '../../http/errors';
import { requestOtp } from '../../services/otp';
import { countryCodes, inCodes, pageSchema } from './util';

const FILTERS = ['all', 'active', 'free', 'expired', 'suspended'] as const;
const listQuery = pageSchema.extend({
  q: z.string().trim().max(80).optional(),
  filter: z.enum(FILTERS).default('all'),
  country: z.string().length(2).optional(),
});
const reasonField = z.string().trim().min(5, 'reason_too_short').max(300);

export function adminUsersRouter(ctx: Ctx) {
  const router = Router();
  const { prisma, now } = ctx;

  /** active | expired | free | suspended — the same words as the design's filter chips. */
  async function accessStateFor(u: { id: string; status: string; countryCode: string }) {
    const at = now();
    const grants = await prisma.accessGrant.findMany({ where: { userId: u.id } });
    const until = coveredUntil(grants, u.countryCode, at);
    const past = grants.filter((g) => g.status === 'ACTIVE' && g.endsAt <= at).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
    const state = u.status === 'SUSPENDED' ? 'suspended' : until ? 'active' : past ? 'expired' : 'free';
    return { state, endsAt: until, daysLeft: until ? daysLeft({ endsAt: until }, at) : null, expiredAt: until ? null : (past?.endsAt ?? null) };
  }

  router.get('/users', requirePermission('users:read'), async (req, res) => {
    const f = listQuery.parse(req.query);
    const at = now();
    const codes = countryCodes(req.admin!, f.country);
    const activeGrant: Prisma.AccessGrantWhereInput = { status: 'ACTIVE', startsAt: { lte: at }, endsAt: { gt: at } };

    const digits = (f.q ?? '').replace(/\D/g, '');
    const where: Prisma.UserWhereInput = {
      countryCode: inCodes(codes),
      ...(f.q && { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }),
      ...(f.filter === 'suspended' && { status: 'SUSPENDED' }),
      ...(f.filter === 'active' && { status: 'ACTIVE', accessGrants: { some: activeGrant } }),
      ...(f.filter === 'free' && { status: 'ACTIVE', accessGrants: { none: {} } }),
      ...(f.filter === 'expired' && { status: 'ACTIVE', accessGrants: { some: {}, none: activeGrant } }),
    };
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where, orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (f.page - 1) * f.pageSize, take: f.pageSize,
        include: { goalCategory: { select: { name: true } }, _count: { select: { attempts: { where: { status: { not: 'IN_PROGRESS' } } } } } },
      }),
    ]);
    const rows = await Promise.all(users.map(async (u) => ({
      id: u.id, name: u.name, phone: u.phone, countryCode: u.countryCode, goal: u.goalCategory?.name ?? null,
      testsTaken: u._count.attempts, lastActiveAt: u.lastSeenAt, joinedAt: u.createdAt, status: u.status,
      access: await accessStateFor(u),
    })));
    res.json({ total, page: f.page, pageSize: f.pageSize, filter: f.filter, results: rows });
  });

  router.get('/users/:id', requirePermission('users:read'), async (req, res) => {
    const u = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
      include: { goalCategory: { select: { name: true } }, country: true },
    });
    if (!u) throw notFound('user_not_found');
    assertCountry(req.admin!, u.countryCode, 'user_not_found');
    const at = now();

    const [attempts, payments, history, methods, access] = await Promise.all([
      prisma.attempt.findMany({
        where: { userId: u.id, status: { not: 'IN_PROGRESS' } }, orderBy: { submittedAt: 'desc' }, take: 10,
        include: { mockTest: { select: { id: true, title: true } } },
      }),
      prisma.payment.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.auditLog.findMany({
        where: { entityType: 'user', entityId: u.id }, orderBy: { createdAt: 'desc' }, take: 10, include: { actor: { select: { name: true } } },
      }),
      prisma.paymentMethodConfig.findMany({ where: { countryCode: u.countryCode } }),
      accessStateFor(u),
    ]);
    const allFull = await prisma.attempt.findMany({
      where: { userId: u.id, kind: 'FULL', status: { not: 'IN_PROGRESS' }, mockTestId: { in: attempts.map((a) => a.mockTestId) } },
      select: { id: true, mockTestId: true, submittedAt: true },
      // Stable order even when two attempts were finished at the same instant.
      orderBy: [{ submittedAt: 'asc' }, { startedAt: 'asc' }, { id: 'asc' }],
    });
    const pendingSince = payments.find((p) => p.status === 'PENDING' && p.expiresAt > at)?.createdAt ?? null;
    const lastPayment = payments[0];

    res.json({
      user: {
        id: u.id, name: u.name, phone: u.phone, countryCode: u.countryCode, joinedAt: u.createdAt, lastSeenAt: u.lastSeenAt,
        status: u.status, suspendedReason: u.suspendedReason, goal: u.goalCategory?.name ?? null, language: u.language,
      },
      access: { ...access, pendingPaymentSince: pendingSince, lastPaymentFailed: lastPayment ? ['FAILED', 'DECLINED', 'EXPIRED'].includes(lastPayment.status) : false },
      attempts: attempts.map((a) => ({
        id: a.id, kind: a.kind, title: a.mockTest.title, submittedAt: a.submittedAt, percent: a.percent === null ? null : Number(a.percent),
        // "attempt 2": the n-th finished full attempt of that test by this user
        attemptNumber: a.kind === 'FULL' ? allFull.filter((x) => x.mockTestId === a.mockTestId).findIndex((x) => x.id === a.id) + 1 : null,
      })),
      payments: payments.map((p) => ({
        id: p.id, createdAt: p.createdAt, status: p.status, provider: p.provider,
        providerLabel: methods.find((m) => m.provider === p.provider)?.label ?? p.provider,
        priceLabel: formatMoney(p.amountMinor, p.currencyCode, u.country.currencyExponent), reference: p.transactionId ?? p.providerReference,
      })),
      adminHistory: history.map((h) => ({ id: h.id, action: h.action, actor: h.actor?.name ?? null, reason: h.reason, at: h.createdAt })),
    });
  });

  const loadUser = async (req: { params: { id?: string | string[] }; admin?: import('../../admin/auth').AdminPrincipal }) => {
    const u = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!u) throw notFound('user_not_found');
    assertCountry(req.admin!, u.countryCode, 'user_not_found');
    return u;
  };

  /** Grant or extend Full Access by hand. Reason required; goes on top of whatever access they still have. */
  router.post('/users/:id/access', requirePermission('users:manage'), async (req, res) => {
    const body = z.object({
      days: z.number().int().min(1).max(365).optional(), countryCode: z.string().length(2).optional(), reason: reasonField,
    }).parse(req.body);
    const u = await loadUser(req);
    const code = (body.countryCode ?? u.countryCode).toUpperCase();
    assertCountry(req.admin!, code, 'country_not_found');
    const plan = await prisma.planConfig.findFirst({ where: { countryCode: code, code: 'FULL_ACCESS', active: true } });
    if (!plan) throw conflict('no_plan_for_country');
    const days = body.days ?? plan.durationDays;

    const grant = await prisma.$transaction(async (tx) => {
      const existing = await tx.accessGrant.findMany({ where: { userId: u.id, countryCode: code } });
      const w = nextGrantWindow(existing, code, days, now());
      const g = await tx.accessGrant.create({
        data: {
          userId: u.id, countryCode: code, planId: plan.id, startsAt: w.startsAt, endsAt: w.endsAt,
          source: 'MANUAL', grantedById: req.admin!.id, reason: body.reason,
        },
      });
      await writeAudit(tx, req.admin!, {
        action: 'access.grant', entityType: 'user', entityId: u.id, countryCode: code, reason: body.reason,
        metadata: { targetName: u.name, days, endsAt: g.endsAt },
      });
      return g;
    });
    const access = await accessStateFor(u);
    res.status(201).json({ grantId: grant.id, endsAt: grant.endsAt, access });
  });

  router.post('/users/:id/suspend', requirePermission('users:manage'), async (req, res) => {
    const { reason } = z.object({ reason: reasonField }).parse(req.body);
    const u = await loadUser(req);
    if (u.status === 'SUSPENDED') throw conflict('already_suspended');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED', suspendedReason: reason } });
      await tx.session.deleteMany({ where: { userId: u.id } }); // signed out everywhere, immediately
      await writeAudit(tx, req.admin!, { action: 'user.suspend', entityType: 'user', entityId: u.id, countryCode: u.countryCode, reason, metadata: { targetName: u.name } });
    });
    res.json({ ok: true });
  });

  router.post('/users/:id/unsuspend', requirePermission('users:manage'), async (req, res) => {
    const { reason } = z.object({ reason: reasonField }).parse(req.body);
    const u = await loadUser(req);
    if (u.status !== 'SUSPENDED') throw conflict('not_suspended');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { status: 'ACTIVE', suspendedReason: null } });
      await writeAudit(tx, req.admin!, { action: 'user.unsuspend', entityType: 'user', entityId: u.id, countryCode: u.countryCode, reason, metadata: { targetName: u.name } });
    });
    res.json({ ok: true });
  });

  /** Support: text the candidate a new sign-in code (the usual resend limits still apply). */
  router.post('/users/:id/send-login-code', requirePermission('otp:resend'), async (req, res) => {
    const u = await loadUser(req);
    if (u.status === 'SUSPENDED') throw badRequest('user_suspended');
    const out = await requestOtp({ prisma, config: ctx.config, sms: ctx.sms, now }, { phone: u.phone, purpose: 'SIGN_IN' });
    await writeAudit(prisma, req.admin!, { action: 'otp.resend', entityType: 'user', entityId: u.id, countryCode: u.countryCode, metadata: { targetPhone: u.phone, targetName: u.name } });
    res.json(out);
  });

  return router;
}
