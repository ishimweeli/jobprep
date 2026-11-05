import type { Prisma, PrismaClient } from '@prisma/client';
import { ALL_TESTS, buildPayload, slugify } from './seed-lib';

/**
 * Additive-only content sync for an already-live database: adds mock tests (and their professions/exams/
 * sections/cases/questions/topics) defined in `seed-data/*` that don't exist yet, by slug. Never touches
 * countries, payment methods, admin accounts, settings, or any MockTest that already exists (so an admin's
 * edits to published content are never overwritten). Safe to run repeatedly — already-present rows are
 * left untouched and simply counted as "skipped". Categories must already exist (this never invents one);
 * if a TestDef references a category that isn't there, it throws rather than silently creating one that
 * could drift from the canonical RW_CATEGORIES / KE_CATEGORIES list in seed-lib.ts.
 */
export async function syncContent(prisma: PrismaClient) {
  let mockTestsAdded = 0;
  let mockTestsSkipped = 0;
  let questionsAdded = 0;
  const addedSlugs: string[] = [];

  for (const t of ALL_TESTS) {
    const category = await prisma.category.findUnique({
      where: { countryCode_slug: { countryCode: t.country, slug: t.category } },
    });
    if (!category) {
      throw new Error(`Category "${t.category}" (${t.country}) does not exist in this database for test "${t.slug}". ` +
        'Categories are never auto-created by sync-content — add it via the canonical category list first.');
    }

    const profession = await prisma.profession.upsert({
      where: { categoryId_slug: { categoryId: category.id, slug: t.profession.slug } },
      update: {},
      create: { categoryId: category.id, slug: t.profession.slug, name: t.profession.name },
    });

    const examSlug = `${t.country.toLowerCase()}-${t.profession.slug}`;
    const authority = t.authority
      ? await prisma.authority.findUnique({ where: { countryCode_shortName: { countryCode: t.country, shortName: t.authority } } })
      : null;
    const exam = await prisma.exam.upsert({
      where: { slug: examSlug },
      update: {},
      create: { professionId: profession.id, authorityId: authority?.id ?? null, slug: examSlug, name: t.profession.name },
    });

    const existingMock = await prisma.mockTest.findUnique({
      where: { countryCode_slug: { countryCode: t.country, slug: t.slug } },
    });
    if (existingMock) {
      mockTestsSkipped++;
      continue;
    }

    const totalMarks = t.questions.reduce((sum, q) => sum + (q.marks ?? 1), 0);
    const mock = await prisma.mockTest.create({
      data: {
        examId: exam.id, countryCode: t.country, categoryId: category.id, slug: t.slug, title: t.title,
        summary: t.summary, status: 'PUBLISHED', isFree: t.free, difficulty: t.difficulty,
        languages: ['en'],
        durationMinutes: t.minutes, totalMarks,
        negativeMarkPerWrong: 0,
        instructions: [
          'The timer starts when you press Start Mock Test and cannot be paused.',
          'There is no negative marking.',
          'Flag questions to come back to them. You can change any answer before you submit.',
          'Answers save automatically. If your connection drops, reopen the test and continue where you stopped.',
          'When time runs out, your answers are submitted automatically.',
        ],
        publishedAt: new Date(),
        jobDeadlineAt: t.jobDeadlineAt ? new Date(t.jobDeadlineAt) : null,
      },
    });

    const sectionId = new Map<string, string>();
    let sOrder = 0;
    for (const s of t.sections) {
      const sec = await prisma.section.create({
        data: { mockTestId: mock.id, name: s.name, questionTypeLabel: s.label ?? 'Multiple choice', sortOrder: sOrder++ },
      });
      sectionId.set(s.name, sec.id);
    }

    const caseId = new Map<string, string>();
    let cOrder = 0;
    for (const c of t.cases ?? []) {
      const created = await prisma.case.create({
        data: {
          mockTestId: mock.id, title: c.title, passage: c.passage, notes: c.notes, sortOrder: cOrder++,
          tables: c.tables as unknown as Prisma.InputJsonValue,
        },
      });
      caseId.set(c.key, created.id);
    }

    let qOrder = 0;
    for (const q of t.questions) {
      const topic = await prisma.topic.upsert({
        where: { categoryId_slug: { categoryId: category.id, slug: slugify(q.topic) } },
        update: {},
        create: { categoryId: category.id, slug: slugify(q.topic), name: q.topic },
      });
      const { type, payload } = buildPayload(q);
      await prisma.question.create({
        data: {
          mockTestId: mock.id, sectionId: sectionId.get(q.section)!, topicId: topic.id,
          caseId: q.caseKey ? caseId.get(q.caseKey)! : null,
          type, stem: q.stem, payload: payload as unknown as Prisma.InputJsonValue,
          explanation: q.explanation, marks: q.marks ?? 1, sortOrder: qOrder++, status: 'PUBLISHED',
        },
      });
      questionsAdded++;
    }

    mockTestsAdded++;
    addedSlugs.push(t.slug);
  }

  return { mockTestsAdded, mockTestsSkipped, questionsAdded, addedSlugs };
}
