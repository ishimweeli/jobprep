import type { Prisma, PrismaClient } from '@prisma/client';
import { ALL_TESTS, buildPayload, slugify } from './seed-lib';
import { DELETED_MOCK_TESTS_KEY, deletedKey, deletedSet } from '../src/domain/deletedContent';

/**
 * Additive-only content sync for an already-live database: adds mock tests (and their professions/exams/
 * sections/cases/questions/topics) defined in `seed-data/*` that don't exist yet, by slug. Never touches
 * countries, payment methods, admin accounts, settings. Safe to run repeatedly — already-current rows are
 * left untouched and simply counted as "skipped". Categories must already exist (this never invents one);
 * if a TestDef references a category that isn't there, it throws rather than silently creating one that
 * could drift from the canonical RW_CATEGORIES / KE_CATEGORIES list in seed-lib.ts.
 *
 * For a MockTest that already exists, this can still ADD newly-written questions, never remove or edit
 * published ones: a TestDef question whose stem is not on the mock yet (in any status) is inserted after
 * the existing ones. Removing questions is `revise-content`'s job. It also refreshes `durationMinutes`, `totalMarks`
 * and `jobDeadlineAt` / `jobPostedAt` from the TestDef so those stay in sync once new questions arrive, or a deadline that
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
  const skippedDeleted: string[] = [];
  // Tests an admin deleted for good stay deleted, even though they are still in seed-data.
  const deleted = deletedSet((await prisma.setting.findUnique({ where: { key: DELETED_MOCK_TESTS_KEY } }))?.value);

  for (const t of ALL_TESTS) {
    if (deleted.has(deletedKey(t.country, t.slug))) {
      skippedDeleted.push(t.slug);
      continue;
    }
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
      // New questions are only ever appended to a TestDef, so "new" = after the last seed question already on the
      // mock (matched by stem, in any status) and not on it yet. Matching by stem rather than by count, because
      // revise-content archives removed questions; looking only past the last match keeps a question an admin
      // re-worded mid-mock from coming back as a duplicate.
      const existing = await prisma.question.findMany({ where: { mockTestId: existingMock.id }, select: { stem: true, sortOrder: true, status: true } });
      const existingStems = new Set(existing.map((q) => q.stem.trim()));
      const existingCount = existing.reduce((max, q) => Math.max(max, q.sortOrder + 1), 0);
      const newDeadline = t.jobDeadlineAt ? new Date(t.jobDeadlineAt) : null;
      const newPosted = t.jobPostedAt ? new Date(t.jobPostedAt) : null;
      const deadlineChanged = (newDeadline?.getTime() ?? null) !== (existingMock.jobDeadlineAt?.getTime() ?? null)
        || (newPosted?.getTime() ?? null) !== (existingMock.jobPostedAt?.getTime() ?? null);
      let lastMatched = -1;
      t.questions.forEach((q, i) => { if (existingStems.has(q.stem.trim())) lastMatched = i; });
      let toAdd = t.questions.slice(lastMatched + 1).filter((q) => !existingStems.has(q.stem.trim()));
      // A mock still short of its seed size (e.g. some questions never reached this database) also gets the seed
      // questions missing mid-list — but only up to the seed size, so a question an admin re-worded (same count,
      // different stem) is never added back as a duplicate.
      const published = existing.filter((q) => q.status === 'PUBLISHED').length;
      if (published + toAdd.length < t.questions.length) {
        toAdd = t.questions.filter((q) => !existingStems.has(q.stem.trim())).slice(0, t.questions.length - published);
      }

      if (toAdd.length === 0) {
        if (deadlineChanged || existingMock.durationMinutes !== t.minutes || Number(existingMock.totalMarks) !== totalMarks) {
          await prisma.mockTest.update({
            where: { id: existingMock.id },
            data: { durationMinutes: t.minutes, totalMarks, jobDeadlineAt: newDeadline, jobPostedAt: newPosted },
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
        data: { durationMinutes: t.minutes, totalMarks, jobDeadlineAt: newDeadline, jobPostedAt: newPosted },
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
        jobPostedAt: t.jobPostedAt ? new Date(t.jobPostedAt) : null,
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

  return { mockTestsAdded, mockTestsSkipped, mockTestsUpdated, questionsAdded, questionsAddedToExisting, addedSlugs, updatedSlugs, skippedDeleted };
}
