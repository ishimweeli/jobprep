import type { Prisma, PrismaClient } from '@prisma/client';
import { ALL_TESTS, buildPayload, slugify } from './seed-lib';

/**
 * Additive-only content sync for an already-live database: adds mock tests (and their professions/exams/
 * sections/cases/questions/topics) defined in `seed-data/*` that don't exist yet, by slug. Never touches
 * countries, payment methods, admin accounts, settings. Safe to run repeatedly — already-current rows are
 * left untouched and simply counted as "skipped". Categories must already exist (this never invents one);
 * if a TestDef references a category that isn't there, it throws rather than silently creating one that
 * could drift from the canonical RW_CATEGORIES / KE_CATEGORIES list in seed-lib.ts.
 *
 * For a MockTest that already exists, this can still ADD newly-written questions, never remove or edit
 * published ones: if a TestDef's `questions` array has grown since it was last synced (every seed-data
 * agent in this project is instructed to only append, never reorder), the extra ones at the end are
 * inserted, continuing sortOrder from the current count. It also refreshes `durationMinutes`, `totalMarks`
 * and `jobDeadlineAt` from the TestDef so those stay in sync once new questions arrive, or a deadline that
 * was missing gets filled in. New questions must land in a section/case that's already live on that
 * mock (by name/title) — a TestDef that introduces a brand-new section or case on an existing mock throws,
 * since this function never creates new Section/Case rows on an already-published MockTest.
 */
export async function syncContent(prisma: PrismaClient) {
  let mockTestsAdded = 0;
  let mockTestsSkipped = 0;
  let mockTestsUpdated = 0;
  let questionsAdded = 0;
  let questionsAddedToExisting = 0;
  const addedSlugs: string[] = [];
  const updatedSlugs: string[] = [];

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
    const totalMarks = t.questions.reduce((sum, q) => sum + (q.marks ?? 1), 0);

    if (existingMock) {
      const existingCount = await prisma.question.count({ where: { mockTestId: existingMock.id } });
      const newDeadline = t.jobDeadlineAt ? new Date(t.jobDeadlineAt) : null;
      const deadlineChanged = (newDeadline?.getTime() ?? null) !== (existingMock.jobDeadlineAt?.getTime() ?? null);
      const toAdd = t.questions.slice(existingCount);

      if (toAdd.length === 0) {
        if (deadlineChanged || existingMock.durationMinutes !== t.minutes || Number(existingMock.totalMarks) !== totalMarks) {
          await prisma.mockTest.update({
            where: { id: existingMock.id },
            data: { durationMinutes: t.minutes, totalMarks, jobDeadlineAt: newDeadline },
          });
          mockTestsUpdated++;
          updatedSlugs.push(`${t.slug} (metadata only)`);
        } else {
          mockTestsSkipped++;
        }
        continue;
      }

      const [existingSections, existingCases] = await Promise.all([
        prisma.section.findMany({ where: { mockTestId: existingMock.id } }),
        prisma.case.findMany({ where: { mockTestId: existingMock.id } }),
      ]);
      const sectionId = new Map(existingSections.map((s) => [s.name, s.id]));
      const caseId = new Map(existingCases.map((c) => [c.title, c.id]));
      for (const c of t.cases ?? []) {
        if (toAdd.some((q) => q.caseKey === c.key) && !caseId.has(c.title)) {
          throw new Error(`Mock "${t.slug}" has new questions for case "${c.key}" (title "${c.title}"), but no case with that ` +
            'title exists on the already-published mock. sync-content never creates a new Case on an existing MockTest — ' +
            'only append questions into sections/cases that are already live.');
        }
      }

      let qOrder = existingCount;
      for (const q of toAdd) {
        const sid = sectionId.get(q.section);
        if (!sid) {
          throw new Error(`Mock "${t.slug}" has a new question in section "${q.section}", but no section with that name exists ` +
            'on the already-published mock. sync-content never creates a new Section on an existing MockTest — only append ' +
            'questions into sections that are already live.');
        }
        const topic = await prisma.topic.upsert({
          where: { categoryId_slug: { categoryId: category.id, slug: slugify(q.topic) } },
          update: {},
          create: { categoryId: category.id, slug: slugify(q.topic), name: q.topic },
        });
        const { type, payload } = buildPayload(q);
        await prisma.question.create({
          data: {
            mockTestId: existingMock.id, sectionId: sid, topicId: topic.id,
            caseId: q.caseKey ? (caseId.get((t.cases ?? []).find((c) => c.key === q.caseKey)!.title) ?? null) : null,
            type, stem: q.stem, payload: payload as unknown as Prisma.InputJsonValue,
            explanation: q.explanation, marks: q.marks ?? 1, sortOrder: qOrder++, status: 'PUBLISHED',
          },
        });
        questionsAddedToExisting++;
      }

      await prisma.mockTest.update({
        where: { id: existingMock.id },
        data: { durationMinutes: t.minutes, totalMarks, jobDeadlineAt: newDeadline },
      });
      mockTestsUpdated++;
      updatedSlugs.push(`${t.slug} (+${toAdd.length} questions)`);
      continue;
    }

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

  return { mockTestsAdded, mockTestsSkipped, mockTestsUpdated, questionsAdded, questionsAddedToExisting, addedSlugs, updatedSlugs };
}
