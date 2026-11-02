import { Router } from 'express';
import type { Prisma, QuestionType } from '@prisma/client';
import { z } from 'zod';
import { assertCountry, requirePermission, type AdminPrincipal } from '../../admin/auth';
import { writeAudit } from '../../admin/audit';
import { validateQuestionCsv, type ImportReport } from '../../admin/csv';
import type { QuestionPayload } from '../../domain/scoring';
import type { Ctx } from '../../http/context';
import { badRequest, conflict, HttpError, notFound } from '../../http/errors';
import { countryCodes, inCodes, pageSchema } from './util';

const DIFFICULTY = z.enum(['FOUNDATION', 'STANDARD', 'CHALLENGING']);
const KEY = z.string().regex(/^[A-F]$/);

const questionFields = {
  stem: z.string().trim().min(5).max(2000),
  options: z.array(z.object({ key: KEY, text: z.string().trim().min(1).max(500) })).min(2).max(6),
  correct: z.array(KEY).min(1).max(6),
  type: z.enum(['SINGLE_CHOICE', 'MULTIPLE_SELECT', 'CASE_BASED']).optional(),
  scoring: z.enum(['ALL_OR_NOTHING', 'PARTIAL']).optional(),
  choose: z.number().int().min(1).max(6).nullable().optional(),
  explanation: z.string().trim().min(10).max(4000),
  topicId: z.string().min(1),
  caseId: z.string().min(1).nullable().optional(),
  marks: z.number().positive().max(20),
  difficulty: DIFFICULTY,
  status: z.enum(['DRAFT', 'PUBLISHED']),
};
const createQuestion = z.object({ ...questionFields, sectionId: z.string().min(1), status: questionFields.status.default('DRAFT'), difficulty: DIFFICULTY.default('STANDARD'), marks: questionFields.marks.default(1) });
const patchQuestion = z.object({ ...questionFields, sectionId: z.string().min(1) }).partial().extend({ resolveReports: z.boolean().optional() });

const mockTestFields = {
  title: z.string().trim().min(5).max(200),
  summary: z.string().trim().max(1000),
  categoryId: z.string().min(1),
  examId: z.string().min(1),
  professionId: z.string().min(1),
  isFree: z.boolean(),
  difficulty: DIFFICULTY,
  durationMinutes: z.number().int().min(1).max(300),
  languages: z.array(z.string().min(2).max(5)).min(1).max(4),
  instructions: z.array(z.string().trim().min(1).max(300)).max(12),
  negativeMarkPerWrong: z.number().min(0).max(5),
  passMarkPercent: z.number().min(1).max(100).nullable(),
  passMarkSource: z.string().trim().min(5).max(300).nullable(),
};
const createMockTest = z.object({
  ...mockTestFields,
  examId: mockTestFields.examId.optional(), professionId: mockTestFields.professionId.optional(),
  summary: mockTestFields.summary.default(''), isFree: mockTestFields.isFree.default(false), difficulty: DIFFICULTY.default('STANDARD'),
  languages: mockTestFields.languages.default(['en']), instructions: mockTestFields.instructions.default([]),
  negativeMarkPerWrong: mockTestFields.negativeMarkPerWrong.default(0),
  passMarkPercent: mockTestFields.passMarkPercent.default(null), passMarkSource: mockTestFields.passMarkSource.default(null),
});
const patchMockTest = z.object({
  title: mockTestFields.title, summary: mockTestFields.summary, isFree: mockTestFields.isFree, difficulty: DIFFICULTY,
  durationMinutes: mockTestFields.durationMinutes, languages: mockTestFields.languages, instructions: mockTestFields.instructions,
  negativeMarkPerWrong: mockTestFields.negativeMarkPerWrong, passMarkPercent: mockTestFields.passMarkPercent, passMarkSource: mockTestFields.passMarkSource,
  categoryId: mockTestFields.categoryId,
}).partial();

const slugify = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/** Turn the editor's fields into the stored payload, enforcing the rules each question type has. */
export function buildQuestion(input: {
  options: { key: string; text: string }[]; correct: string[]; type?: QuestionType; scoring?: 'ALL_OR_NOTHING' | 'PARTIAL';
  choose?: number | null; caseId?: string | null;
}): { type: QuestionType; payload: QuestionPayload } {
  const keys = input.options.map((o) => o.key);
  if (new Set(keys).size !== keys.length) throw badRequest('duplicate_option_keys');
  const correct = [...new Set(input.correct)];
  if (correct.some((k) => !keys.includes(k))) throw badRequest('correct_not_an_option');

  let type: QuestionType = input.type ?? (correct.length > 1 ? 'MULTIPLE_SELECT' : input.caseId ? 'CASE_BASED' : 'SINGLE_CHOICE');
  if (type === 'SINGLE_CHOICE' && input.caseId) type = 'CASE_BASED';
  if (type === 'CASE_BASED' && !input.caseId) throw badRequest('case_required');
  if (type !== 'CASE_BASED' && input.caseId) throw badRequest('case_not_allowed');
  if (type !== 'MULTIPLE_SELECT' && correct.length !== 1) throw badRequest('exactly_one_correct_answer');

  const payload: QuestionPayload = { options: input.options.map((o) => ({ key: o.key, text: o.text })), correct: correct.sort() };
  if (type === 'MULTIPLE_SELECT') {
    payload.scoring = input.scoring ?? 'ALL_OR_NOTHING';
    if (input.choose != null) {
      if (input.choose < correct.length || input.choose > keys.length) throw badRequest('invalid_choose');
      payload.choose = input.choose;
    }
  }
  return { type, payload };
}

export function adminExamsRouter(ctx: Ctx) {
  const router = Router();
  const { prisma, now } = ctx;

  const loadTest = async (id: string, admin: AdminPrincipal) => {
    const t = await prisma.mockTest.findUnique({ where: { id }, include: { category: true } });
    if (!t) throw notFound('mock_test_not_found');
    assertCountry(admin, t.countryCode, 'mock_test_not_found');
    return t;
  };
  const loadQuestion = async (id: string, admin: AdminPrincipal) => {
    const q = await prisma.question.findUnique({ where: { id }, include: { mockTest: { include: { category: true } } } });
    if (!q) throw notFound('question_not_found');
    assertCountry(admin, q.mockTest.countryCode, 'question_not_found');
    return q;
  };
  const checkRefs = async (test: { id: string; categoryId: string }, refs: { topicId?: string; sectionId?: string; caseId?: string | null }) => {
    if (refs.topicId && !(await prisma.topic.findFirst({ where: { id: refs.topicId, categoryId: test.categoryId } }))) throw badRequest('topic_not_in_category');
    if (refs.sectionId && !(await prisma.section.findFirst({ where: { id: refs.sectionId, mockTestId: test.id } }))) throw badRequest('section_not_in_test');
    if (refs.caseId && !(await prisma.case.findFirst({ where: { id: refs.caseId, mockTestId: test.id } }))) throw badRequest('case_not_in_test');
  };

  // ───────────────────────── Exams list (design: "90 mock tests · 4,310 questions · 6 categories")

  router.get('/exams', requirePermission('exams:read'), async (req, res) => {
    const f = pageSchema.extend({
      q: z.string().trim().max(80).optional(), category: z.string().max(80).optional(), country: z.string().length(2).optional(),
      status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    }).parse(req.query);
    const codes = countryCodes(req.admin!, f.country);
    const where: Prisma.MockTestWhereInput = {
      countryCode: inCodes(codes),
      ...(f.status && { status: f.status }),
      ...(f.category && { category: { slug: f.category } }),
      ...(f.q && { OR: [{ title: { contains: f.q, mode: 'insensitive' } }, { category: { name: { contains: f.q, mode: 'insensitive' } } }] }),
    };
    const [total, tests, allTests, questions, categories] = await Promise.all([
      prisma.mockTest.count({ where }),
      prisma.mockTest.findMany({
        where, orderBy: [{ category: { sortOrder: 'asc' } }, { title: 'asc' }], skip: (f.page - 1) * f.pageSize, take: f.pageSize,
        include: { category: { select: { name: true, slug: true } }, _count: { select: { questions: { where: { status: { not: 'ARCHIVED' } } } } } },
      }),
      prisma.mockTest.count({ where: { countryCode: inCodes(codes), status: { not: 'ARCHIVED' } } }),
      prisma.question.count({ where: { mockTest: { countryCode: inCodes(codes) }, status: { not: 'ARCHIVED' } } }),
      prisma.category.count({ where: { countryCode: inCodes(codes) } }),
    ]);
    const reports = await prisma.questionReport.groupBy({
      by: ['questionId'], where: { status: 'OPEN', question: { mockTestId: { in: tests.map((t) => t.id) } } }, _count: { _all: true },
    });
    const owners = await prisma.question.findMany({ where: { id: { in: reports.map((r) => r.questionId) } }, select: { id: true, mockTestId: true } });
    const reportsByTest = new Map<string, number>();
    for (const r of reports) {
      const tid = owners.find((o) => o.id === r.questionId)?.mockTestId;
      if (tid) reportsByTest.set(tid, (reportsByTest.get(tid) ?? 0) + r._count._all);
    }
    res.json({
      total, page: f.page, pageSize: f.pageSize,
      totals: { mockTests: allTests, questions, categories },
      results: tests.map((t) => ({
        id: t.id, slug: t.slug, title: t.title, countryCode: t.countryCode, category: t.category, isFree: t.isFree, status: t.status,
        questionCount: t._count.questions, durationMinutes: t.durationMinutes, openReports: reportsByTest.get(t.id) ?? 0,
      })),
    });
  });

  /** Dropdown data for the test form and the question editor. */
  router.get('/catalog-options', requirePermission('exams:read'), async (req, res) => {
    const { country } = z.object({ country: z.string().length(2).optional() }).parse(req.query);
    const codes = countryCodes(req.admin!, country);
    const [categories, professions, authorities] = await Promise.all([
      prisma.category.findMany({ where: { countryCode: inCodes(codes) }, orderBy: [{ countryCode: 'asc' }, { sortOrder: 'asc' }], include: { topics: { orderBy: { name: 'asc' } } } }),
      prisma.profession.findMany({ where: { category: { countryCode: inCodes(codes) } }, orderBy: { name: 'asc' }, include: { exams: { select: { id: true } } } }),
      prisma.authority.findMany({ where: { countryCode: inCodes(codes) }, orderBy: { shortName: 'asc' } }),
    ]);
    res.json({
      categories: categories.map((c) => ({ id: c.id, countryCode: c.countryCode, slug: c.slug, name: c.name, topics: c.topics.map((t) => ({ id: t.id, name: t.name })) })),
      professions: professions.map((p) => ({ id: p.id, categoryId: p.categoryId, name: p.name, examId: p.exams[0]?.id ?? null })),
      authorities: authorities.map((a) => ({ id: a.id, countryCode: a.countryCode, shortName: a.shortName, name: a.name })),
    });
  });

  // ───────────────────────── Mock test

  router.get('/mock-tests/:id', requirePermission('exams:read'), async (req, res) => {
    const t = await loadTest(String(req.params.id), req.admin!);
    const [sections, questions, cases, reports] = await Promise.all([
      prisma.section.findMany({ where: { mockTestId: t.id }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { questions: { where: { status: { not: 'ARCHIVED' } } } } } } }),
      prisma.question.findMany({
        where: { mockTestId: t.id, status: { not: 'ARCHIVED' } }, orderBy: { sortOrder: 'asc' },
        include: { section: { select: { name: true } }, topic: { select: { name: true } } },
      }),
      prisma.case.findMany({ where: { mockTestId: t.id }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true } }),
      prisma.questionReport.groupBy({ by: ['questionId'], where: { status: 'OPEN', question: { mockTestId: t.id } }, _count: { _all: true } }),
    ]);
    const reportCount = new Map(reports.map((r) => [r.questionId, r._count._all]));
    res.json({
      mockTest: {
        id: t.id, slug: t.slug, title: t.title, summary: t.summary, status: t.status, isFree: t.isFree, difficulty: t.difficulty,
        durationMinutes: t.durationMinutes, languages: t.languages, instructions: t.instructions, countryCode: t.countryCode,
        negativeMarkPerWrong: Number(t.negativeMarkPerWrong), passMarkPercent: t.passMarkPercent === null ? null : Number(t.passMarkPercent),
        passMarkSource: t.passMarkSource, category: { id: t.category.id, name: t.category.name }, publishedAt: t.publishedAt,
      },
      sections: sections.map((s) => ({ id: s.id, name: s.name, questionTypeLabel: s.questionTypeLabel, sortOrder: s.sortOrder, questionCount: s._count.questions })),
      cases,
      questions: questions.map((q, i) => ({
        id: q.id, number: i + 1, stem: q.stem, type: q.type, status: q.status, section: q.section.name, topic: q.topic.name,
        marks: Number(q.marks), openReports: reportCount.get(q.id) ?? 0,
      })),
    });
  });

  router.post('/mock-tests', requirePermission('exams:write'), async (req, res) => {
    const b = createMockTest.parse(req.body);
    const category = await prisma.category.findUnique({ where: { id: b.categoryId } });
    if (!category) throw badRequest('category_not_found');
    assertCountry(req.admin!, category.countryCode, 'category_not_found');
    if ((b.passMarkPercent === null) !== (b.passMarkSource === null)) throw badRequest('pass_mark_needs_percent_and_source');

    let examId = b.examId;
    if (!examId) {
      if (!b.professionId) throw badRequest('exam_or_profession_required');
      const profession = await prisma.profession.findFirst({ where: { id: b.professionId, categoryId: category.id } });
      if (!profession) throw badRequest('profession_not_in_category');
      const slug = `${category.countryCode.toLowerCase()}-${profession.slug}`;
      examId = (await prisma.exam.upsert({ where: { slug }, update: {}, create: { professionId: profession.id, slug, name: profession.name } })).id;
    } else if (!(await prisma.exam.findFirst({ where: { id: examId, profession: { categoryId: category.id } } }))) {
      throw badRequest('exam_not_in_category');
    }

    let slug = slugify(b.title);
    for (let n = 2; await prisma.mockTest.findUnique({ where: { countryCode_slug: { countryCode: category.countryCode, slug } } }); n++) slug = `${slugify(b.title)}-${n}`;
    const t = await prisma.$transaction(async (tx) => {
      const created = await tx.mockTest.create({
        data: {
          examId: examId!, countryCode: category.countryCode, categoryId: category.id, slug, title: b.title, summary: b.summary, status: 'DRAFT',
          isFree: b.isFree, difficulty: b.difficulty, languages: b.languages, durationMinutes: b.durationMinutes, totalMarks: 0,
          negativeMarkPerWrong: b.negativeMarkPerWrong, passMarkPercent: b.passMarkPercent, passMarkSource: b.passMarkSource, instructions: b.instructions,
        },
      });
      await writeAudit(tx, req.admin!, { action: 'mock_test.create', entityType: 'mock_test', entityId: created.id, countryCode: created.countryCode, metadata: { title: created.title } });
      return created;
    });
    res.status(201).json({ id: t.id, slug: t.slug, status: t.status });
  });

  router.patch('/mock-tests/:id', requirePermission('exams:write'), async (req, res) => {
    const b = patchMockTest.parse(req.body);
    const t = await loadTest(String(req.params.id), req.admin!);
    const pm = 'passMarkPercent' in b ? b.passMarkPercent : (t.passMarkPercent === null ? null : Number(t.passMarkPercent));
    const ps = 'passMarkSource' in b ? b.passMarkSource : t.passMarkSource;
    // An official pass mark needs its source; neither without the other.
    if ((pm == null) !== (ps == null)) throw badRequest('pass_mark_needs_percent_and_source');
    if (b.categoryId && b.categoryId !== t.categoryId) {
      const c = await prisma.category.findUnique({ where: { id: b.categoryId } });
      if (!c || c.countryCode !== t.countryCode) throw badRequest('category_not_in_country');
    }
    await prisma.$transaction(async (tx) => {
      await tx.mockTest.update({ where: { id: t.id }, data: { ...b } });
      await writeAudit(tx, req.admin!, { action: 'mock_test.update', entityType: 'mock_test', entityId: t.id, countryCode: t.countryCode, metadata: { title: b.title ?? t.title, fields: Object.keys(b) } });
    });
    res.json({ ok: true });
  });

  /** Publishing is checked: a test with nothing to answer cannot go live. */
  router.post('/mock-tests/:id/publish', requirePermission('exams:write'), async (req, res) => {
    const t = await loadTest(String(req.params.id), req.admin!);
    const published = await prisma.question.count({ where: { mockTestId: t.id, status: 'PUBLISHED' } });
    const problems: string[] = [];
    if (published === 0) problems.push('no_published_questions');
    if (t.title.trim().length < 5) problems.push('title_missing');
    if (problems.length > 0) throw new HttpError(409, 'publish_blocked', { problems });
    await prisma.$transaction(async (tx) => {
      const marks = await tx.question.aggregate({ where: { mockTestId: t.id, status: 'PUBLISHED' }, _sum: { marks: true } });
      await tx.mockTest.update({ where: { id: t.id }, data: { status: 'PUBLISHED', publishedAt: t.publishedAt ?? now(), totalMarks: marks._sum.marks ?? 0 } });
      await writeAudit(tx, req.admin!, { action: 'mock_test.publish', entityType: 'mock_test', entityId: t.id, countryCode: t.countryCode, metadata: { title: t.title, questions: published } });
    });
    res.json({ ok: true, status: 'PUBLISHED', questions: published });
  });

  router.post('/mock-tests/:id/archive', requirePermission('exams:write'), async (req, res) => {
    const t = await loadTest(String(req.params.id), req.admin!);
    await prisma.$transaction(async (tx) => {
      await tx.mockTest.update({ where: { id: t.id }, data: { status: 'ARCHIVED' } });
      await writeAudit(tx, req.admin!, { action: 'mock_test.archive', entityType: 'mock_test', entityId: t.id, countryCode: t.countryCode, metadata: { title: t.title } });
    });
    res.json({ ok: true, status: 'ARCHIVED' });
  });

  // ───────────────────────── Questions

  router.get('/questions/:id', requirePermission('exams:read'), async (req, res) => {
    const q = await loadQuestion(String(req.params.id), req.admin!);
    const p = q.payload as unknown as QuestionPayload;
    const [reports, answers, correct, edit, siblings, topic, caseRow, section] = await Promise.all([
      prisma.questionReport.findMany({ where: { questionId: q.id, status: 'OPEN' }, orderBy: { createdAt: 'desc' }, select: { id: true, message: true, createdAt: true } }),
      prisma.attemptAnswer.count({ where: { questionId: q.id, isCorrect: { not: null } } }),
      prisma.attemptAnswer.count({ where: { questionId: q.id, isCorrect: true } }),
      prisma.auditLog.findFirst({ where: { entityType: 'question', entityId: q.id, action: { in: ['question.update', 'question.create'] } }, orderBy: { createdAt: 'desc' }, include: { actor: { select: { name: true } } } }),
      prisma.question.findMany({ where: { mockTestId: q.mockTestId, status: { not: 'ARCHIVED' } }, orderBy: { sortOrder: 'asc' }, select: { id: true } }),
      prisma.topic.findUnique({ where: { id: q.topicId }, select: { id: true, name: true } }),
      q.caseId ? prisma.case.findUnique({ where: { id: q.caseId }, select: { id: true, title: true } }) : Promise.resolve(null),
      prisma.section.findUnique({ where: { id: q.sectionId }, select: { id: true, name: true } }),
    ]);
    const idx = siblings.findIndex((s) => s.id === q.id);
    res.json({
      question: {
        id: q.id, type: q.type, status: q.status, stem: q.stem, explanation: q.explanation, marks: Number(q.marks), difficulty: q.difficulty, version: q.version,
        options: p.options.map((o) => ({ key: o.key, text: o.text, correct: p.correct.includes(o.key) })),
        scoring: p.scoring ?? null, choose: p.choose ?? null, topic, section, case: caseRow,
      },
      mockTest: { id: q.mockTest.id, title: q.mockTest.title, isFree: q.mockTest.isFree, status: q.mockTest.status, countryCode: q.mockTest.countryCode },
      position: { number: idx + 1, total: siblings.length, previousId: siblings[idx - 1]?.id ?? null, nextId: siblings[idx + 1]?.id ?? null },
      reports, // "Reported by 2 candidates"
      stats: { attempts: answers, correctPercent: answers === 0 ? null : Math.round((correct / answers) * 100) },
      lastEdited: edit && { by: edit.actor?.name ?? null, at: edit.createdAt },
    });
  });

  router.patch('/questions/:id', requirePermission('exams:write'), async (req, res) => {
    const b = patchQuestion.parse(req.body);
    const q = await loadQuestion(String(req.params.id), req.admin!);
    if (b.resolveReports && !req.admin!.permissions.includes('reports:resolve')) throw new HttpError(403, 'admin_forbidden');
    await checkRefs(q.mockTest, { topicId: b.topicId, sectionId: b.sectionId, caseId: b.caseId });

    const current = q.payload as unknown as QuestionPayload;
    const caseId = 'caseId' in b ? (b.caseId ?? null) : q.caseId;
    const { type, payload } = buildQuestion({
      options: b.options ?? current.options, correct: b.correct ?? current.correct,
      type: b.type ?? (b.options || b.correct || 'caseId' in b ? undefined : q.type), scoring: b.scoring ?? current.scoring,
      choose: 'choose' in b ? b.choose : current.choose, caseId,
    });
    await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: q.id },
        data: {
          type, payload: payload as unknown as Prisma.InputJsonValue, caseId, version: { increment: 1 },
          ...(b.stem !== undefined && { stem: b.stem }), ...(b.explanation !== undefined && { explanation: b.explanation }),
          ...(b.topicId !== undefined && { topicId: b.topicId }), ...(b.sectionId !== undefined && { sectionId: b.sectionId }),
          ...(b.marks !== undefined && { marks: b.marks }), ...(b.difficulty !== undefined && { difficulty: b.difficulty }),
          ...(b.status !== undefined && { status: b.status }),
        },
      });
      let resolved = 0;
      if (b.resolveReports) {
        resolved = (await tx.questionReport.updateMany({ where: { questionId: q.id, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedById: req.admin!.id, resolvedAt: now() } })).count;
      }
      await writeAudit(tx, req.admin!, {
        action: 'question.update', entityType: 'question', entityId: q.id, countryCode: q.mockTest.countryCode,
        metadata: { title: q.mockTest.title, fields: Object.keys(b).filter((k) => k !== 'resolveReports'), resolvedReports: resolved },
      });
    });
    res.json({ ok: true });
  });

  router.post('/mock-tests/:id/questions', requirePermission('exams:write'), async (req, res) => {
    const b = createQuestion.parse(req.body);
    const t = await loadTest(String(req.params.id), req.admin!);
    await checkRefs(t, { topicId: b.topicId, sectionId: b.sectionId, caseId: b.caseId });
    const { type, payload } = buildQuestion({ options: b.options, correct: b.correct, type: b.type, scoring: b.scoring, choose: b.choose, caseId: b.caseId ?? null });
    const last = await prisma.question.aggregate({ where: { mockTestId: t.id }, _max: { sortOrder: true } });
    const q = await prisma.$transaction(async (tx) => {
      const created = await tx.question.create({
        data: {
          mockTestId: t.id, sectionId: b.sectionId, topicId: b.topicId, caseId: b.caseId ?? null, type, stem: b.stem,
          payload: payload as unknown as Prisma.InputJsonValue, explanation: b.explanation, marks: b.marks, difficulty: b.difficulty,
          sortOrder: (last._max.sortOrder ?? -1) + 1, status: b.status,
        },
      });
      await writeAudit(tx, req.admin!, { action: 'question.create', entityType: 'question', entityId: created.id, countryCode: t.countryCode, metadata: { title: t.title } });
      return created;
    });
    res.status(201).json({ id: q.id, status: q.status });
  });

  /** "Delete" archives: attempts that already used the question keep their history. */
  router.delete('/questions/:id', requirePermission('exams:write'), async (req, res) => {
    const q = await loadQuestion(String(req.params.id), req.admin!);
    await prisma.$transaction(async (tx) => {
      await tx.question.update({ where: { id: q.id }, data: { status: 'ARCHIVED' } });
      await writeAudit(tx, req.admin!, { action: 'question.archive', entityType: 'question', entityId: q.id, countryCode: q.mockTest.countryCode, metadata: { title: q.mockTest.title } });
    });
    res.json({ ok: true });
  });

  // ───────────────────────── CSV import

  router.post('/mock-tests/:id/import', requirePermission('exams:write'), async (req, res) => {
    const b = z.object({ csv: z.string().min(1), dryRun: z.boolean().default(false), importValidRows: z.boolean().default(false) }).parse(req.body);
    const t = await loadTest(String(req.params.id), req.admin!);
    const [sections, topics, existing] = await Promise.all([
      prisma.section.findMany({ where: { mockTestId: t.id } }),
      prisma.topic.findMany({ where: { categoryId: t.categoryId } }),
      prisma.question.findMany({ where: { mockTestId: t.id, status: { not: 'ARCHIVED' } }, select: { stem: true } }),
    ]);
    const report = validateQuestionCsv(b.csv, { sections: sections.map((s) => s.name), topics: topics.map((x) => x.name), existingStems: existing.map((e) => e.stem) });
    if ('fatal' in report) throw badRequest(report.fatal);
    const summary = (r: ImportReport) => ({ totalRows: r.totalRows, validRows: r.valid.length, invalidRows: r.invalidRows, problems: r.problems });

    if (b.dryRun) return void res.json({ dryRun: true, ...summary(report) });
    if (report.problems.length > 0 && !b.importValidRows) throw new HttpError(409, 'import_has_errors', summary(report));
    if (report.valid.length === 0) throw new HttpError(409, 'nothing_to_import', summary(report));

    const sectionId = new Map(sections.map((s) => [s.name, s.id]));
    const topicId = new Map(topics.map((x) => [x.name, x.id]));
    const last = await prisma.question.aggregate({ where: { mockTestId: t.id }, _max: { sortOrder: true } });
    let order = (last._max.sortOrder ?? -1) + 1;
    await prisma.$transaction(async (tx) => {
      for (const r of report.valid) {
        const { type, payload } = buildQuestion({ options: r.options, correct: r.correct, scoring: r.scoring, choose: r.choose ?? null });
        await tx.question.create({
          data: {
            mockTestId: t.id, sectionId: sectionId.get(r.section)!, topicId: topicId.get(r.topic)!, type, stem: r.stem,
            payload: payload as unknown as Prisma.InputJsonValue, explanation: r.explanation, marks: r.marks, difficulty: r.difficulty,
            sortOrder: order++, status: 'DRAFT', // imported questions wait for a human to read and publish them
          },
        });
      }
      await writeAudit(tx, req.admin!, {
        action: 'csv.import', entityType: 'mock_test', entityId: t.id, countryCode: t.countryCode,
        metadata: { title: t.title, created: report.valid.length, skipped: report.invalidRows },
      });
    });
    res.status(201).json({ dryRun: false, created: report.valid.length, ...summary(report) });
  });

  // ───────────────────────── Candidate reports

  router.get('/reports', requirePermission('exams:read'), async (req, res) => {
    const f = pageSchema.extend({
      status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).default('OPEN'), country: z.string().length(2).optional(),
    }).parse(req.query);
    const codes = countryCodes(req.admin!, f.country);
    const where: Prisma.QuestionReportWhereInput = { status: f.status, question: { mockTest: { countryCode: inCodes(codes) } } };
    const [total, rows] = await Promise.all([
      prisma.questionReport.count({ where }),
      prisma.questionReport.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize,
        include: { question: { select: { id: true, stem: true, sortOrder: true, mockTest: { select: { id: true, title: true } } } } },
      }),
    ]);
    res.json({
      total, page: f.page, status: f.status,
      results: rows.map((r) => ({
        id: r.id, message: r.message, createdAt: r.createdAt, status: r.status,
        question: { id: r.question.id, number: r.question.sortOrder + 1, stem: r.question.stem }, mockTest: r.question.mockTest,
      })),
    });
  });

  const closeReport = (status: 'RESOLVED' | 'DISMISSED') => async (req: import('express').Request, res: import('express').Response) => {
    const r = await prisma.questionReport.findUnique({ where: { id: String(req.params.id) }, include: { question: { include: { mockTest: true } } } });
    if (!r) throw notFound('report_not_found');
    assertCountry(req.admin!, r.question.mockTest.countryCode, 'report_not_found');
    if (r.status !== 'OPEN') throw conflict('report_already_closed');
    await prisma.$transaction(async (tx) => {
      await tx.questionReport.update({ where: { id: r.id }, data: { status, resolvedById: req.admin!.id, resolvedAt: now() } });
      await writeAudit(tx, req.admin!, {
        action: status === 'RESOLVED' ? 'report.resolve' : 'report.dismiss', entityType: 'report', entityId: r.id,
        countryCode: r.question.mockTest.countryCode, metadata: { title: r.question.mockTest.title },
      });
    });
    res.json({ ok: true, status });
  };
  router.post('/reports/:id/resolve', requirePermission('reports:resolve'), closeReport('RESOLVED'));
  router.post('/reports/:id/dismiss', requirePermission('reports:resolve'), closeReport('DISMISSED'));

  return router;
}
