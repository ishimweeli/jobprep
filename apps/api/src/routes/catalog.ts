import { Router, type Request } from 'express';
import type { Country, Difficulty, Prisma } from '@prisma/client';
import { z } from 'zod';
import { canStartMockTest, coveredUntil, daysLeft, type GrantLike } from '../domain/access';
import { emailInput } from '../domain/email';
import { activeJobSearches, deriveJobDeadline } from '../domain/jobDeadline';
import { formatMoney, isSellable } from '../domain/pricing';
import { normalizeQuery } from '../services/demand';
import { HttpError, notFound } from '../http/errors';
import type { Ctx } from '../http/context';

/**
 * Public, country-scoped discovery: landing, catalog, exam details, pricing, "request this exam".
 * Rules enforced here for every route:
 *  - only LIVE countries are browsable (preparing/planned countries stay hidden, tests included)
 *  - only PUBLISHED mock tests and questions are visible
 *  - a signed-in user only sees their own country (guests may browse any live country)
 *  - question content (options, answers, explanations) is never returned — only counts and marks
 */

const PUBLISHED = { status: 'PUBLISHED' } as const;

/** A query value that may be a comma list; each item must pass `item`. */
const csv = (item: z.ZodType<string, string>) =>
  z.string().max(200).optional().transform((v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10) : [] as string[])).pipe(z.array(item).max(10));

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(80).optional(),
  price: z.enum(['free', 'paid']).optional(),
  // difficulty, language and subject take one value or a comma list ("FOUNDATION,STANDARD").
  difficulty: csv(z.enum(['FOUNDATION', 'STANDARD', 'CHALLENGING'])),
  language: csv(z.string().min(2).max(5)),
  subject: csv(z.string().max(80)), // topic slugs
  sort: z.enum(['recommended', 'recent', 'title', 'free_first', 'deadline']).default('recommended'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const examRequestSchema = z.object({
  query: z.string().trim().min(2).max(120),
  email: emailInput.optional(),
});

const mockTestInclude = {
  category: { select: { slug: true, name: true } },
  exam: { select: { slug: true, name: true, profession: { select: { name: true } } } },
  _count: { select: { questions: { where: PUBLISHED } } },
} satisfies Prisma.MockTestInclude;

type CardRow = Prisma.MockTestGetPayload<{ include: typeof mockTestInclude }>;

function card(t: CardRow) {
  return {
    id: t.id,
    slug: t.slug,
    title: t.title,
    category: t.category,
    profession: t.exam.profession.name,
    questionCount: t._count.questions,
    durationMinutes: t.durationMinutes,
    languages: t.languages,
    difficulty: t.difficulty,
    isFree: t.isFree,
    accessTag: t.isFree ? 'FREE' : 'FULL_ACCESS',
    attempts: 'UNLIMITED',
    publishedAt: t.publishedAt,
    jobDeadlineAt: t.jobDeadlineAt,
  };
}

/** The `where` every catalog list (flat or grouped by job) filters mock tests by. */
function buildMockTestWhere(countryCode: string, f: z.infer<typeof listQuery>): Prisma.MockTestWhereInput {
  // Every search word must match somewhere: title, summary, category, profession or a topic (subject).
  // LIKE wildcards typed by the user (% _ \) are matched literally, not treated as patterns.
  const words = (f.q ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((w) => w.replace(/[\\%_]/g, '\\$&'));
  const wordFilters: Prisma.MockTestWhereInput[] = words.map((w) => ({
    OR: [
      { title: { contains: w, mode: 'insensitive' } },
      { summary: { contains: w, mode: 'insensitive' } },
      { category: { name: { contains: w, mode: 'insensitive' } } },
      { exam: { profession: { name: { contains: w, mode: 'insensitive' } } } },
      { questions: { some: { ...PUBLISHED, topic: { name: { contains: w, mode: 'insensitive' } } } } },
    ],
  }));

  return {
    countryCode,
    ...PUBLISHED,
    ...(f.category && { category: { slug: f.category } }),
    ...(f.price && { isFree: f.price === 'free' }),
    ...(f.difficulty.length > 0 && { difficulty: { in: f.difficulty as Difficulty[] } }),
    ...(f.language.length > 0 && { languages: { hasSome: f.language } }),
    ...(f.subject.length > 0 && { questions: { some: { ...PUBLISHED, topic: { slug: { in: f.subject } } } } }),
    ...(wordFilters.length > 0 && { AND: wordFilters }),
    // "Closing soon" only makes sense for mocks tied to a real, still-open job posting.
    ...(f.sort === 'deadline' && { jobDeadlineAt: { not: null } }),
  };
}

/** The job that holds the general psychometric practice exams. */
export const psychometricExamSlug = (countryCode: string) => `${countryCode.toLowerCase()}-psychometric-test-preparation`;

/** One card per job (`Exam`): every row below shares one `examId`, already filtered to this country + PUBLISHED. */
function jobCard(rows: CardRow[], now: Date) {
  const first = rows[0]!; // callers only ever pass a non-empty group (grouped by examId from at least one row)
  const durations = [...new Set(rows.map((r) => r.durationMinutes))];
  const questionCounts = [...new Set(rows.map((r) => r._count.questions))];
  const publishedDates = rows.map((r) => r.publishedAt).filter((d): d is Date => d !== null);
  return {
    examId: first.examId,
    jobSlug: first.exam.slug,
    jobName: first.exam.name,
    category: first.category,
    mockTestCount: rows.length,
    freeCount: rows.filter((r) => r.isFree).length,
    difficulties: [...new Set(rows.map((r) => r.difficulty))],
    durationMinutes: durations.length === 1 ? durations[0] : null,
    durationRange: durations.length > 1 ? { min: Math.min(...durations), max: Math.max(...durations) } : null,
    questionCount: questionCounts.length === 1 ? questionCounts[0] : null,
    questionCountRange: questionCounts.length > 1 ? { min: Math.min(...questionCounts), max: Math.max(...questionCounts) } : null,
    languages: [...new Set(rows.flatMap((r) => r.languages))].sort(),
    jobDeadlineAt: deriveJobDeadline(rows.map((r) => r.jobDeadlineAt), now),
    publishedAt: publishedDates.length > 0 ? new Date(Math.max(...publishedDates.map((d) => d.getTime()))) : null,
  };
}

export function catalogRouter(ctx: Ctx) {
  const router = Router({ mergeParams: true });
  const { prisma } = ctx;

  /** The psychometric section, or null until it has a published mock in this country. */
  async function psychometricPrep(countryCode: string) {
    const jobSlug = psychometricExamSlug(countryCode);
    const rows = await prisma.mockTest.findMany({ where: { countryCode, ...PUBLISHED, exam: { slug: jobSlug } }, select: { isFree: true } });
    return rows.length === 0 ? null : { jobSlug, mockTestCount: rows.length, freeCount: rows.filter((r) => r.isFree).length };
  }

  /** Resolve the :code param to a live country the viewer is allowed to browse. */
  async function liveCountry(req: Request): Promise<Country> {
    const code = String(req.params.code).toUpperCase();
    const country = await prisma.country.findUnique({ where: { code } });
    if (!country) throw notFound('country_not_found');
    if (country.status !== 'LIVE') throw notFound('country_not_available');
    if (req.user && req.user.countryCode !== country.code) {
      const [own, test] = await Promise.all([
        prisma.country.findUnique({ where: { code: req.user.countryCode }, select: { code: true, name: true } }),
        typeof req.params.slug === 'string'
          ? prisma.mockTest.findFirst({ where: { countryCode: country.code, slug: req.params.slug, status: 'PUBLISHED' }, select: { slug: true, title: true } })
          : Promise.resolve(null),
      ]);
      throw new HttpError(403, 'country_mismatch', {
        requestedCountry: { code: country.code, name: country.name }, userCountry: own, test: typeof req.params.slug === 'string' ? test : undefined,
      });
    }
    return country;
  }

  const planFor = (code: string) =>
    prisma.planConfig.findFirst({ where: { countryCode: code, code: 'FULL_ACCESS', active: true } });

  // ───────────────────────── Landing

  router.get('/landing', async (req, res) => {
    const country = await liveCountry(req);
    const base = { countryCode: country.code, ...PUBLISHED };

    const [categories, featuredCategory, recent, plan, catalogRows, psychometric] = await Promise.all([
      prisma.category.findMany({
        where: { countryCode: country.code },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { mockTests: { where: PUBLISHED } } } },
      }),
      prisma.category.findFirst({ where: { countryCode: country.code, featured: true } }),
      prisma.mockTest.findMany({
        where: base,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 4,
        include: mockTestInclude,
      }),
      planFor(country.code),
      prisma.mockTest.findMany({ where: base, select: { examId: true, jobDeadlineAt: true, exam: { select: { slug: true, name: true } } } }),
      psychometricPrep(country.code),
    ]);

    const featured = featuredCategory
      ? await prisma.mockTest.findMany({
          where: { ...base, categoryId: featuredCategory.id },
          orderBy: [{ isFree: 'desc' }, { title: 'asc' }],
          take: 4,
          include: mockTestInclude,
        })
      : [];

    // Worked out from the live catalog on every request, so a suggestion can never point at a job that is gone or closed.
    const realJobs = catalogRows.filter((r) => r.exam.slug !== psychometricExamSlug(country.code));
    const popular = activeJobSearches(realJobs.map((r) => ({ examId: r.examId, examName: r.exam.name, jobDeadlineAt: r.jobDeadlineAt })), ctx.now());

    res.json({
      country: { code: country.code, name: country.name, disclaimer: country.disclaimer, languages: country.languages },
      popularSearches: popular,
      // The psychometric section is practice, not a role someone is hired into, so it is not counted as a job.
      stats: { mockTests: catalogRows.length, jobs: new Set(realJobs.map((r) => r.examId)).size },
      psychometricPrep: psychometric,
      categories: categories.map((c) => ({
        id: c.id, slug: c.slug, name: c.name, description: c.description, icon: c.icon,
        featured: c.featured, mockTestCount: c._count.mockTests,
      })),
      featuredCategory: featuredCategory && { slug: featuredCategory.slug, name: featuredCategory.name },
      featuredTests: featured.map(card),
      recentlyAdded: recent.map(card),
      plan: plan && {
        name: plan.name,
        priceLabel: formatMoney(plan.priceMinor, plan.currencyCode, country.currencyExponent),
        durationDays: plan.durationDays,
        autoRenew: plan.autoRenew,
        checkoutAvailable: isSellable(plan),
      },
      howItWorks: ['find', 'take', 'review', 'practise'],
    });
  });

  // ───────────────────────── Catalog

  router.get('/mock-tests', async (req, res) => {
    const country = await liveCountry(req);
    const f = listQuery.parse(req.query);
    const where = buildMockTestWhere(country.code, f);
    const words = (f.q ?? '').split(/\s+/).filter(Boolean).slice(0, 6);

    const orderBy: Prisma.MockTestOrderByWithRelationInput[] =
      f.sort === 'recent' ? [{ publishedAt: 'desc' }, { title: 'asc' }]
      : f.sort === 'title' ? [{ title: 'asc' }]
      : f.sort === 'free_first' ? [{ isFree: 'desc' }, { title: 'asc' }]
      : f.sort === 'deadline' ? [{ jobDeadlineAt: 'asc' }, { title: 'asc' }]
      : [{ category: { sortOrder: 'asc' } }, { isFree: 'desc' }, { title: 'asc' }];

    const [total, rows, facetCats, facetTopics, facetRows] = await Promise.all([
      prisma.mockTest.count({ where }),
      prisma.mockTest.findMany({ where, orderBy, skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: mockTestInclude }),
      prisma.category.findMany({
        where: { countryCode: country.code }, orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { mockTests: { where: PUBLISHED } } } },
      }),
      prisma.topic.findMany({
        where: { category: { countryCode: country.code }, questions: { some: { ...PUBLISHED, mockTest: PUBLISHED } } },
        orderBy: { name: 'asc' }, select: { slug: true, name: true },
      }),
      prisma.mockTest.findMany({
        where: { countryCode: country.code, ...PUBLISHED }, select: { languages: true, difficulty: true },
      }),
    ]);

    res.json({
      total,
      page: f.page,
      pageSize: f.pageSize,
      totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
      hasMore: f.page * f.pageSize < total,
      nextPage: f.page * f.pageSize < total ? f.page + 1 : null,
      results: rows.map(card),
      // Shown in the empty state: "No mock tests for “Veterinary officer” yet — Request this exam".
      empty: total === 0,
      canRequestExam: total === 0 && words.length > 0,
      facets: {
        categories: facetCats.map((c) => ({ slug: c.slug, name: c.name, count: c._count.mockTests })),
        subjects: [...new Map(facetTopics.map((t) => [t.slug, t])).values()],
        difficulties: [...new Set(facetRows.map((r) => r.difficulty))],
        languages: [...new Set(facetRows.flatMap((r) => r.languages))].sort(),
      },
    });
  });

  /** Same catalog as `/mock-tests`, grouped into one card per job (`Exam`) instead of one per mock test. */
  router.get('/jobs', async (req, res) => {
    const country = await liveCountry(req);
    const f = listQuery.parse(req.query);
    const where = buildMockTestWhere(country.code, f);
    const words = (f.q ?? '').split(/\s+/).filter(Boolean).slice(0, 6);

    const [rows, facetCats, facetTopics, facetRows, psychometric] = await Promise.all([
      // Unpaginated: one country's whole catalog, grouped in JS below (same pattern as the facet queries).
      prisma.mockTest.findMany({ where, include: mockTestInclude }),
      prisma.category.findMany({
        where: { countryCode: country.code }, orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { mockTests: { where: PUBLISHED } } } },
      }),
      prisma.topic.findMany({
        where: { category: { countryCode: country.code }, questions: { some: { ...PUBLISHED, mockTest: PUBLISHED } } },
        orderBy: { name: 'asc' }, select: { slug: true, name: true },
      }),
      prisma.mockTest.findMany({
        where: { countryCode: country.code, ...PUBLISHED }, select: { languages: true, difficulty: true },
      }),
      psychometricPrep(country.code),
    ]);

    const byExam = new Map<string, CardRow[]>();
    for (const row of rows) {
      const group = byExam.get(row.examId);
      if (group) group.push(row);
      else byExam.set(row.examId, [row]);
    }
    const jobs = [...byExam.values()].map((group) => jobCard(group, ctx.now()));

    const categoryRank = new Map(facetCats.map((c, i) => [c.slug, i]));
    jobs.sort(
      f.sort === 'recent' ? (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) || a.jobName.localeCompare(b.jobName)
      : f.sort === 'title' ? (a, b) => a.jobName.localeCompare(b.jobName)
      : f.sort === 'free_first' ? (a, b) => (Number(b.freeCount > 0) - Number(a.freeCount > 0)) || a.jobName.localeCompare(b.jobName)
      : f.sort === 'deadline' ? (a, b) => (a.jobDeadlineAt?.getTime() ?? Infinity) - (b.jobDeadlineAt?.getTime() ?? Infinity) || a.jobName.localeCompare(b.jobName)
      : (a, b) => (categoryRank.get(a.category.slug) ?? 0) - (categoryRank.get(b.category.slug) ?? 0) || (Number(b.freeCount > 0) - Number(a.freeCount > 0)) || a.jobName.localeCompare(b.jobName),
    );

    const total = jobs.length;
    const page = jobs.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);

    res.json({
      total,
      page: f.page,
      pageSize: f.pageSize,
      totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
      hasMore: f.page * f.pageSize < total,
      nextPage: f.page * f.pageSize < total ? f.page + 1 : null,
      results: page,
      psychometricPrep: psychometric,
      // Shown in the empty state: "No jobs for “Veterinary officer” yet — Request this exam".
      empty: total === 0,
      canRequestExam: total === 0 && words.length > 0,
      facets: {
        categories: facetCats.map((c) => ({ slug: c.slug, name: c.name, count: c._count.mockTests })),
        subjects: [...new Map(facetTopics.map((t) => [t.slug, t])).values()],
        difficulties: [...new Set(facetRows.map((r) => r.difficulty))],
        languages: [...new Set(facetRows.flatMap((r) => r.languages))].sort(),
      },
    });
  });

  /** One job's detail: its name/category plus every published mock test under it, each with its own access state. */
  router.get('/jobs/:jobSlug', async (req, res) => {
    const country = await liveCountry(req);
    const exam = await prisma.exam.findFirst({
      where: { slug: String(req.params.jobSlug) },
      include: { profession: { select: { name: true, category: { select: { slug: true, name: true } } } } },
    });
    if (!exam) throw notFound('job_not_found');

    const mockTests = await prisma.mockTest.findMany({
      where: { examId: exam.id, countryCode: country.code, ...PUBLISHED },
      include: mockTestInclude,
      orderBy: [{ isFree: 'desc' }, { title: 'asc' }],
    });
    // A job with no published mocks in this country is indistinguishable from one that doesn't exist here.
    if (mockTests.length === 0) throw notFound('job_not_found');

    const grants = req.user
      ? await prisma.accessGrant.findMany({ where: { userId: req.user.id, countryCode: country.code, endsAt: { gt: ctx.now() } } })
      : [];
    const grantLikes: GrantLike[] = grants.map((g) => ({
      countryCode: g.countryCode, startsAt: g.startsAt, endsAt: g.endsAt, status: g.status,
    }));

    const myAttempts = req.user
      ? await prisma.attempt.groupBy({
          by: ['mockTestId'],
          where: { userId: req.user.id, kind: 'FULL', status: { not: 'IN_PROGRESS' }, submittedAt: { not: null }, mockTestId: { in: mockTests.map((t) => t.id) } },
          _count: { _all: true },
          _max: { percent: true },
        })
      : [];
    const mine = new Map(myAttempts.map((a) => [a.mockTestId, a]));

    res.json({
      exam: { id: exam.id, slug: exam.slug, name: exam.name },
      isPsychometricPrep: exam.slug === psychometricExamSlug(country.code),
      psychometricPrep: exam.slug === psychometricExamSlug(country.code) ? null : await psychometricPrep(country.code),
      category: exam.profession.category,
      profession: { name: exam.profession.name },
      jobDeadlineAt: deriveJobDeadline(mockTests.map((t) => t.jobDeadlineAt), ctx.now()),
      freeCount: mockTests.filter((t) => t.isFree).length,
      totalMockTests: mockTests.length,
      mockTests: mockTests.map((t) => {
        const decision = canStartMockTest(t, country.code, grantLikes, ctx.now());
        const accessEnd = coveredUntil(grantLikes, country.code, ctx.now());
        return {
          ...card(t),
          myAttempts: mine.has(t.id)
            ? { count: mine.get(t.id)!._count._all, bestPercent: mine.get(t.id)!._max.percent === null ? null : Number(mine.get(t.id)!._max.percent) }
            : null,
          access: {
            state: decision.allowed ? (decision.reason === 'free' ? 'FREE' : 'GRANTED') : 'LOCKED',
            canStart: decision.allowed,
            needsFullAccess: !decision.allowed && decision.reason === 'needs_full_access',
            accessEndsAt: accessEnd,
            daysLeft: accessEnd ? daysLeft({ endsAt: accessEnd }, ctx.now()) : null,
          },
        };
      }),
    });
  });

  /** "Request this exam": the demand signal behind the admin's "requested 7 times" alert. */
  router.post('/exam-requests', async (req, res) => {
    const country = await liveCountry(req);
    const body = examRequestSchema.parse(req.body);
    const email = body.email ?? req.user?.email ?? null;
    const normalizedQuery = normalizeQuery(body.query);
    // The same address asking for the same search twice counts once. A request with no address is always stored:
    // each one is a separate person as far as we can tell, and the count is the demand signal.
    const already = email
      ? await prisma.examRequest.findFirst({ where: { countryCode: country.code, normalizedQuery, status: 'OPEN', email }, select: { id: true } })
      : null;
    if (!already) {
      await prisma.examRequest.create({ data: { countryCode: country.code, query: body.query, normalizedQuery, email } });
    }
    const requestCount = await prisma.examRequest.count({ where: { countryCode: country.code, normalizedQuery, status: 'OPEN' } });
    res.status(already ? 200 : 201).json({ ok: true, alreadyRequested: !!already, requestCount });
  });

  // ───────────────────────── Exam details

  router.get('/mock-tests/:slug', async (req, res) => {
    const country = await liveCountry(req);
    const test = await prisma.mockTest.findFirst({
      where: { countryCode: country.code, slug: String(req.params.slug), ...PUBLISHED },
      include: { ...mockTestInclude, sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!test) throw notFound('mock_test_not_found');

    const [bySection, plan, methods, grants, attempts] = await Promise.all([
      prisma.question.groupBy({
        by: ['sectionId'], where: { mockTestId: test.id, ...PUBLISHED },
        _count: { _all: true }, _sum: { marks: true },
      }),
      planFor(country.code),
      prisma.paymentMethodConfig.findMany({
        where: { countryCode: country.code, mode: { not: 'DISABLED' } }, orderBy: { sortOrder: 'asc' },
      }),
      req.user
        ? prisma.accessGrant.findMany({ where: { userId: req.user.id, countryCode: country.code, endsAt: { gt: ctx.now() } } })
        : Promise.resolve([]),
      req.user
        ? prisma.attempt.findMany({
            // Practice sets hang off a test too, but they are not attempts of it (no "last attempt" or "best score").
            where: { userId: req.user.id, mockTestId: test.id, kind: 'FULL', status: { not: 'IN_PROGRESS' }, submittedAt: { not: null } },
            orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: 5,
          })
        : Promise.resolve([]),
    ]);
    const attemptAgg = req.user
      ? await prisma.attempt.aggregate({
          where: { userId: req.user.id, mockTestId: test.id, kind: 'FULL', status: { not: 'IN_PROGRESS' }, submittedAt: { not: null } },
          _count: { _all: true }, _max: { percent: true },
        })
      : null;

    const running = req.user
      ? await prisma.attempt.findFirst({
          where: { userId: req.user.id, mockTestId: test.id, kind: 'FULL', status: 'IN_PROGRESS', deadlineAt: { gt: ctx.now() } },
          include: { answers: { select: { selected: true } } },
        })
      : null;
    const stats = new Map(bySection.map((s) => [s.sectionId, s]));
    const sections = test.sections
      .map((s) => ({
        name: s.name,
        questionType: s.questionTypeLabel,
        questions: stats.get(s.id)?._count._all ?? 0,
        marks: Number(stats.get(s.id)?._sum.marks ?? 0),
      }))
      .filter((s) => s.questions > 0);
    const totalMarks = sections.reduce((n, s) => n + s.marks, 0);

    const grantLikes: GrantLike[] = grants.map((g) => ({
      countryCode: g.countryCode, startsAt: g.startsAt, endsAt: g.endsAt, status: g.status,
    }));
    const decision = canStartMockTest(test, country.code, grantLikes, ctx.now());
    const accessEnd = coveredUntil(grantLikes, country.code, ctx.now());

    // Same-profession free sample first, otherwise any free test in the category.
    const freeInCategory = test.isFree
      ? []
      : await prisma.mockTest.findMany({
          where: { countryCode: country.code, ...PUBLISHED, isFree: true, categoryId: test.categoryId },
          orderBy: { title: 'asc' },
          include: mockTestInclude,
        });
    const sample = freeInCategory.find((t) => t.examId === test.examId) ?? freeInCategory[0] ?? null;

    const priceLabel = plan ? formatMoney(plan.priceMinor, plan.currencyCode, country.currencyExponent) : null;
    const needsPurchase = !decision.allowed && decision.reason === 'needs_full_access';

    let jobProgress: null | { lockedCount: number; attempts: number; best: null | { percent: number; title: string; slug: string } } = null;
    if (needsPurchase) {
      const paidInJob = await prisma.mockTest.count({ where: { examId: test.examId, countryCode: country.code, ...PUBLISHED, isFree: false } });
      const taken = req.user
        ? await prisma.attempt.findMany({
            where: { userId: req.user.id, kind: 'FULL', status: { not: 'IN_PROGRESS' }, submittedAt: { not: null }, percent: { not: null }, mockTest: { examId: test.examId, countryCode: country.code } },
            orderBy: [{ percent: 'desc' }, { submittedAt: 'desc' }],
            select: { percent: true, mockTest: { select: { title: true, slug: true } } },
          })
        : [];
      const top = taken[0];
      jobProgress = {
        lockedCount: paidInJob,
        attempts: taken.length,
        best: top ? { percent: Number(top.percent), title: top.mockTest.title, slug: top.mockTest.slug } : null,
      };
    }

    res.json({
      ...card(test),
      summary: test.summary,
      totalMarks,
      sections,
      instructions: test.instructions,
      negativeMarking: Number(test.negativeMarkPerWrong) > 0
        ? { perWrongAnswer: Number(test.negativeMarkPerWrong) }
        : null,
      // An official pass mark is shown only when an admin entered one WITH a source. Never inferred.
      passMark:
        test.passMarkPercent !== null && test.passMarkSource
          ? { percent: Number(test.passMarkPercent), source: test.passMarkSource }
          : null,
      noOfficialPassMark: !(test.passMarkPercent !== null && test.passMarkSource),
      access: {
        state: decision.allowed ? (decision.reason === 'free' ? 'FREE' : 'GRANTED') : 'LOCKED',
        canStart: decision.allowed,
        requiresAccount: false, // free tests are playable by guests
        needsFullAccess: needsPurchase,
        accessEndsAt: accessEnd,
        daysLeft: accessEnd ? daysLeft({ endsAt: accessEnd }, ctx.now()) : null,
      },
      pricing: needsPurchase
        ? {
            priceLabel, durationDays: plan?.durationDays ?? null, checkoutAvailable: isSellable(plan),
            paymentMethods: methods.map((m) => m.label),
          }
        : null,
      inProgress: running && {
        attemptId: running.id,
        answered: running.answers.filter((a) => a.selected.length > 0).length,
        total: test._count.questions,
        remainingSeconds: Math.max(0, Math.ceil((running.deadlineAt.getTime() - ctx.now().getTime()) / 1000)),
      },
      freeSample: sample && { slug: sample.slug, title: sample.title, questionCount: sample._count.questions },
      jobProgress,
      attemptStats: {
        count: attemptAgg?._count._all ?? 0,
        bestPercent: attemptAgg?._max.percent == null ? null : Number(attemptAgg._max.percent),
        last: attempts[0] ? { id: attempts[0].id, percent: attempts[0].percent === null ? null : Number(attempts[0].percent), submittedAt: attempts[0].submittedAt } : null,
      },
      previousAttempts: attempts.map((a) => ({
        id: a.id,
        kind: a.kind,
        submittedAt: a.submittedAt,
        scoreMarks: a.scoreMarks === null ? null : Number(a.scoreMarks),
        totalMarks: a.totalMarks === null ? null : Number(a.totalMarks),
        percent: a.percent === null ? null : Number(a.percent),
        minutesUsed: a.submittedAt ? Math.max(1, Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 60000)) : null,
      })),
    });
  });

  // ───────────────────────── Pricing page

  router.get('/pricing', async (req, res) => {
    const country = await liveCountry(req);
    const [plan, methods, total, free] = await Promise.all([
      planFor(country.code),
      prisma.paymentMethodConfig.findMany({
        where: { countryCode: country.code, mode: { not: 'DISABLED' } }, orderBy: { sortOrder: 'asc' },
      }),
      prisma.mockTest.count({ where: { countryCode: country.code, ...PUBLISHED } }),
      prisma.mockTest.count({ where: { countryCode: country.code, ...PUBLISHED, isFree: true } }),
    ]);
    res.json({
      country: { code: country.code, name: country.name, currencyCode: country.currencyCode },
      free: { priceLabel: formatMoney(0, country.currencyCode, country.currencyExponent), mockTestCount: free },
      fullAccess: plan && {
        name: plan.name,
        priceMinor: plan.priceMinor,
        priceLabel: formatMoney(plan.priceMinor, plan.currencyCode, country.currencyExponent),
        durationDays: plan.durationDays,
        paidOnce: !plan.autoRenew,
        autoRenew: plan.autoRenew,
        mockTestCount: total,
        checkoutAvailable: isSellable(plan),
      },
      paymentMethods: methods.map((m) => ({ provider: m.provider, label: m.label, hint: m.hint })),
    });
  });

  return router;
}
