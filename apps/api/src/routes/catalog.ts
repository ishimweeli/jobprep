import { Router, type Request } from 'express';
import type { Country, Prisma } from '@prisma/client';
import { z } from 'zod';
import { canStartMockTest, coveredUntil, daysLeft, type GrantLike } from '../domain/access';
import { normalizePhone } from '../domain/phone';
import { formatMoney, isSellable } from '../domain/pricing';
import { badRequest, forbidden, notFound } from '../http/errors';
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

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(80).optional(),
  price: z.enum(['free', 'paid']).optional(),
  difficulty: z.enum(['FOUNDATION', 'STANDARD', 'CHALLENGING']).optional(),
  language: z.string().min(2).max(5).optional(),
  subject: z.string().max(80).optional(), // topic slug
  sort: z.enum(['recommended', 'recent', 'title']).default('recommended'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const examRequestSchema = z.object({
  query: z.string().trim().min(2).max(120),
  phone: z.string().min(6).max(24).optional(),
});

const mockTestInclude = {
  category: { select: { slug: true, name: true } },
  exam: { select: { profession: { select: { name: true } } } },
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
  };
}

export function catalogRouter(ctx: Ctx) {
  const router = Router({ mergeParams: true });
  const { prisma } = ctx;

  /** Resolve the :code param to a live country the viewer is allowed to browse. */
  async function liveCountry(req: Request): Promise<Country> {
    const code = String(req.params.code).toUpperCase();
    const country = await prisma.country.findUnique({ where: { code } });
    if (!country) throw notFound('country_not_found');
    if (country.status !== 'LIVE') throw notFound('country_not_available');
    if (req.user && req.user.countryCode !== country.code) {
      throw forbidden('country_mismatch');
    }
    return country;
  }

  const planFor = (code: string) =>
    prisma.planConfig.findFirst({ where: { countryCode: code, code: 'FULL_ACCESS', active: true } });

  // ───────────────────────── Landing

  router.get('/landing', async (req, res) => {
    const country = await liveCountry(req);
    const base = { countryCode: country.code, ...PUBLISHED };

    const [categories, featuredCategory, recent, plan, popularSetting] = await Promise.all([
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
      prisma.setting.findUnique({ where: { key: `landing.popularSearches:${country.code}` } }),
    ]);

    const featured = featuredCategory
      ? await prisma.mockTest.findMany({
          where: { ...base, categoryId: featuredCategory.id },
          orderBy: [{ isFree: 'desc' }, { title: 'asc' }],
          take: 4,
          include: mockTestInclude,
        })
      : [];

    let popular: string[] = Array.isArray(popularSetting?.value) ? (popularSetting.value as string[]) : [];
    if (popular.length === 0) {
      // No curated list: fall back to the professions with the most published tests.
      const professions = await prisma.profession.findMany({
        where: { category: { countryCode: country.code }, exams: { some: { mockTests: { some: PUBLISHED } } } },
        include: { exams: { include: { _count: { select: { mockTests: { where: PUBLISHED } } } } } },
      });
      popular = professions
        .map((p) => ({ name: p.name, n: p.exams.reduce((s, e) => s + e._count.mockTests, 0) }))
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
        .slice(0, 5)
        .map((p) => p.name);
    }

    res.json({
      country: { code: country.code, name: country.name, disclaimer: country.disclaimer, languages: country.languages },
      popularSearches: popular,
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

    const where: Prisma.MockTestWhereInput = {
      countryCode: country.code,
      ...PUBLISHED,
      ...(f.category && { category: { slug: f.category } }),
      ...(f.price && { isFree: f.price === 'free' }),
      ...(f.difficulty && { difficulty: f.difficulty }),
      ...(f.language && { languages: { has: f.language } }),
      ...(f.subject && { questions: { some: { ...PUBLISHED, topic: { slug: f.subject } } } }),
      ...(wordFilters.length > 0 && { AND: wordFilters }),
    };

    const orderBy: Prisma.MockTestOrderByWithRelationInput[] =
      f.sort === 'recent' ? [{ publishedAt: 'desc' }, { title: 'asc' }]
      : f.sort === 'title' ? [{ title: 'asc' }]
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

  /** "Request this exam": the demand signal behind the admin's "requested 7 times" alert. */
  router.post('/exam-requests', async (req, res) => {
    const country = await liveCountry(req);
    const body = examRequestSchema.parse(req.body);
    let phone: string | null = null;
    if (body.phone) {
      phone = normalizePhone(body.phone, country.dialCode);
      if (!phone) throw badRequest('invalid_phone');
    }
    await prisma.examRequest.create({
      data: { countryCode: country.code, query: body.query, phone: phone ?? req.user?.phone ?? null },
    });
    res.status(201).json({ ok: true });
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
            where: { userId: req.user.id, mockTestId: test.id, status: { not: 'IN_PROGRESS' } },
            orderBy: { submittedAt: 'desc' }, take: 5,
          })
        : Promise.resolve([]),
    ]);

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
      freeSample: sample && { slug: sample.slug, title: sample.title, questionCount: sample._count.questions },
      previousAttempts: attempts.map((a) => ({
        id: a.id,
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
