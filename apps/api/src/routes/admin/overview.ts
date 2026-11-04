import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../admin/auth';
import { formatMoney } from '../../domain/pricing';
import { normalizeQuery } from '../../services/demand';
import type { Ctx } from '../../http/context';
import { addDays, countryCodes, inCodes, settingNumber, startOfDayUtc, startOfMonthUtc } from './util';

/** The admin Overview: KPIs, "needs attention", a 14-day chart, most-taken tests, latest payments. */
export function adminOverviewRouter(ctx: Ctx) {
  const router = Router();
  const { prisma } = ctx;

  router.get('/overview', requirePermission('overview:read'), async (req, res) => {
    const { country } = z.object({ country: z.string().length(2).optional() }).parse(req.query);
    const codes = countryCodes(req.admin!, country);
    const now = ctx.now();
    const today = startOfDayUtc(now);
    const monthStart = startOfMonthUtc(now);
    const weekAgo = addDays(now, -7);
    const chartStart = addDays(today, -13);
    const stuckMinutes = await settingNumber(prisma, 'payments.stuckAfterMinutes', 10);

    const countries = await prisma.country.findMany();
    const exponent = new Map(countries.map((c) => [c.code, c.currencyExponent]));
    const cc = inCodes(codes);

    const [users, usersToday, activeGrants, paidToday, revenue, startedToday, finishedToday] = await Promise.all([
      prisma.user.count({ where: { countryCode: cc } }),
      prisma.user.count({ where: { countryCode: cc, createdAt: { gte: today } } }),
      prisma.accessGrant.findMany({
        where: { countryCode: cc, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } }, select: { userId: true },
      }),
      prisma.payment.count({ where: { countryCode: cc, status: 'SUCCESSFUL', confirmedAt: { gte: today } } }),
      prisma.payment.groupBy({
        by: ['currencyCode'], where: { countryCode: cc, status: 'SUCCESSFUL', confirmedAt: { gte: monthStart } },
        _sum: { amountMinor: true }, _count: { _all: true },
      }),
      prisma.attempt.count({ where: { countryCode: cc, startedAt: { gte: today } } }),
      prisma.attempt.count({ where: { countryCode: cc, startedAt: { gte: today }, status: { not: 'IN_PROGRESS' } } }),
    ]);

    // Pending payments past the "stuck" threshold, oldest first
    const stuck = await prisma.payment.findMany({
      where: { countryCode: cc, status: 'PENDING', createdAt: { lte: new Date(now.getTime() - stuckMinutes * 60_000) } },
      orderBy: { createdAt: 'asc' }, take: 50, select: { id: true, provider: true, createdAt: true },
    });

    // Reported questions
    const openReports = await prisma.questionReport.findMany({
      where: { status: 'OPEN', question: { mockTest: { countryCode: cc } } },
      select: { questionId: true, question: { select: { sortOrder: true, mockTest: { select: { title: true } } } } },
    });
    const byQuestion = new Map<string, { n: number; title: string; sortOrder: number }>();
    for (const r of openReports) {
      const cur = byQuestion.get(r.questionId) ?? { n: 0, title: r.question.mockTest.title, sortOrder: r.question.sortOrder };
      cur.n++;
      byQuestion.set(r.questionId, cur);
    }
    const topReported = [...byQuestion.values()].sort((a, b) => b.n - a.n)[0] ?? null;

    // "Request this exam" demand: same search, any capitalisation, last 30 days
    const requests = await prisma.examRequest.findMany({
      where: { countryCode: cc, status: 'OPEN', createdAt: { gte: addDays(now, -30) } }, select: { query: true },
    });
    const demand = new Map<string, { label: string; n: number }>();
    for (const r of requests) {
      const key = normalizeQuery(r.query);
      const cur = demand.get(key) ?? { label: r.query.trim(), n: 0 };
      cur.n++;
      demand.set(key, cur);
    }
    const topRequests = [...demand.values()].sort((a, b) => b.n - a.n).slice(0, 3);

    // 14-day chart
    const [signupRows, paymentRows] = await Promise.all([
      prisma.user.findMany({ where: { countryCode: cc, createdAt: { gte: chartStart } }, select: { createdAt: true } }),
      prisma.payment.findMany({ where: { countryCode: cc, status: 'SUCCESSFUL', confirmedAt: { gte: chartStart } }, select: { confirmedAt: true } }),
    ]);
    const bucket = (dates: (Date | null)[]) => {
      const counts = Array.from({ length: 14 }, () => 0);
      for (const d of dates) {
        if (!d) continue;
        const i = Math.floor((startOfDayUtc(d).getTime() - chartStart.getTime()) / 86_400_000);
        if (i >= 0 && i < 14) counts[i]!++;
      }
      return counts;
    };
    const signups = bucket(signupRows.map((r) => r.createdAt));
    const payments = bucket(paymentRows.map((r) => r.confirmedAt));

    // Most-taken tests this week
    const taken = await prisma.attempt.groupBy({
      by: ['mockTestId'], where: { countryCode: cc, kind: 'FULL', startedAt: { gte: weekAgo } },
      _count: { _all: true }, orderBy: { _count: { mockTestId: 'desc' } }, take: 5,
    });
    const topIds = taken.map((t) => t.mockTestId);
    const finishedGroups = await prisma.attempt.groupBy({
      by: ['mockTestId'], where: { mockTestId: { in: topIds }, kind: 'FULL', startedAt: { gte: weekAgo }, status: { not: 'IN_PROGRESS' } },
      _count: { _all: true }, _avg: { percent: true },
    });
    const tests = await prisma.mockTest.findMany({ where: { id: { in: topIds } }, select: { id: true, title: true, isFree: true } });
    const topMockTests = taken.map((t) => {
      const fin = finishedGroups.find((f) => f.mockTestId === t.mockTestId);
      const test = tests.find((x) => x.id === t.mockTestId)!;
      return {
        mockTestId: t.mockTestId, title: test.title, isFree: test.isFree, attempts: t._count._all,
        avgPercent: fin?._avg.percent == null ? null : Math.round(Number(fin._avg.percent)),
        completionPercent: Math.round(((fin?._count._all ?? 0) / t._count._all) * 100),
      };
    });

    const latest = await prisma.payment.findMany({
      where: { countryCode: cc }, orderBy: { createdAt: 'desc' }, take: 5,
      include: { user: { select: { id: true, name: true } } },
    });
    const methods = await prisma.paymentMethodConfig.findMany();
    const labelOf = (countryCode: string, provider: string) => methods.find((m) => m.countryCode === countryCode && m.provider === provider)?.label ?? provider;

    res.json({
      asOf: now,
      scope: codes,
      kpis: {
        registeredUsers: users,
        newUsersToday: usersToday,
        fullAccessActive: new Set(activeGrants.map((g) => g.userId)).size,
        paymentsToday: paidToday,
        revenueThisMonth: revenue.map((r) => ({
          currencyCode: r.currencyCode, amountMinor: r._sum.amountMinor ?? 0, payments: r._count._all,
          label: formatMoney(r._sum.amountMinor ?? 0, r.currencyCode, countries.find((c) => c.currencyCode === r.currencyCode)?.currencyExponent ?? exponent.get('RW') ?? 0),
        })),
        testsStartedToday: startedToday,
        testsCompletedPercentToday: startedToday === 0 ? null : Math.round((finishedToday / startedToday) * 100),
      },
      needsAttention: {
        stuckPayments: { count: stuck.length, thresholdMinutes: stuckMinutes, oldestMinutes: stuck[0] ? Math.floor((now.getTime() - stuck[0].createdAt.getTime()) / 60_000) : null, oldestProvider: stuck[0]?.provider ?? null },
        reportedQuestions: { count: openReports.length, top: topReported && { mockTestTitle: topReported.title, questionNumber: topReported.sortOrder + 1, reports: topReported.n } },
        examRequests: topRequests,
      },
      chart: { days: Array.from({ length: 14 }, (_, i) => addDays(chartStart, i).toISOString().slice(0, 10)), signups, payments },
      topMockTests,
      latestPayments: latest.map((p) => ({
        id: p.id, user: p.user, providerLabel: labelOf(p.countryCode, p.provider), createdAt: p.createdAt, status: p.status,
      })),
    });
  });

  return router;
}
