import type { Attempt, Prisma, User } from '@prisma/client';
import { formatMoney } from '../domain/pricing';
import type { TopicResult } from '../domain/scoring';
import { accessSummary } from './access-summary';
import { attemptTitle, listInProgress, type Ctx } from './attempts';
import { loadPracticePool, MIN_PRACTICE_QUESTIONS, PRACTICE_SET_SIZE, STRONG_TOPIC_CUTOFF_PERCENT } from './results';

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

/** Everything the candidate dashboard shows, for the user's own country. */
export async function buildDashboard(ctx: Ctx, user: User, categorySlug?: string) {
  const { prisma, now } = ctx;
  const country = await prisma.country.findUniqueOrThrow({ where: { code: user.countryCode } });
  const goal = user.goalCategoryId
    ? await prisma.category.findUnique({ where: { id: user.goalCategoryId }, select: { id: true, slug: true, name: true } })
    : null;

  const finishedWhere: Prisma.AttemptWhereInput = {
    userId: user.id,
    countryCode: user.countryCode,
    status: { not: 'IN_PROGRESS' },
    submittedAt: { not: null },
  };
  const finished = await prisma.attempt.findMany({
    where: finishedWhere,
    orderBy: { submittedAt: 'asc' },
    include: { mockTest: { include: { category: { select: { slug: true, name: true } } } } },
  });

  // Strengths and weaknesses: marks-weighted across everything the user has finished (full tests + practice).
  const agg = new Map<string, { name: string; marks: number; available: number }>();
  for (const a of finished) {
    for (const t of (a.topicBreakdown as unknown as TopicResult[] | null) ?? []) {
      const cur = agg.get(t.topicId) ?? { name: t.topicName, marks: 0, available: 0 };
      cur.marks += t.marks;
      cur.available += t.marksAvailable;
      agg.set(t.topicId, cur);
    }
  }
  const topicStats = [...agg.entries()]
    .filter(([, v]) => v.available > 0)
    .map(([topicId, v]) => ({ topicId, name: v.name, percent: Math.round((v.marks / v.available) * 100) }));
  const strong = topicStats.filter((t) => t.percent >= STRONG_TOPIC_CUTOFF_PERCENT).sort((a, b) => b.percent - a.percent).slice(0, 3);
  const needsWork = topicStats.filter((t) => t.percent < STRONG_TOPIC_CUTOFF_PERCENT).sort((a, b) => a.percent - b.percent).slice(0, 3);

  // Recommended next: practice set for the weakest topic that has enough questions the user can open.
  let recommended: null | { topicId: string; topicName: string; percent: number; questionCount: number; untimed: true } = null;
  const viewer = { user: { id: user.id, countryCode: user.countryCode }, guestTokens: [] as string[] };
  for (const t of [...topicStats].sort((a, b) => a.percent - b.percent)) {
    if (t.percent >= STRONG_TOPIC_CUTOFF_PERCENT) break;
    const available = (await loadPracticePool(ctx, { country, viewer, topicIds: [t.topicId] })).length;
    if (available >= MIN_PRACTICE_QUESTIONS) {
      const count = Math.min(PRACTICE_SET_SIZE, available);
      recommended = { topicId: t.topicId, topicName: t.name, percent: t.percent, questionCount: count, untimed: true };
      break;
    }
  }

  const fullFinished = finished.filter((a) => a.kind === 'FULL');
  const history = fullFinished
    .filter((a) => !categorySlug || a.mockTest.category.slug === categorySlug)
    .slice(-10)
    .map((a) => ({ attemptId: a.id, submittedAt: a.submittedAt, percent: num(a.percent), title: a.mockTest.title }));

  // "attempt 2": the n-th finished attempt of that test by this user.
  const nth = (a: Attempt) => fullFinished.filter((x) => x.mockTestId === a.mockTestId && x.submittedAt! <= a.submittedAt!).length;
  const recent = await Promise.all(
    [...finished].reverse().slice(0, 5).map(async (a) => ({
      attemptId: a.id,
      kind: a.kind,
      title: await attemptTitle(prisma, a),
      submittedAt: a.submittedAt,
      attemptNumber: a.kind === 'FULL' ? nth(a) : null,
      percent: num(a.percent),
    })),
  );

  const inProgress = await listInProgress(ctx, viewer);
  const unfinished = inProgress[0] ?? null;

  // New users: a free test to start with, plus more tests for their goal (falls back to the featured category).
  const goalCategoryId = goal?.id ?? (await prisma.category.findFirst({ where: { countryCode: user.countryCode, featured: true }, select: { id: true } }))?.id;
  const cardOf = (t: { slug: string; title: string; isFree: boolean; durationMinutes: number; _count: { questions: number } }) => ({
    slug: t.slug, title: t.title, isFree: t.isFree, durationMinutes: t.durationMinutes, questionCount: t._count.questions,
  });
  const testInclude = { _count: { select: { questions: { where: { status: 'PUBLISHED' as const } } } } };
  const startHereRow = goalCategoryId
    ? await prisma.mockTest.findFirst({
        where: { countryCode: user.countryCode, status: 'PUBLISHED', isFree: true, categoryId: goalCategoryId },
        orderBy: { title: 'asc' }, include: testInclude,
      })
    : null;
  const suggestedRows = goalCategoryId
    ? await prisma.mockTest.findMany({
        where: { countryCode: user.countryCode, status: 'PUBLISHED', categoryId: goalCategoryId, ...(startHereRow && { id: { not: startHereRow.id } }) },
        orderBy: [{ isFree: 'desc' }, { title: 'asc' }], take: 3, include: testInclude,
      })
    : [];

  // A payment the payer has not approved yet (the "payment pending" state of My access).
  const pendingRow = await prisma.payment.findFirst({
    where: { userId: user.id, status: 'PENDING', expiresAt: { gt: now() } }, orderBy: { createdAt: 'desc' },
  });
  const pendingMethod = pendingRow
    ? await prisma.paymentMethodConfig.findFirst({ where: { countryCode: pendingRow.countryCode, provider: pendingRow.provider } })
    : null;

  return {
    user: { name: user.name, firstName: user.name.split(' ')[0] },
    country: { code: country.code, name: country.name },
    goal: goal && { categoryId: goal.id, slug: goal.slug, name: goal.name },
    resume: unfinished,
    recommended,
    scoreHistory: history,
    topics: { strong, needsWork },
    recentlyCompleted: recent,
    access: await accessSummary(ctx, user.id, user.countryCode),
    hasActivity: finished.length > 0,
    startHere: finished.length === 0 && startHereRow ? cardOf(startHereRow) : null,
    suggestedTests: suggestedRows.map(cardOf),
    pendingPayment: pendingRow && {
      id: pendingRow.id, providerLabel: pendingMethod?.label ?? 'mobile money',
      priceLabel: formatMoney(pendingRow.amountMinor, pendingRow.currencyCode, country.currencyExponent), expiresAt: pendingRow.expiresAt,
    },
    asOf: now(),
  };
}
