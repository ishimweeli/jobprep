import type { Attempt, Prisma, User } from '@prisma/client';
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
  let recommended: null | { topicId: string; topicName: string; percent: number; questionCount: number; minutes: number } = null;
  const viewer = { user: { id: user.id, countryCode: user.countryCode }, guestTokens: [] as string[] };
  for (const t of [...topicStats].sort((a, b) => a.percent - b.percent)) {
    if (t.percent >= STRONG_TOPIC_CUTOFF_PERCENT) break;
    const available = (await loadPracticePool(ctx, { country, viewer, topicIds: [t.topicId] })).length;
    if (available >= MIN_PRACTICE_QUESTIONS) {
      const count = Math.min(PRACTICE_SET_SIZE, available);
      recommended = { topicId: t.topicId, topicName: t.name, percent: t.percent, questionCount: count, minutes: Math.ceil((count * 4) / 3) };
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
    asOf: now(),
  };
}
