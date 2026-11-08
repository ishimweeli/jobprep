import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { QuestionPayload } from '../../src/domain/scoring';
import { ConsoleEmailProvider } from '../../src/services/email';
import { ADMINS, adminAgent, resetAndSeed, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: testConfig(), email: mail, now: () => clock });

type Agent = ReturnType<typeof request.agent>;
let system: Agent; let editor: Agent;
const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1';
const PROC = 'procurement-officer-free-sample';
const ACCOUNTANT = 'accountant-public-institution-mock-1';

beforeAll(async () => {
  await resetAndSeed(prisma);
  system = await adminAgent(app, mail, ADMINS.SYSTEM);
  editor = await adminAgent(app, mail, ADMINS.EDITOR);
});
afterAll(() => prisma.$disconnect());

const test_ = (slug: string) => prisma.mockTest.findFirstOrThrow({ where: { slug, countryCode: 'RW' } });
const firstQuestion = async (slug: string, skip = 0) =>
  prisma.question.findFirstOrThrow({ where: { mockTest: { slug, countryCode: 'RW' }, status: { not: 'ARCHIVED' } }, orderBy: { sortOrder: 'asc' }, skip });
/** What candidates see for a test (published questions only). */
const visible = async (slug: string) => (await request(app).get(`/api/countries/RW/mock-tests/${slug}`)).body;
const guestAttempt = async (slug: string) => {
  const r = await request(app).post(`/api/countries/RW/mock-tests/${slug}/attempts`).send({});
  return { id: r.body.attemptId as string, token: r.body.guestToken as string };
};
const state = async (a: { id: string; token: string }) => (await request(app).get(`/api/attempts/${a.id}`).set('X-Guest-Token', a.token)).body;
const auditFor = (action: string, entityId?: string) => prisma.auditLog.findMany({ where: { action, ...(entityId && { entityId }) }, include: { actor: true }, orderBy: { createdAt: 'asc' } });

describe('exams list, detail and options', () => {
  it('the list shows each test with its counts, plus the header totals from the design', async () => {
    const b = (await editor.get('/api/admin/exams?pageSize=100')).body;
    expect(b.totals).toMatchObject({ mockTests: 12, categories: 6 });
    expect(b.totals.questions).toBe(await prisma.question.count({ where: { mockTest: { countryCode: 'RW' } } }));
    const maths = b.results.find((r: { slug: string }) => r.slug === MATHS);
    expect(maths).toMatchObject({ title: 'Secondary Mathematics Teacher (S1–S3) — Mock 1', isFree: true, status: 'PUBLISHED', questionCount: 20, durationMinutes: 30, openReports: 0, category: { name: 'Teaching positions' } });
  });

  it('filters by search, category, status and paginates', async () => {
    expect((await editor.get('/api/admin/exams?q=accountant')).body.total).toBe(2);
    expect((await editor.get('/api/admin/exams?category=teaching-positions')).body.total).toBe(4);
    expect((await editor.get('/api/admin/exams?status=DRAFT')).body.total).toBe(0);
    const p = (await editor.get('/api/admin/exams?pageSize=5&page=3')).body;
    expect([p.total, p.results.length]).toEqual([12, 2]);
    expect((await editor.get('/api/admin/exams?status=nope')).status).toBe(400);
  });

  it('a test opens with its sections (and their question counts), cases and numbered questions', async () => {
    const t = await test_(MATHS);
    const b = (await editor.get(`/api/admin/mock-tests/${t.id}`)).body;
    expect(b.mockTest).toMatchObject({ title: 'Secondary Mathematics Teacher (S1–S3) — Mock 1', status: 'PUBLISHED', durationMinutes: 30, negativeMarkPerWrong: 0, passMarkPercent: null });
    expect(b.sections.map((s: { name: string; questionCount: number }) => [s.name, s.questionCount])).toEqual([
      ['Algebra & functions', 7], ['Geometry & measurement', 5], ['Statistics & probability', 4], ['Pedagogy & CBC', 4],
    ]);
    expect(b.questions).toHaveLength(20);
    expect(b.questions[0]).toMatchObject({ number: 1, type: 'SINGLE_CHOICE', status: 'PUBLISHED', section: 'Algebra & functions' });
    const acc = (await editor.get(`/api/admin/mock-tests/${(await test_(ACCOUNTANT)).id}`)).body;
    expect(acc.cases).toEqual([{ id: expect.any(String), title: 'Umucyo District Hospital, financial year 2025/26' }]);
  });

  it('gives the form its dropdown data: categories with topics, professions, authorities', async () => {
    const o = (await editor.get('/api/admin/catalog-options')).body;
    expect(o.categories).toHaveLength(6);
    expect(o.categories[0].topics.length).toBeGreaterThan(0);
    expect(o.professions.find((p: { name: string }) => p.name === 'Accountant (Public Institution)')).toMatchObject({ examId: expect.any(String) });
    expect(o.authorities.map((a: { shortName: string }) => a.shortName)).toEqual(['MIFOTRA', 'REB']);
  });
});

describe('question editor', () => {
  it('shows the question with its correct answers (admin only), position, stats and last editor', async () => {
    const q = await firstQuestion(MATHS, 1); // "A straight line passes through (2, 3) and (6, 11)…"
    const b = (await editor.get(`/api/admin/questions/${q.id}`)).body;
    expect(b.question.options.find((o: { correct: boolean }) => o.correct)).toMatchObject({ key: 'B', text: '2' });
    expect(b.question).toMatchObject({ type: 'SINGLE_CHOICE', status: 'PUBLISHED', marks: 1, difficulty: 'STANDARD', topic: { name: 'Algebra & functions' } });
    expect(b.question.explanation).toContain('Gradient');
    expect(b.position).toMatchObject({ number: 2, total: 20, previousId: expect.any(String), nextId: expect.any(String) });
    expect(b.stats).toEqual({ attempts: 0, correctPercent: null });
    expect(b.lastEdited).toBeNull();
    expect(b.reports).toEqual([]);
    // first / last question have no previous / next
    const first = (await editor.get(`/api/admin/questions/${(await firstQuestion(MATHS)).id}`)).body;
    expect(first.position.previousId).toBeNull();
  });

  it('stats come from real attempts: how many answered, what share got it right', async () => {
    const q = await firstQuestion(MATHS, 1);
    for (const pick of ['B', 'B', 'C']) {
      const a = await guestAttempt(MATHS);
      await request(app).put(`/api/attempts/${a.id}/answers`).set('X-Guest-Token', a.token).send({ changes: [{ questionId: q.id, selected: [pick] }] });
      await request(app).post(`/api/attempts/${a.id}/submit`).set('X-Guest-Token', a.token).send({});
    }
    expect((await editor.get(`/api/admin/questions/${q.id}`)).body.stats).toEqual({ attempts: 3, correctPercent: 67 });
  });

  it('an edit reaches candidates at once, bumps the version, is audited and shows as "last edited"', async () => {
    const q = await firstQuestion(PROC);
    const before = (q.payload as unknown as QuestionPayload).options;
    const res = await editor.patch(`/api/admin/questions/${q.id}`).send({
      stem: 'What is the main benefit of open competitive tendering? (edited)', explanation: 'Open competition gives every qualified supplier an equal chance, which improves price and quality.',
      options: before.map((o, i) => ({ key: o.key, text: i === 1 ? `${o.text} (clarified)` : o.text })), difficulty: 'CHALLENGING', marks: 2,
    });
    expect(res.status).toBe(200);
    const row = await prisma.question.findUniqueOrThrow({ where: { id: q.id } });
    expect([row.version, row.difficulty, Number(row.marks)]).toEqual([q.version + 1, 'CHALLENGING', 2]);

    const a = await guestAttempt(PROC);
    const s = await state(a);
    // Questions and options are shown in a per-attempt shuffled order: find them by id and key.
    const seen = s.questions.find((x: { id: string }) => x.id === q.id);
    expect(seen.stem).toContain('(edited)');
    expect(seen.options.find((o: { key: string }) => o.key === before[1]!.key).text).toContain('(clarified)');
    expect(seen.marks).toBe(2);

    const log = (await auditFor('question.update', q.id)).at(-1)!;
    expect(log.actor?.name).toBe('Marie C.');
    expect(log.metadata).toMatchObject({ title: 'Procurement Officer — Free Sample', fields: expect.arrayContaining(['stem', 'options', 'marks']) });
    expect((await editor.get(`/api/admin/questions/${q.id}`)).body.lastEdited).toMatchObject({ by: 'Marie C.' });
  });

  it('a draft question disappears for candidates and comes back when published', async () => {
    const q = await firstQuestion(PROC, 1);
    const count = async () => (await visible(PROC)).questionCount;
    const start = await count();
    expect((await editor.patch(`/api/admin/questions/${q.id}`).send({ status: 'DRAFT' })).status).toBe(200);
    expect(await count()).toBe(start - 1);
    expect((await editor.patch(`/api/admin/questions/${q.id}`).send({ status: 'PUBLISHED' })).status).toBe(200);
    expect(await count()).toBe(start);
  });

  it.each([
    ['two correct answers on a single-choice question', { type: 'SINGLE_CHOICE', correct: ['A', 'B'] }, 'exactly_one_correct_answer'],
    ['a correct answer that is not an option', { correct: ['E'] }, 'correct_not_an_option'],
    ['duplicate option letters', { options: [{ key: 'A', text: 'x' }, { key: 'A', text: 'y' }], correct: ['A'] }, 'duplicate_option_keys'],
    ['a case-based question with no case', { type: 'CASE_BASED' }, 'case_required'],
    ['"choose" smaller than the number of correct answers', { type: 'MULTIPLE_SELECT', correct: ['A', 'C'], choose: 1 }, 'invalid_choose'],
    ['"choose" larger than the number of options', { type: 'MULTIPLE_SELECT', correct: ['A', 'C'], choose: 5 }, 'invalid_choose'],
    ['fewer than two options', { options: [{ key: 'A', text: 'only one' }], correct: ['A'] }, 'validation_error'],
    ['an empty explanation', { explanation: 'short' }, 'validation_error'],
    ['zero marks', { marks: 0 }, 'validation_error'],
  ])('rejects %s', async (_name, body, error) => {
    const q = await firstQuestion(MATHS, 3);
    const res = await editor.patch(`/api/admin/questions/${q.id}`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    const after = await prisma.question.findUniqueOrThrow({ where: { id: q.id } });
    expect([after.version, after.stem]).toEqual([q.version, q.stem]); // nothing changed
  });

  it('topics, sections and cases must belong to this test and its category', async () => {
    const q = await firstQuestion(MATHS, 3);
    const otherCategoryTopic = await prisma.topic.findFirstOrThrow({ where: { category: { slug: 'procurement', countryCode: 'RW' } } });
    const otherSection = await prisma.section.findFirstOrThrow({ where: { mockTest: { slug: PROC } } });
    const otherCase = await prisma.case.findFirstOrThrow({});
    expect((await editor.patch(`/api/admin/questions/${q.id}`).send({ topicId: otherCategoryTopic.id })).body.error).toBe('topic_not_in_category');
    expect((await editor.patch(`/api/admin/questions/${q.id}`).send({ sectionId: otherSection.id })).body.error).toBe('section_not_in_test');
    expect((await editor.patch(`/api/admin/questions/${q.id}`).send({ caseId: otherCase.id })).body.error).toBe('case_not_in_test');
  });

  it('turns a question into multiple-select with partial credit and "choose N", and candidates see N', async () => {
    const q = await firstQuestion(MATHS, 5);
    const res = await editor.patch(`/api/admin/questions/${q.id}`).send({ type: 'MULTIPLE_SELECT', correct: ['A', 'B'], scoring: 'PARTIAL', choose: 3, marks: 2 });
    expect(res.status).toBe(200);
    const payload = (await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).payload as unknown as QuestionPayload;
    expect(payload).toMatchObject({ correct: ['A', 'B'], scoring: 'PARTIAL', choose: 3 });
    const a = await guestAttempt(MATHS);
    expect((await state(a)).questions.find((x: { id: string }) => x.id === q.id)).toMatchObject({ multiple: true, choose: 3, type: 'MULTIPLE_SELECT' });
    const detail = (await editor.get(`/api/admin/questions/${q.id}`)).body.question;
    expect(detail).toMatchObject({ type: 'MULTIPLE_SELECT', scoring: 'PARTIAL', choose: 3 });
  });

  it('a question linked to a case becomes case-based automatically', async () => {
    const accTest = await test_(ACCOUNTANT);
    const caseRow = await prisma.case.findFirstOrThrow({ where: { mockTestId: accTest.id } });
    const q = await firstQuestion(ACCOUNTANT); // a plain financial-accounting question
    expect((await editor.patch(`/api/admin/questions/${q.id}`).send({ caseId: caseRow.id })).status).toBe(200);
    expect((await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).type).toBe('CASE_BASED');
    expect((await editor.patch(`/api/admin/questions/${q.id}`).send({ caseId: null })).status).toBe(200);
    expect((await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).type).toBe('SINGLE_CHOICE');
  });

  it('"Publish change & resolve reports" closes the open reports on that question, with who and when', async () => {
    const q = await firstQuestion(MATHS, 6);
    await prisma.questionReport.createMany({ data: [{ questionId: q.id, message: 'Option D is confusing' }, { questionId: q.id, message: 'Typo in the stem' }] });
    const before = (await editor.get(`/api/admin/questions/${q.id}`)).body;
    expect(before.reports).toHaveLength(2);
    expect((await editor.get(`/api/admin/mock-tests/${(await test_(MATHS)).id}`)).body.questions[6].openReports).toBe(2);

    const res = await editor.patch(`/api/admin/questions/${q.id}`).send({ explanation: 'A clearer explanation of the answer.', resolveReports: true });
    expect(res.status).toBe(200);
    const reports = await prisma.questionReport.findMany({ where: { questionId: q.id }, include: { resolvedBy: true } });
    expect(reports.every((r) => r.status === 'RESOLVED' && r.resolvedBy?.name === 'Marie C.' && r.resolvedAt)).toBe(true);
    expect((await auditFor('question.update', q.id)).at(-1)!.metadata).toMatchObject({ resolvedReports: 2 });
    expect((await editor.get(`/api/admin/questions/${q.id}`)).body.reports).toEqual([]);
  });

  it('adds a question (as a draft by default), then publishes it; archiving hides it but keeps history', async () => {
    const t = await test_(PROC);
    const sec = await prisma.section.findFirstOrThrow({ where: { mockTestId: t.id } });
    const topic = await prisma.topic.findFirstOrThrow({ where: { category: { slug: 'procurement', countryCode: 'RW' } } });
    const body = {
      stem: 'Which document sets out how bids will be judged?', sectionId: sec.id, topicId: topic.id, correct: ['B'],
      options: [{ key: 'A', text: 'The bid opening minutes' }, { key: 'B', text: 'The tender document' }, { key: 'C', text: 'The delivery note' }],
      explanation: 'The tender document tells bidders the criteria before they bid.',
    };
    const bad = await editor.post(`/api/admin/mock-tests/${t.id}/questions`).send({ ...body, correct: ['A', 'B'], type: 'SINGLE_CHOICE' });
    expect(bad.body.error).toBe('exactly_one_correct_answer');

    const visibleBefore = (await visible(PROC)).questionCount;
    const created = await editor.post(`/api/admin/mock-tests/${t.id}/questions`).send(body);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    expect((await visible(PROC)).questionCount).toBe(visibleBefore);
    expect((await editor.patch(`/api/admin/questions/${created.body.id}`).send({ status: 'PUBLISHED' })).status).toBe(200);
    expect((await visible(PROC)).questionCount).toBe(visibleBefore + 1);
    const row = await prisma.question.findUniqueOrThrow({ where: { id: created.body.id } });
    const last = await prisma.question.aggregate({ where: { mockTestId: t.id, id: { not: row.id } }, _max: { sortOrder: true } });
    expect(row.sortOrder).toBe((last._max.sortOrder ?? 0) + 1);

    expect((await editor.delete(`/api/admin/questions/${row.id}`)).status).toBe(200);
    expect((await prisma.question.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('ARCHIVED');
    expect((await visible(PROC)).questionCount).toBe(visibleBefore);
    expect((await auditFor('question.archive', row.id))).toHaveLength(1);
    expect((await auditFor('question.create', row.id))).toHaveLength(1);
  });
});

describe('mock tests: create, publish, archive', () => {
  it('creates a draft test, refuses to publish it empty, publishes once it has a published question, then archives it', async () => {
    const cat = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'procurement' } });
    const prof = await prisma.profession.findFirstOrThrow({ where: { categoryId: cat.id } });
    const c = await editor.post('/api/admin/mock-tests').send({ title: 'Procurement Officer — Mock 2', categoryId: cat.id, professionId: prof.id, durationMinutes: 20, summary: 'More procurement practice.' });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ slug: 'procurement-officer-mock-2', status: 'DRAFT' });
    expect((await request(app).get('/api/countries/RW/mock-tests/procurement-officer-mock-2')).status).toBe(404); // drafts are invisible

    const empty = await editor.post(`/api/admin/mock-tests/${c.body.id}/publish`).send({});
    expect(empty.status).toBe(409);
    expect(empty.body).toMatchObject({ error: 'publish_blocked', problems: ['no_published_questions'] });

    const sec = await editor.post(`/api/admin/mock-tests/${c.body.id}/sections`).send({ name: 'Contracts' });
    const topic = await prisma.topic.findFirstOrThrow({ where: { categoryId: cat.id } });
    const q = await editor.post(`/api/admin/mock-tests/${c.body.id}/questions`).send({
      stem: 'What does a performance guarantee protect?', sectionId: sec.body.id, topicId: topic.id, correct: ['A'], marks: 2, status: 'PUBLISHED',
      options: [{ key: 'A', text: 'The buyer if the supplier fails' }, { key: 'B', text: 'The supplier if the buyer fails' }],
      explanation: 'It gives the buyer financial protection if the supplier does not perform.',
    });
    expect(q.status).toBe(201);
    const pub = await editor.post(`/api/admin/mock-tests/${c.body.id}/publish`).send({});
    expect(pub.body).toMatchObject({ ok: true, status: 'PUBLISHED', questions: 1 });
    const live = await visible('procurement-officer-mock-2');
    // New tests start as a Free sample unless the editor chooses Full Access.
    expect(live).toMatchObject({ title: 'Procurement Officer — Mock 2', questionCount: 1, totalMarks: 2, isFree: true, durationMinutes: 20 });

    expect((await editor.post(`/api/admin/mock-tests/${c.body.id}/archive`).send({})).body.status).toBe('ARCHIVED');
    expect((await request(app).get('/api/countries/RW/mock-tests/procurement-officer-mock-2')).status).toBe(404);
    expect((await auditFor('mock_test.publish', c.body.id))[0]!.actor?.name).toBe('Marie C.');
    expect(await auditFor('mock_test.archive', c.body.id)).toHaveLength(1);
    expect(await auditFor('mock_test.create', c.body.id)).toHaveLength(1);
  });

  it('gives a second test with the same title its own address', async () => {
    const cat = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'procurement' } });
    const prof = await prisma.profession.findFirstOrThrow({ where: { categoryId: cat.id } });
    const mk = () => editor.post('/api/admin/mock-tests').send({ title: 'Duplicate Title Test', categoryId: cat.id, professionId: prof.id, durationMinutes: 10 });
    expect((await mk()).body.slug).toBe('duplicate-title-test');
    expect((await mk()).body.slug).toBe('duplicate-title-test-2');
  });

  it('refuses a profession or category that does not belong together', async () => {
    const proc = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'procurement' } });
    const teaching = await prisma.profession.findFirstOrThrow({ where: { category: { slug: 'teaching-positions', countryCode: 'RW' } } });
    const bad = await editor.post('/api/admin/mock-tests').send({ title: 'Mismatched Test', categoryId: proc.id, professionId: teaching.id, durationMinutes: 10 });
    expect(bad.body.error).toBe('profession_not_in_category');
    expect((await editor.post('/api/admin/mock-tests').send({ title: 'No Exam Test', categoryId: proc.id, durationMinutes: 10 })).body.error).toBe('exam_or_profession_required');
    expect((await editor.post('/api/admin/mock-tests').send({ title: 'No Category Test', categoryId: 'nope', professionId: teaching.id, durationMinutes: 10 })).body.error).toBe('category_not_found');
  });

  it('an official pass mark needs its source (both or neither); with both, candidates see it', async () => {
    const t = await test_(PROC);
    expect((await editor.patch(`/api/admin/mock-tests/${t.id}`).send({ passMarkPercent: 50 })).body.error).toBe('pass_mark_needs_percent_and_source');
    expect((await editor.patch(`/api/admin/mock-tests/${t.id}`).send({ passMarkSource: 'Circular 12/2026' })).body.error).toBe('pass_mark_needs_percent_and_source');
    expect((await visible(PROC)).passMark).toBeNull();
    expect((await editor.patch(`/api/admin/mock-tests/${t.id}`).send({ passMarkPercent: 50, passMarkSource: 'Circular 12/2026' })).status).toBe(200);
    expect((await visible(PROC)).passMark).toEqual({ percent: 50, source: 'Circular 12/2026' });
    expect((await editor.patch(`/api/admin/mock-tests/${t.id}`).send({ passMarkPercent: null, passMarkSource: null })).status).toBe(200);
    expect((await visible(PROC)).passMark).toBeNull();
  });

  it('negative marking is off by default and can be configured per test', async () => {
    const t = await test_(PROC);
    expect((await visible(PROC)).negativeMarking).toBeNull();
    await editor.patch(`/api/admin/mock-tests/${t.id}`).send({ negativeMarkPerWrong: 0.25 });
    expect((await visible(PROC)).negativeMarking).toEqual({ perWrongAnswer: 0.25 });
    expect((await editor.patch(`/api/admin/mock-tests/${t.id}`).send({ negativeMarkPerWrong: 9 })).status).toBe(400);
    await editor.patch(`/api/admin/mock-tests/${t.id}`).send({ negativeMarkPerWrong: 0 });
  });

  it('switching a test from paid to free (or the reverse) takes effect for candidates', async () => {
    const t = await test_(PROC);
    await editor.patch(`/api/admin/mock-tests/${t.id}`).send({ isFree: false });
    expect((await visible(PROC)).accessTag).toBe('FULL_ACCESS');
    await editor.patch(`/api/admin/mock-tests/${t.id}`).send({ isFree: true });
    expect((await visible(PROC)).accessTag).toBe('FREE');
  });
});

describe('categories, sections, topics and case studies', () => {
  it('categories: create (unique address), one featured per country, edit, and no deleting one that is in use', async () => {
    const a = await editor.post('/api/admin/categories').send({ countryCode: 'RW', name: 'Health & medicine', description: 'Nurses and clinical officers', featured: true });
    expect(a.status).toBe(201);
    expect(a.body.slug).toBe('health-and-medicine');
    expect((await editor.post('/api/admin/categories').send({ countryCode: 'RW', name: 'Health & medicine' })).body.slug).toBe('health-and-medicine-2');
    const list = (await editor.get('/api/admin/categories?country=RW')).body.categories;
    expect(list.filter((c: { featured: boolean }) => c.featured).map((c: { name: string }) => c.name)).toEqual(['Health & medicine']); // Teaching was un-featured
    await editor.patch(`/api/admin/categories/${a.body.id}`).send({ featured: false, name: 'Health and medicine' });
    expect((await prisma.category.findUniqueOrThrow({ where: { id: a.body.id } })).name).toBe('Health and medicine');

    const teaching = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'teaching-positions' } });
    expect((await editor.delete(`/api/admin/categories/${teaching.id}`)).body.error).toBe('category_in_use');
    expect((await editor.delete(`/api/admin/categories/${a.body.id}`)).status).toBe(200);
    expect(await auditFor('category.create')).not.toHaveLength(0);
    expect(await auditFor('category.delete', a.body.id)).toHaveLength(1);
    await prisma.category.update({ where: { id: teaching.id }, data: { featured: true } });
    await prisma.category.updateMany({ where: { countryCode: 'RW', id: { not: teaching.id } }, data: { featured: false } });
  });

  it('sections: add to a test, no duplicates, rename, and no deleting one that holds questions', async () => {
    const t = await test_(PROC);
    const s = await editor.post(`/api/admin/mock-tests/${t.id}/sections`).send({ name: 'Ethics', questionTypeLabel: 'Multiple choice' });
    expect(s.status).toBe(201);
    expect((await editor.post(`/api/admin/mock-tests/${t.id}/sections`).send({ name: 'Ethics' })).body.error).toBe('section_exists');
    expect((await editor.patch(`/api/admin/sections/${s.body.id}`).send({ name: 'Ethics and conduct' })).status).toBe(200);
    const used = await prisma.section.findFirstOrThrow({ where: { mockTestId: t.id, name: 'Public procurement' } });
    expect((await editor.patch(`/api/admin/sections/${s.body.id}`).send({ name: 'Public procurement' })).body.error).toBe('section_exists');
    expect((await editor.delete(`/api/admin/sections/${used.id}`)).body.error).toBe('section_in_use');
    expect((await editor.delete(`/api/admin/sections/${s.body.id}`)).status).toBe(200);
  });

  it('topics: create, no duplicates, rename, and none deleted while questions use them (they drive weak areas)', async () => {
    const cat = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'procurement' } });
    const t = await editor.post('/api/admin/topics').send({ categoryId: cat.id, name: 'Contract management' });
    expect(t.status).toBe(201);
    expect((await editor.post('/api/admin/topics').send({ categoryId: cat.id, name: 'Contract management' })).body.error).toBe('topic_exists');
    expect((await editor.patch(`/api/admin/topics/${t.body.id}`).send({ name: 'Contract administration' })).status).toBe(200);
    const list = (await editor.get(`/api/admin/topics?categoryId=${cat.id}`)).body.topics;
    expect(list.find((x: { id: string }) => x.id === t.body.id)).toMatchObject({ name: 'Contract administration', questions: 0 });
    const used = await prisma.topic.findFirstOrThrow({ where: { categoryId: cat.id, name: 'Public procurement' } });
    expect((await editor.delete(`/api/admin/topics/${used.id}`)).body.error).toBe('topic_in_use');
    expect((await editor.delete(`/api/admin/topics/${t.body.id}`)).status).toBe(200);
  });

  it('cases: create with passage, tables and notes; reject a bad table; edit; no deleting one that questions use', async () => {
    const t = await test_(ACCOUNTANT);
    const body = {
      title: 'Kigali Health Centre, 2026', passage: ['The centre reports on an accrual basis.'], notes: ['Rent is paid quarterly in advance.'],
      tables: [{ caption: 'Cash summary (RWF)', rows: [{ label: 'Receipts', heading: true }, { label: 'Government transfer', value: '100,000,000' }] }],
    };
    const c = await editor.post(`/api/admin/mock-tests/${t.id}/cases`).send(body);
    expect(c.status).toBe(201);
    const got = (await editor.get(`/api/admin/cases/${c.body.id}`)).body.case;
    expect(got).toMatchObject({ title: 'Kigali Health Centre, 2026', questions: 0, notes: ['Rent is paid quarterly in advance.'] });
    expect(got.tables[0].rows).toHaveLength(2);
    expect((await editor.post(`/api/admin/mock-tests/${t.id}/cases`).send({ ...body, tables: [{ caption: 'x', rows: [] }] })).status).toBe(400);
    expect((await editor.post(`/api/admin/mock-tests/${t.id}/cases`).send({ ...body, passage: [] })).status).toBe(400);
    expect((await editor.patch(`/api/admin/cases/${c.body.id}`).send({ title: 'Kigali Health Centre, financial year 2026' })).status).toBe(200);
    expect((await editor.patch(`/api/admin/cases/${c.body.id}`).send({})).body.error).toBe('nothing_to_change');

    const used = await prisma.case.findFirstOrThrow({ where: { mockTestId: t.id, questions: { some: {} } } });
    expect((await editor.delete(`/api/admin/cases/${used.id}`)).body.error).toBe('case_in_use');
    expect((await editor.delete(`/api/admin/cases/${c.body.id}`)).status).toBe(200);
  });
});

describe('CSV import', () => {
  const header = 'section,topic,stem,option_a,option_b,option_c,option_d,correct,explanation,marks,difficulty';
  const row = (stem: string, extra = 'Public procurement,Public procurement') => `${extra},"${stem}",Yes,No,Maybe,Never,A,Because the rules say so clearly.,1,standard`;
  const count = async () => (await visible(PROC)).questionCount;
  const total = () => prisma.question.count({ where: { mockTest: { slug: PROC, countryCode: 'RW' } } });
  let procId: string;
  beforeAll(async () => { procId = (await test_(PROC)).id; });

  it('dry run: reports what would happen and changes nothing', async () => {
    const before = await total();
    const csv = [header, row('First imported question?'), row('Second imported question?'), row('Bad topic question?', 'Public procurement,Nonsense')].join('\n');
    const res = await editor.post(`/api/admin/mock-tests/${procId}/import`).send({ csv, dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dryRun: true, totalRows: 3, validRows: 2, invalidRows: 1 });
    expect(res.body.problems).toEqual([{ row: 4, column: 'topic', problem: 'unknown_topic:Nonsense' }]);
    expect(await total()).toBe(before);
  });

  it('with errors it refuses everything by default (409 with the report) and creates nothing', async () => {
    const before = await total();
    const csv = [header, row('Valid but not imported?'), row('Unknown section here?', 'Nowhere,Public procurement')].join('\n');
    const res = await editor.post(`/api/admin/mock-tests/${procId}/import`).send({ csv });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'import_has_errors', validRows: 1, invalidRows: 1 });
    expect(await total()).toBe(before);
  });

  it('can import just the valid rows: drafts after the existing questions, audited, invisible until published', async () => {
    const before = await total();
    const visibleBefore = await count();
    const csv = [header, row('Imported question one?'), row('Imported question two?'), row('Unknown section here two?', 'Nowhere,Public procurement'),
      'Public procurement,Public procurement,"Pick all that apply",Alpha,Beta,Gamma,Delta,"A;C",Alpha and Gamma are right here.,2,foundation'].join('\n');
    const res = await editor.post(`/api/admin/mock-tests/${procId}/import`).send({ csv, importValidRows: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 3, invalidRows: 1 });
    expect(await total()).toBe(before + 3);
    expect(await count()).toBe(visibleBefore); // imported questions are drafts: a human must read and publish them

    const imported = await prisma.question.findMany({ where: { mockTestId: procId, stem: { in: ['Imported question one?', 'Imported question two?', 'Pick all that apply'] } }, orderBy: { sortOrder: 'asc' } });
    expect(imported.every((q) => q.status === 'DRAFT')).toBe(true);
    const existingMax = (await prisma.question.aggregate({ where: { mockTestId: procId, id: { notIn: imported.map((q) => q.id) } }, _max: { sortOrder: true } }))._max.sortOrder!;
    expect(imported.map((q) => q.sortOrder)).toEqual([existingMax + 1, existingMax + 2, existingMax + 3]);
    const multi = imported.find((q) => q.stem === 'Pick all that apply')!;
    expect(multi).toMatchObject({ type: 'MULTIPLE_SELECT' });
    expect(multi.payload).toMatchObject({ correct: ['A', 'C'], scoring: 'ALL_OR_NOTHING' });
    expect(Number(multi.marks)).toBe(2);
    const log = (await auditFor('csv.import', procId)).at(-1)!;
    expect(log.metadata).toMatchObject({ created: 3, skipped: 1, title: 'Procurement Officer — Free Sample' });
  });

  it('catches questions that are already in the test, so re-uploading the same file does not duplicate', async () => {
    const csv = [header, row('Imported question one?')].join('\n');
    const res = await editor.post(`/api/admin/mock-tests/${procId}/import`).send({ csv, dryRun: true });
    expect(res.body.problems).toEqual([{ row: 2, column: 'stem', problem: 'duplicate_question' }]);
  });

  it('stops early with a clear code for a missing column, an empty file, or nothing valid', async () => {
    expect((await editor.post(`/api/admin/mock-tests/${procId}/import`).send({ csv: 'section,topic,stem\nA,B,C' })).body.error).toBe('missing_columns:option_a,option_b,correct,explanation');
    expect((await editor.post(`/api/admin/mock-tests/${procId}/import`).send({ csv: header })).body.error).toBe('no_rows');
    expect((await editor.post(`/api/admin/mock-tests/${procId}/import`).send({ csv: '' })).status).toBe(400);
    const none = await editor.post(`/api/admin/mock-tests/${procId}/import`).send({ csv: [header, row('x', 'Nowhere,Nowhere')].join('\n'), importValidRows: true });
    expect(none.body.error).toBe('nothing_to_import');
  });
});

describe('candidate reports and the admin queue', () => {
  it('a candidate reports a question; only the owner, only once, only a question that was in their attempt', async () => {
    const q = await firstQuestion(MATHS, 8);
    const a = await guestAttempt(MATHS);
    const other = await guestAttempt(MATHS);
    const post = (id: string, token: string, body: object) => request(app).post(`/api/attempts/${id}/reports`).set('X-Guest-Token', token).send(body);
    expect((await post(a.id, a.token, { questionId: q.id, message: 'The answer key looks wrong' })).status).toBe(201);
    expect((await post(a.id, a.token, { questionId: q.id, message: 'Reporting it again' })).body.error).toBe('already_reported');
    expect((await post(a.id, other.token, { questionId: q.id, message: 'Not my attempt' })).status).toBe(404);
    expect((await post(a.id, a.token, { questionId: q.id, message: 'no' })).status).toBe(400);
    const procQ = await firstQuestion(PROC);
    expect((await post(a.id, a.token, { questionId: procQ.id, message: 'Question from another test' })).body.error).toBe('unknown_question');
    expect((await request(app).post(`/api/attempts/${a.id}/reports`).send({ questionId: q.id, message: 'No token at all' })).status).toBe(404);
  });

  it('the queue lists open reports with the question number, text and test; it feeds the exam list and the overview', async () => {
    const b = (await editor.get('/api/admin/reports')).body;
    const mine = b.results.find((r: { message: string }) => r.message === 'The answer key looks wrong');
    expect(mine).toMatchObject({ status: 'OPEN', question: { number: 9 }, mockTest: { title: 'Secondary Mathematics Teacher (S1–S3) — Mock 1' } });
    const maths = (await editor.get('/api/admin/exams?pageSize=100')).body.results.find((r: { slug: string }) => r.slug === MATHS);
    expect(maths.openReports).toBeGreaterThanOrEqual(1);
    expect((await system.get('/api/admin/overview')).body.needsAttention.reportedQuestions.count).toBeGreaterThanOrEqual(1);
  });

  it('resolve and dismiss close a report once, with who and an audit entry; a closed report cannot be closed again', async () => {
    const q = await firstQuestion(MATHS, 9);
    const r1 = await prisma.questionReport.create({ data: { questionId: q.id, message: 'Fix this please' } });
    const r2 = await prisma.questionReport.create({ data: { questionId: q.id, message: 'Not actually a problem' } });
    expect((await editor.post(`/api/admin/reports/${r1.id}/resolve`).send({})).body.status).toBe('RESOLVED');
    expect((await editor.post(`/api/admin/reports/${r2.id}/dismiss`).send({})).body.error).toBe('reason_required'); // dismissing needs a reason
    expect((await editor.post(`/api/admin/reports/${r2.id}/dismiss`).send({ reason: 'The question is fine as it is' })).body.status).toBe('DISMISSED');
    expect((await editor.post(`/api/admin/reports/${r1.id}/dismiss`).send({ reason: 'Already handled' })).body.error).toBe('report_already_closed');
    const row = await prisma.questionReport.findUniqueOrThrow({ where: { id: r1.id }, include: { resolvedBy: true } });
    expect([row.status, row.resolvedBy?.name]).toEqual(['RESOLVED', 'Marie C.']);
    expect((await auditFor('report.resolve', r1.id))[0]!.actor?.name).toBe('Marie C.');
    expect(await auditFor('report.dismiss', r2.id)).toHaveLength(1);
    const resolved = (await editor.get('/api/admin/reports?status=RESOLVED')).body.results.map((r: { id: string }) => r.id);
    expect(resolved).toContain(r1.id);
    expect((await editor.get('/api/admin/reports?status=OPEN')).body.results.map((r: { id: string }) => r.id)).not.toContain(r1.id);
    expect((await editor.get('/api/admin/reports?status=nope')).status).toBe(400);
  });
});
