import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleEmailProvider } from '../../src/services/email';
import { ADMINS, adminAgent, readyAccount, resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

/**
 * The admin-side additions of the "missing designs" pass: reports queue, test lifecycle, translations, case studies,
 * reordering, CSV import, audit log, country actions, demand views, exports, "view as candidate".
 */
const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const clock = new Date('2026-11-02T10:00:00Z');
const config = testConfig();
const app = createApp({ prisma, config, email: mail, now: () => clock });

type Agent = ReturnType<typeof request.agent>;
let system: Agent; let editor: Agent; let support: Agent;
let cat: { id: string; slug: string; countryCode: string; topics: { id: string; name: string }[] };
let prof: { id: string };

beforeAll(async () => {
  await resetAndSeed(prisma);
  system = await adminAgent(app, mail, ADMINS.SYSTEM);
  editor = await adminAgent(app, mail, ADMINS.EDITOR);
  support = await adminAgent(app, mail, ADMINS.SUPPORT);
  const opts = (await system.get('/api/admin/catalog-options')).body;
  cat = opts.categories.find((c: { countryCode: string; slug: string }) => c.countryCode === 'RW' && c.slug === 'teaching-positions');
  prof = opts.professions.find((p: { categoryId: string }) => p.categoryId === cat.id);
});
afterAll(() => prisma.$disconnect());

let seq = 0;
const OPTS = [{ key: 'A', text: 'First' }, { key: 'B', text: 'Second' }, { key: 'C', text: 'Third' }, { key: 'D', text: 'Fourth' }];
async function makeTest(over: Record<string, unknown> = {}) {
  const t = await system.post('/api/admin/mock-tests').send({ title: `Missing designs test ${++seq}`, categoryId: cat.id, professionId: prof.id, durationMinutes: 20, languages: ['en', 'rw'], isFree: true, ...over });
  expect(t.status).toBe(201);
  const sec = await system.post(`/api/admin/mock-tests/${t.body.id}/sections`).send({ name: 'Part A' });
  return { id: t.body.id as string, slug: t.body.slug as string, sectionId: sec.body.id as string };
}
async function addQuestion(t: { id: string; sectionId: string }, over: Record<string, unknown> = {}) {
  const r = await system.post(`/api/admin/mock-tests/${t.id}/questions`).send({
    sectionId: t.sectionId, topicId: cat.topics[0]!.id, stem: `Question number ${++seq}: pick the right one`, options: OPTS, correct: ['B'],
    explanation: 'Because the second option is the correct one here.', status: 'PUBLISHED', ...over,
  });
  expect(r.status).toBe(201);
  return r.body.id as string;
}
const audit = (action: string, entityId?: string) => prisma.auditLog.findMany({ where: { action, ...(entityId && { entityId }) }, orderBy: { createdAt: 'asc' } });

describe('country options for the filters', () => {
  it('every admin gets the countries in their scope, nothing else', async () => {
    const sys = (await system.get('/api/admin/country-options')).body.countries;
    expect(sys.map((c: { code: string }) => c.code)).toEqual(['KE', 'RW', 'TZ', 'UG']);
    expect(sys[0]).toEqual({ code: 'KE', name: 'Kenya', status: 'PREPARING' });
    expect((await editor.get('/api/admin/country-options')).body.countries.map((c: { code: string }) => c.code)).toEqual(['RW']);
    expect((await support.get('/api/admin/country-options')).status).toBe(200);
    expect((await request(app).get('/api/admin/country-options')).status).toBe(401);
  });
});

describe('reports queue', () => {
  it('groups by question with a count and the latest message, filters by status, and closes with a reason', async () => {
    const t = await makeTest();
    const q1 = await addQuestion(t);
    const q2 = await addQuestion(t);
    const at = (m: number) => new Date(clock.getTime() - m * 60_000);
    await prisma.questionReport.createMany({
      data: [
        { questionId: q1, message: 'The answer looks wrong', createdAt: at(30) },
        { questionId: q1, message: 'Option B and C are the same', createdAt: at(10) },
        { questionId: q1, message: 'Typo in the stem', createdAt: at(20) },
        { questionId: q2, message: 'Unclear wording', createdAt: at(5) },
      ],
    });
    const grouped = (await editor.get('/api/admin/reports?group=question')).body;
    expect(grouped.total).toBeGreaterThanOrEqual(2);
    const g1 = grouped.results.find((r: { question: { id: string } }) => r.question.id === q1);
    expect(g1).toMatchObject({ count: 3, latestMessage: 'Option B and C are the same', mockTest: { id: t.id } });
    expect(g1.messages.map((m: { message: string }) => m.message)).toEqual(['Option B and C are the same', 'Typo in the stem', 'The answer looks wrong']);
    expect(grouped.results[0].count).toBeGreaterThanOrEqual(grouped.results[1].count);
    expect(grouped.results.find((r: { question: { id: string } }) => r.question.id === q2).count).toBe(1);

    const flat = (await editor.get('/api/admin/reports')).body.results[0];
    expect(flat).toHaveProperty('reporter');
    expect(flat).toHaveProperty('resolutionNote');

    // Dismiss needs a reason; resolve may have one. The note is kept on the report and in the audit row.
    const one = await prisma.questionReport.findFirstOrThrow({ where: { questionId: q2 } });
    const noReason = await editor.post(`/api/admin/reports/${one.id}/dismiss`).send({});
    expect([noReason.status, noReason.body.error]).toEqual([400, 'reason_required']);
    expect((await editor.post(`/api/admin/reports/${one.id}/dismiss`).send({ reason: 'abc' })).status).toBe(400);
    expect((await editor.post(`/api/admin/reports/${one.id}/dismiss`).send({ reason: 'Wording is fine as written' })).body.status).toBe('DISMISSED');
    expect((await prisma.questionReport.findUniqueOrThrow({ where: { id: one.id } })).resolutionNote).toBe('Wording is fine as written');
    expect((await audit('report.dismiss', one.id))[0]!.reason).toBe('Wording is fine as written');
    const dismissed = (await editor.get('/api/admin/reports?group=question&status=DISMISSED')).body;
    expect(dismissed.results.some((r: { question: { id: string } }) => r.question.id === q2)).toBe(true);

    // Close all the open reports of a question at once.
    const bad = await editor.post(`/api/admin/questions/${q1}/reports/close`).send({ status: 'DISMISSED' });
    expect([bad.status, bad.body.error]).toEqual([400, 'reason_required']);
    const closed = await editor.post(`/api/admin/questions/${q1}/reports/close`).send({ status: 'RESOLVED' });
    expect(closed.body).toEqual({ ok: true, closed: 3 });
    expect(await prisma.questionReport.count({ where: { questionId: q1, status: 'RESOLVED', resolvedById: { not: null } } })).toBe(3);
    expect((await audit('report.close_all', q1))[0]!.metadata).toMatchObject({ count: 3, status: 'RESOLVED' });
    expect((await editor.post(`/api/admin/questions/${q1}/reports/close`).send({ status: 'RESOLVED' })).body.closed).toBe(0);
    expect((await support.post(`/api/admin/questions/${q1}/reports/close`).send({ status: 'RESOLVED' })).status).toBe(403);
  });

  it('a country-scoped editor cannot close reports of another country\'s question', async () => {
    const ke = await prisma.question.findFirstOrThrow({ where: { mockTest: { countryCode: 'KE' } } });
    expect((await editor.post(`/api/admin/questions/${ke.id}/reports/close`).send({ status: 'RESOLVED' })).status).toBe(404);
    await prisma.questionReport.create({ data: { questionId: ke.id, message: 'Kenya only' } });
    expect((await editor.get('/api/admin/reports?group=question')).body.results.some((r: { mockTest: { countryCode: string } }) => r.mockTest.countryCode === 'KE')).toBe(false);
    expect((await system.get('/api/admin/reports?group=question&country=KE')).body.results).toHaveLength(1);
  });
});

describe('mock test lifecycle: checklist, publish, unpublish, restore, duplicate', () => {
  it('the checklist blocks an empty test and warns about a missing free sample', async () => {
    const t = await makeTest({ isFree: false });
    const empty = (await editor.get(`/api/admin/mock-tests/${t.id}/checklist`)).body;
    expect(empty.canPublish).toBe(false);
    expect(empty.items.find((i: { key: string }) => i.key === 'hasQuestions')).toMatchObject({ ok: false, blocking: true });
    const blocked = await editor.post(`/api/admin/mock-tests/${t.id}/publish`).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ error: 'publish_blocked', problems: ['no_published_questions'] });
    expect(blocked.body.checklist).toBeInstanceOf(Array);

    await addQuestion(t);
    const ready = (await editor.get(`/api/admin/mock-tests/${t.id}/checklist`)).body;
    expect(ready.canPublish).toBe(true);
    expect(ready.items.find((i: { key: string }) => i.key === 'hasQuestions')).toMatchObject({ ok: true, detail: '1 published' });
    // English-only seed tests in this category are free, so a free sample exists; the new test has no instructions and no rw text.
    expect(ready.items.find((i: { key: string }) => i.key === 'freeSample').ok).toBe(true);
    expect(ready.items.find((i: { key: string }) => i.key === 'instructions').ok).toBe(false);
    expect(ready.items.find((i: { key: string }) => i.key === 'translations')).toMatchObject({ ok: false, blocking: false, detail: 'rw: 1 of 1 missing' });

    const pub = (await editor.post(`/api/admin/mock-tests/${t.id}/publish`).send({})).body;
    expect(pub).toMatchObject({ ok: true, status: 'PUBLISHED', questions: 1 });
    expect(pub.warnings).toEqual(['instructions', 'translations']);
  });

  it('a paid test in a category with no free sample publishes with a warning', async () => {
    const c = await system.post('/api/admin/categories').send({ countryCode: 'RW', name: 'Health professions' });
    const prof2 = await prisma.profession.create({ data: { categoryId: c.body.id, slug: 'nurse', name: 'Nurse' } });
    const topic = await system.post('/api/admin/topics').send({ categoryId: c.body.id, name: 'Anatomy' });
    const t = await system.post('/api/admin/mock-tests').send({ title: 'Nurse paid mock test', categoryId: c.body.id, professionId: prof2.id, durationMinutes: 30, isFree: false });
    const sec = await system.post(`/api/admin/mock-tests/${t.body.id}/sections`).send({ name: 'Part A' });
    await system.post(`/api/admin/mock-tests/${t.body.id}/questions`).send({
      sectionId: sec.body.id, topicId: topic.body.id, stem: 'Which bone is the longest?', options: OPTS, correct: ['A'], explanation: 'The femur is the longest bone.', status: 'PUBLISHED',
    });
    const list = (await system.get(`/api/admin/mock-tests/${t.body.id}/checklist`)).body;
    expect(list.items.find((i: { key: string }) => i.key === 'freeSample')).toMatchObject({ ok: false, blocking: false });
    const pub = (await system.post(`/api/admin/mock-tests/${t.body.id}/publish`).send({})).body;
    expect(pub.warnings).toContain('freeSample');
  });

  it('unpublish needs a reason and reports what it affects; archived tests are restored to draft first', async () => {
    const t = await makeTest();
    await addQuestion(t);
    expect((await system.post(`/api/admin/mock-tests/${t.id}/unpublish`).send({ reason: 'Not live yet' })).body.error).toBe('not_published');
    await system.post(`/api/admin/mock-tests/${t.id}/publish`).send({});
    const guest = await request(app).post(`/api/countries/RW/mock-tests/${t.slug}/attempts`).send({});
    expect(guest.status).toBe(201);
    const cons = (await editor.get(`/api/admin/mock-tests/${t.id}/consequences`)).body;
    expect(cons).toEqual({ status: 'PUBLISHED', attemptsInProgress: 1, attemptsFinished: 0 });

    expect((await editor.post(`/api/admin/mock-tests/${t.id}/unpublish`).send({})).status).toBe(400);
    expect((await editor.post(`/api/admin/mock-tests/${t.id}/unpublish`).send({ reason: 'abc' })).status).toBe(400);
    const un = await editor.post(`/api/admin/mock-tests/${t.id}/unpublish`).send({ reason: 'A mistake was found in it' });
    expect(un.body).toEqual({ ok: true, status: 'DRAFT', consequences: { attemptsInProgress: 1, attemptsFinished: 0 } });
    expect((await request(app).get(`/api/countries/RW/mock-tests/${t.slug}`)).status).toBe(404);
    const [entry] = await audit('mock_test.unpublish', t.id);
    expect(entry).toMatchObject({ reason: 'A mistake was found in it' });

    await system.post(`/api/admin/mock-tests/${t.id}/archive`).send({});
    expect((await system.post(`/api/admin/mock-tests/${t.id}/publish`).send({})).body.error).toBe('archived');
    expect((await system.post(`/api/admin/mock-tests/${t.id}/restore`).send({})).body).toEqual({ ok: true, status: 'DRAFT' });
    expect((await system.post(`/api/admin/mock-tests/${t.id}/restore`).send({})).body.error).toBe('not_archived');
    expect((await system.post(`/api/admin/mock-tests/${t.id}/publish`).send({})).body.status).toBe('PUBLISHED');
    expect((await support.post(`/api/admin/mock-tests/${t.id}/unpublish`).send({ reason: 'support tries' })).status).toBe(403);
  });

  it('duplicate copies sections, case studies, questions and translations as drafts', async () => {
    const t = await makeTest({ instructions: ['Read carefully.'], summary: 'Original summary' });
    const c = await system.post(`/api/admin/mock-tests/${t.id}/cases`).send({ title: 'Case about a school', passage: ['A paragraph.'], tables: [], notes: [] });
    const q1 = await addQuestion(t);
    const q2 = await addQuestion(t, { caseId: c.body.id });
    await addQuestion(t, { status: 'DRAFT' });
    const arch = await addQuestion(t);
    await system.delete(`/api/admin/questions/${arch}`);
    expect((await system.put(`/api/admin/questions/${q1}/translations/rw`).send({ stem: 'Ikibazo', explanation: 'Inyigisho', optionTexts: { A: 'a', B: 'b', C: 'c', D: 'd' } })).status).toBe(200);
    await system.put(`/api/admin/cases/${c.body.id}/translations/rw`).send({ title: 'Isomo', passage: ['Igika'], tables: [], notes: [] });

    const dup = await editor.post(`/api/admin/mock-tests/${t.id}/duplicate`).send({});
    expect(dup.status).toBe(201);
    expect(dup.body).toMatchObject({ status: 'DRAFT', questions: 3 });
    const copy = (await editor.get(`/api/admin/mock-tests/${dup.body.id}`)).body;
    expect(copy.mockTest).toMatchObject({ status: 'DRAFT', summary: 'Original summary', instructions: ['Read carefully.'], languages: ['en', 'rw'] });
    expect(copy.mockTest.title).toMatch(/\(copy\)$/);
    expect(copy.sections.map((s: { name: string; questionCount: number }) => [s.name, s.questionCount])).toEqual([['Part A', 3]]);
    expect(copy.questions.every((q: { status: string }) => q.status === 'DRAFT')).toBe(true);
    expect(copy.cases).toHaveLength(1);
    const copiedCase = await prisma.case.findFirstOrThrow({ where: { mockTestId: dup.body.id }, include: { translations: true } });
    expect(copiedCase.translations.map((x) => x.language)).toEqual(['rw']);
    const copiedQ2 = await prisma.question.findFirstOrThrow({ where: { mockTestId: dup.body.id, caseId: copiedCase.id } });
    expect(copiedQ2.id).not.toBe(q2);
    expect(await prisma.questionTranslation.count({ where: { question: { mockTestId: dup.body.id } } })).toBe(1);
    // The original is untouched, and a title can be given.
    expect((await editor.get(`/api/admin/mock-tests/${t.id}`)).body.questions).toHaveLength(3);
    const named = await system.post(`/api/admin/mock-tests/${t.id}/duplicate`).send({ title: 'Brand new title here' });
    expect((await prisma.mockTest.findUniqueOrThrow({ where: { id: named.body.id } })).title).toBe('Brand new title here');
    expect((await audit('mock_test.duplicate', dup.body.id))).toHaveLength(1);
    const ke = await prisma.mockTest.findFirstOrThrow({ where: { countryCode: 'KE' } });
    expect((await editor.post(`/api/admin/mock-tests/${ke.id}/duplicate`).send({})).status).toBe(404);
  });

  it('the test detail names the exam, profession, authority and attempt count', async () => {
    const seeded = await prisma.mockTest.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'accountant-public-institution-mock-1' } });
    const d = (await editor.get(`/api/admin/mock-tests/${seeded.id}`)).body.mockTest;
    expect(d.exam).toMatchObject({ name: expect.any(String) });
    expect(d.profession).toMatchObject({ name: expect.any(String) });
    expect(d).toHaveProperty('authority');
    expect(d.attemptCount).toBe(0);
  });
});

describe('question order and translations', () => {
  it('reorders the questions of a test (every one, once)', async () => {
    const t = await makeTest();
    const [a, b, c] = [await addQuestion(t), await addQuestion(t), await addQuestion(t)] as [string, string, string];
    expect((await editor.post(`/api/admin/mock-tests/${t.id}/questions/reorder`).send({ ids: [c, a, b] })).body).toEqual({ ok: true });
    expect((await editor.get(`/api/admin/mock-tests/${t.id}`)).body.questions.map((q: { id: string; number: number }) => q.id)).toEqual([c, a, b]);
    for (const ids of [[a, b], [a, a, b], [a, b, c, 'extra'], [a, b, 'x']]) {
      expect((await editor.post(`/api/admin/mock-tests/${t.id}/questions/reorder`).send({ ids })).body.error, JSON.stringify(ids)).toBe('ids_mismatch');
    }
    expect((await audit('question.reorder', t.id))).toHaveLength(1);
    const ke = await prisma.mockTest.findFirstOrThrow({ where: { countryCode: 'KE' } });
    expect((await editor.post(`/api/admin/mock-tests/${ke.id}/questions/reorder`).send({ ids: ['x'] })).status).toBe(404);
  });

  it('saves a translation, reports complete / partial / missing, bumps the version, and candidates can read it', async () => {
    const t = await makeTest();
    const qid = await addQuestion(t, { stem: 'What is two plus two in this test?' });
    const before = (await editor.get(`/api/admin/questions/${qid}`)).body.question;
    expect(before.translations).toEqual([]);
    expect(before.translationStatus).toEqual([{ language: 'rw', state: 'missing' }]);

    const partial = await editor.put(`/api/admin/questions/${qid}/translations/rw`).send({ stem: 'Kabiri kongeraho kabiri ni bingahe?', explanation: '', optionTexts: { A: 'Rimwe', B: 'Kane', C: '', D: '' } });
    expect(partial.body).toEqual({ ok: true, state: 'partial' });
    expect((await editor.get(`/api/admin/questions/${qid}`)).body.question.translationStatus).toEqual([{ language: 'rw', state: 'partial' }]);

    const full = await editor.put(`/api/admin/questions/${qid}/translations/rw`).send({
      stem: 'Kabiri kongeraho kabiri ni bingahe?', explanation: 'Kuko kabiri na kabiri bivamo kane.', optionTexts: { A: 'Rimwe', B: 'Kane', C: 'Gatatu', D: 'Gatanu' },
    });
    expect(full.body).toEqual({ ok: true, state: 'complete' });
    const after = (await editor.get(`/api/admin/questions/${qid}`)).body.question;
    expect(after.version).toBe(before.version + 2);
    expect(after.translations[0]).toMatchObject({ language: 'rw', stem: 'Kabiri kongeraho kabiri ni bingahe?' });
    expect(await prisma.questionTranslation.count({ where: { questionId: qid } })).toBe(1);
    expect((await audit('question.translate', qid))).toHaveLength(2);

    // Candidates read it with ?lang=. Without it nothing changes; a test with no translation stays English.
    await system.post(`/api/admin/mock-tests/${t.id}/publish`).send({});
    const start = await request(app).post(`/api/countries/RW/mock-tests/${t.slug}/attempts`).send({});
    const tok = start.body.guestToken as string;
    const en = (await request(app).get(`/api/attempts/${start.body.attemptId}`).set('X-Guest-Token', tok)).body;
    expect(en.questions[0].stem).toBe('What is two plus two in this test?');
    expect(en.language).toBeUndefined();
    const rw = (await request(app).get(`/api/attempts/${start.body.attemptId}?lang=rw`).set('X-Guest-Token', tok)).body;
    expect(rw.questions[0]).toMatchObject({ stem: 'Kabiri kongeraho kabiri ni bingahe?' });
    // Options are shown in a per-attempt shuffled order; each keeps its translated text.
    expect([...rw.questions[0].options].sort((x: { key: string }, y: { key: string }) => x.key.localeCompare(y.key)))
      .toEqual([{ key: 'A', text: 'Rimwe' }, { key: 'B', text: 'Kane' }, { key: 'C', text: 'Gatatu' }, { key: 'D', text: 'Gatanu' }]);
    expect(rw.language).toEqual({ requested: 'rw', served: 'rw', translatedQuestions: 1, totalQuestions: 1 });
    expect(JSON.stringify(rw)).not.toMatch(/"correct"|isCorrect/); // a translation never leaks an answer
    const sw = (await request(app).get(`/api/attempts/${start.body.attemptId}?lang=sw`).set('X-Guest-Token', tok)).body;
    expect(sw.language).toEqual({ requested: 'sw', served: 'en', translatedQuestions: 0, totalQuestions: 1 });
    expect(sw.questions[0].stem).toBe('What is two plus two in this test?');
    expect((await request(app).get(`/api/attempts/${start.body.attemptId}?lang=xx`).set('X-Guest-Token', tok)).status).toBe(400);

    await request(app).post(`/api/attempts/${start.body.attemptId}/submit`).set('X-Guest-Token', tok).send({});
    const review = (await request(app).get(`/api/attempts/${start.body.attemptId}/review?filter=all&lang=rw`).set('X-Guest-Token', tok)).body;
    expect(review.items[0]).toMatchObject({ stem: 'Kabiri kongeraho kabiri ni bingahe?', explanation: 'Kuko kabiri na kabiri bivamo kane.' });
    expect(review.items[0].options.find((o: { key: string }) => o.key === 'B')).toMatchObject({ text: 'Kane', isCorrect: true });
    expect(review.language).toMatchObject({ served: 'rw', translatedQuestions: 1 });

    expect((await editor.delete(`/api/admin/questions/${qid}/translations/rw`)).body).toEqual({ ok: true });
    expect((await editor.delete(`/api/admin/questions/${qid}/translations/rw`)).body.error).toBe('translation_not_found');
  });

  it('rejects a language the test does not offer, the source language, and wrong option keys', async () => {
    const t = await makeTest();
    const qid = await addQuestion(t);
    const body = { stem: 'x', explanation: 'y', optionTexts: { A: '1', B: '2', C: '3', D: '4' } };
    expect((await editor.put(`/api/admin/questions/${qid}/translations/sw`).send(body)).body.error).toBe('language_not_in_test');
    expect((await editor.put(`/api/admin/questions/${qid}/translations/en`).send(body)).body.error).toBe('language_not_in_test');
    expect((await editor.put(`/api/admin/questions/${qid}/translations/xx`).send(body)).body.error).toBe('language_not_in_test');
    expect((await editor.put(`/api/admin/questions/${qid}/translations/rw`).send({ ...body, optionTexts: { A: '1', B: '2' } })).body.error).toBe('option_keys_mismatch');
    expect((await editor.put(`/api/admin/questions/${qid}/translations/rw`).send({ ...body, optionTexts: { A: '1', B: '2', C: '3', E: '5' } })).body.error).toBe('option_keys_mismatch');
    expect((await support.put(`/api/admin/questions/${qid}/translations/rw`).send(body)).status).toBe(403);
    const ke = await prisma.question.findFirstOrThrow({ where: { mockTest: { countryCode: 'KE' } } });
    expect((await editor.put(`/api/admin/questions/${ke.id}/translations/rw`).send(body)).status).toBe(404);
  });
});

describe('case studies: list, attach, detach, translations', () => {
  it('attaches single-answer questions of the same test, converts them, and detaches them again', async () => {
    const t = await makeTest();
    const other = await makeTest();
    const q1 = await addQuestion(t);
    const q2 = await addQuestion(t);
    const multi = await addQuestion(t, { correct: ['A', 'C'], type: 'MULTIPLE_SELECT' });
    const foreign = await addQuestion(other);
    const c = await editor.post(`/api/admin/mock-tests/${t.id}/cases`).send({ title: 'The Kigali school case', passage: ['One.', 'Two.'], tables: [], notes: [] });

    expect((await editor.post(`/api/admin/cases/${c.body.id}/attach`).send({ questionIds: [q1, foreign] })).body.error).toBe('question_not_in_test');
    expect((await editor.post(`/api/admin/cases/${c.body.id}/attach`).send({ questionIds: [q1, multi] })).body.error).toBe('exactly_one_correct_answer');
    expect((await editor.post(`/api/admin/cases/${c.body.id}/attach`).send({ questionIds: [] })).status).toBe(400);
    expect((await editor.post(`/api/admin/cases/${c.body.id}/attach`).send({ questionIds: [q1, q2] })).body).toEqual({ ok: true, attached: 2 });
    expect(await prisma.question.count({ where: { id: { in: [q1, q2] }, type: 'CASE_BASED', caseId: c.body.id } })).toBe(2);

    const got = (await editor.get(`/api/admin/cases/${c.body.id}`)).body.case;
    expect(got.questions).toBe(2);
    expect(got.attachedQuestions.map((q: { number: number }) => q.number)).toEqual([1, 2]);
    expect(got.translations).toEqual([]);
    const list = (await editor.get(`/api/admin/mock-tests/${t.id}/cases`)).body.cases;
    expect(list).toEqual([{ id: c.body.id, title: 'The Kigali school case', questions: 2, translations: [] }]);

    expect((await editor.post(`/api/admin/cases/${c.body.id}/detach`).send({ questionIds: [q2, foreign] })).body.error).toBe('question_not_in_test');
    expect((await editor.post(`/api/admin/cases/${c.body.id}/detach`).send({ questionIds: [q2] })).body).toEqual({ ok: true, detached: 1 });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: q2 } })).toMatchObject({ type: 'SINGLE_CHOICE', caseId: null });
    expect((await audit('case.attach', c.body.id))).toHaveLength(1);
    expect((await audit('case.detach', c.body.id))).toHaveLength(1);
    const ke = await prisma.case.findFirst({ where: { mockTest: { countryCode: 'KE' } } });
    if (ke) expect((await editor.post(`/api/admin/cases/${ke.id}/attach`).send({ questionIds: ['x'] })).status).toBe(404);
  });

  it('saves a translation of a case study and lists the language', async () => {
    const t = await makeTest();
    const c = await editor.post(`/api/admin/mock-tests/${t.id}/cases`).send({ title: 'A case to translate', passage: ['Only paragraph.'], tables: [{ caption: 'T', rows: [{ label: 'Rent', value: '100' }] }], notes: ['Note one'] });
    const body = { title: 'Isomo ryo guhindura', passage: ['Igika kimwe.'], tables: [{ caption: 'Imbonerahamwe', rows: [{ label: 'Ubukode', value: '100' }] }], notes: ['Icyitonderwa'] };
    expect((await editor.put(`/api/admin/cases/${c.body.id}/translations/sw`).send(body)).body.error).toBe('language_not_in_test');
    expect((await editor.put(`/api/admin/cases/${c.body.id}/translations/rw`).send({ ...body, passage: [] })).status).toBe(400);
    expect((await editor.put(`/api/admin/cases/${c.body.id}/translations/rw`).send(body)).body).toEqual({ ok: true });
    expect((await editor.put(`/api/admin/cases/${c.body.id}/translations/rw`).send({ ...body, title: 'Isomo rishya' })).status).toBe(200);
    const got = (await editor.get(`/api/admin/cases/${c.body.id}`)).body.case;
    expect(got.translations).toHaveLength(1);
    expect(got.translations[0]).toMatchObject({ language: 'rw', title: 'Isomo rishya', passage: ['Igika kimwe.'] });
    expect((await editor.get(`/api/admin/mock-tests/${t.id}/cases`)).body.cases[0].translations).toEqual(['rw']);

    // Shown to candidates in that language.
    const q = await addQuestion(t, { caseId: c.body.id });
    await system.post(`/api/admin/mock-tests/${t.id}/publish`).send({});
    const start = await request(app).post(`/api/countries/RW/mock-tests/${t.slug}/attempts`).send({});
    const rw = (await request(app).get(`/api/attempts/${start.body.attemptId}?lang=rw`).set('X-Guest-Token', start.body.guestToken)).body;
    expect(rw.cases[0]).toMatchObject({ title: 'Isomo rishya', passage: ['Igika kimwe.'], notes: ['Icyitonderwa'] });
    expect(q).toBeTruthy();

    expect((await editor.delete(`/api/admin/cases/${c.body.id}/translations/rw`)).body).toEqual({ ok: true });
    expect((await editor.delete(`/api/admin/cases/${c.body.id}/translations/rw`)).body.error).toBe('translation_not_found');
    expect((await audit('case.translate', c.body.id))).toHaveLength(2);
  });
});

describe('reordering and "used by N"', () => {
  it('reorders categories of a country and sections of a test', async () => {
    const cats = (await system.get('/api/admin/categories?country=RW')).body.categories as { id: string }[];
    const reversed = cats.map((c) => c.id).reverse();
    expect((await editor.post('/api/admin/categories/reorder').send({ countryCode: 'RW', ids: reversed })).body).toEqual({ ok: true });
    expect((await system.get('/api/admin/categories?country=RW')).body.categories.map((c: { id: string }) => c.id)).toEqual(reversed);
    expect((await editor.post('/api/admin/categories/reorder').send({ countryCode: 'RW', ids: reversed.slice(1) })).body.error).toBe('ids_mismatch');
    expect((await editor.post('/api/admin/categories/reorder').send({ countryCode: 'KE', ids: reversed })).status).toBe(404);
    expect((await editor.post('/api/admin/categories/reorder').send({ countryCode: 'ZZ', ids: reversed })).status).toBe(404);
    expect((await support.post('/api/admin/categories/reorder').send({ countryCode: 'RW', ids: reversed })).status).toBe(403);
    expect((await audit('category.reorder'))).toHaveLength(1);

    const t = await makeTest();
    const s2 = await system.post(`/api/admin/mock-tests/${t.id}/sections`).send({ name: 'Part B' });
    const s3 = await system.post(`/api/admin/mock-tests/${t.id}/sections`).send({ name: 'Part C' });
    const order = [s3.body.id, t.sectionId, s2.body.id];
    expect((await editor.post(`/api/admin/mock-tests/${t.id}/sections/reorder`).send({ ids: order })).body).toEqual({ ok: true });
    expect((await editor.get(`/api/admin/mock-tests/${t.id}`)).body.sections.map((s: { id: string }) => s.id)).toEqual(order);
    expect((await editor.post(`/api/admin/mock-tests/${t.id}/sections/reorder`).send({ ids: [s3.body.id] })).body.error).toBe('ids_mismatch');
    expect((await audit('section.reorder', t.id))).toHaveLength(1);
  });

  it('delete guards say how many things use the item', async () => {
    const t = await makeTest();
    await addQuestion(t);
    await addQuestion(t);
    const sec = await editor.delete(`/api/admin/sections/${t.sectionId}`);
    expect([sec.status, sec.body.error, sec.body.usedBy]).toEqual([409, 'section_in_use', { questions: 2 }]);
    const topicDel = await editor.delete(`/api/admin/topics/${cat.topics[0]!.id}`);
    expect(topicDel.body.error).toBe('topic_in_use');
    expect(topicDel.body.usedBy.questions).toBeGreaterThanOrEqual(2);
    const catDel = await editor.delete(`/api/admin/categories/${cat.id}`);
    expect(catDel.body.error).toBe('category_in_use');
    expect(catDel.body.usedBy).toMatchObject({ mockTests: expect.any(Number), topics: expect.any(Number), professions: expect.any(Number), users: expect.any(Number) });
    expect(catDel.body.usedBy.mockTests).toBeGreaterThan(0);
    const c = await editor.post(`/api/admin/mock-tests/${t.id}/cases`).send({ title: 'Used case here', passage: ['x'], tables: [], notes: [] });
    await addQuestion(t, { caseId: c.body.id });
    const cd = await editor.delete(`/api/admin/cases/${c.body.id}`);
    expect([cd.body.error, cd.body.usedBy]).toEqual(['case_in_use', { questions: 1 }]);
  });
});

describe('CSV import: mapping, preview, error file, template', () => {
  const header = 'Chapter,Subject,Question,A,B,C,D,Right,Why';
  it('maps differently named columns, previews, and returns the error file for bad rows', async () => {
    const t = await makeTest();
    const topic = cat.topics[0]!.name;
    const map = { section: 'Chapter', topic: 'Subject', stem: 'Question', option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D', correct: 'Right', explanation: 'Why' };
    const csv = [
      header,
      `Part A,${topic},What is the capital of Rwanda?,Kigali,Huye,Musanze,Rubavu,A,Kigali is the capital city of Rwanda.`,
      `Part A,${topic},"Which are even numbers, pick two?",2,3,4,5,A;C,Two and four are even numbers here.`,
      `Part Z,${topic},Unknown section question?,1,2,3,4,A,An explanation long enough here.`,
      `Part A,Unknown topic,Unknown topic question?,1,2,3,4,B,An explanation long enough here.`,
      `Part A,${topic},Missing correct answer question?,1,2,3,4,,An explanation long enough here.`,
    ].join('\n');

    const noMap = await editor.post(`/api/admin/mock-tests/${t.id}/import`).send({ csv, dryRun: true });
    expect(noMap.status).toBe(400);
    expect(noMap.body.error).toMatch(/^missing_columns:section,topic,stem,option_a,option_b,correct,explanation$/);
    expect(noMap.body.headers).toEqual(header.split(','));
    expect(noMap.body.missingColumns).toEqual(['section', 'topic', 'stem', 'option_a', 'option_b', 'correct', 'explanation']);

    const dry = await editor.post(`/api/admin/mock-tests/${t.id}/import`).send({ csv, dryRun: true, columnMap: map });
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ dryRun: true, totalRows: 5, validRows: 2, invalidRows: 3, headers: header.split(','), missingColumns: [] });
    expect(dry.body.problems.map((p: { row: number; problem: string }) => [p.row, p.problem])).toEqual([[4, 'unknown_section:Part Z'], [5, 'unknown_topic:Unknown topic'], [6, 'missing_correct']]);
    expect(dry.body.preview).toHaveLength(2);
    expect(dry.body.preview[0]).toMatchObject({ row: 2, section: 'Part A', topic, stem: 'What is the capital of Rwanda?', correct: ['A'] });
    expect(dry.body.preview[1].correct).toEqual(['A', 'C']);
    const errorRows = dry.body.errorCsv.trim().split(/\r?\n/);
    expect(errorRows[0]).toBe(`${header},problems`);
    expect(errorRows).toHaveLength(4);
    expect(errorRows[1]).toContain('Part Z');
    expect(errorRows[1]).toContain('section: unknown_section:Part Z');
    expect(errorRows[3]).toContain('correct: missing_correct');
    expect(await prisma.question.count({ where: { mockTestId: t.id } })).toBe(0);

    const refuse = await editor.post(`/api/admin/mock-tests/${t.id}/import`).send({ csv, columnMap: map });
    expect([refuse.status, refuse.body.error]).toEqual([409, 'import_has_errors']);
    expect(refuse.body.errorCsv).toBe(dry.body.errorCsv);
    const real = await editor.post(`/api/admin/mock-tests/${t.id}/import`).send({ csv, columnMap: map, importValidRows: true });
    expect(real.status).toBe(201);
    expect(real.body).toMatchObject({ created: 2, invalidRows: 3 });
    expect((await prisma.question.findMany({ where: { mockTestId: t.id } })).every((q) => q.status === 'DRAFT')).toBe(true);
  });

  it('a clean file has an empty error file; the template lists the columns', async () => {
    const t = await makeTest();
    const topic = cat.topics[0]!.name;
    const csv = `section,topic,stem,option_a,option_b,correct,explanation\nPart A,${topic},A clean question here?,Yes,No,A,Because yes is right here.`;
    const dry = (await editor.post(`/api/admin/mock-tests/${t.id}/import`).send({ csv, dryRun: true })).body;
    expect(dry).toMatchObject({ validRows: 1, invalidRows: 0, errorCsv: '' });
    const tpl = (await editor.get('/api/admin/import-template')).body;
    expect(tpl.columns.filter((c: { required: boolean }) => c.required).map((c: { name: string }) => c.name)).toEqual(['section', 'topic', 'stem', 'option_a', 'option_b', 'correct', 'explanation']);
    expect(tpl.csv.split(/\r?\n/)[0]).toBe('section,topic,stem,option_a,option_b,option_c,option_d,correct,explanation,marks,difficulty');
    expect((await support.get('/api/admin/import-template')).status).toBe(403);
    // The template's own example parses cleanly once its section and topic exist.
    const example = tpl.csv.replace('Algebra', 'Part A').replace('Linear equations', topic);
    expect((await editor.post(`/api/admin/mock-tests/${t.id}/import`).send({ csv: example, dryRun: true })).body).toMatchObject({ validRows: 1, invalidRows: 0 });
  });
});

describe('audit log: filters, detail, export', () => {
  it('lists the options that exist, finds an entry by search, shows its detail and exports the same view', async () => {
    const t = await makeTest();
    await addQuestion(t);
    await editor.post(`/api/admin/mock-tests/${t.id}/unpublish`).send({ reason: 'Never published at all' }); // conflict, no entry
    await system.post(`/api/admin/mock-tests/${t.id}/publish`).send({});
    await system.post(`/api/admin/mock-tests/${t.id}/unpublish`).send({ reason: 'Wrong duration was set' });

    const f = (await system.get('/api/admin/audit/filters')).body;
    expect(f.actions).toContain('mock_test.unpublish');
    expect(f.entityTypes).toContain('mock_test');
    const sys = await prisma.user.findUniqueOrThrow({ where: { email: ADMINS.SYSTEM } });
    expect(f.actors).toContainEqual({ id: sys.id, name: sys.name });

    const found = (await system.get('/api/admin/audit?q=duration')).body;
    expect(found.results).toHaveLength(1);
    expect(found.results[0]).toMatchObject({ action: 'mock_test.unpublish', reason: 'Wrong duration was set' });
    expect((await system.get(`/api/admin/audit?q=${encodeURIComponent(sys.name.slice(0, 4))}`)).body.total).toBeGreaterThan(0);
    expect((await system.get('/api/admin/audit?q=mock_test.unpub')).body.total).toBeGreaterThan(0);

    const detail = (await system.get(`/api/admin/audit/${found.results[0].id}`)).body.entry;
    expect(detail).toMatchObject({ action: 'mock_test.unpublish', entityId: t.id, actor: { id: sys.id, email: ADMINS.SYSTEM }, countryCode: 'RW' });
    expect(detail.metadata).toMatchObject({ title: expect.any(String), attemptsInProgress: 0 });
    expect(detail.summary).toMatch(/^unpublished /);
    expect((await system.get('/api/admin/audit/nope')).body.error).toBe('audit_entry_not_found');

    const exp = await system.get('/api/admin/audit/export?q=Wrong%20duration');
    expect(exp.status).toBe(200);
    expect(exp.headers['content-type']).toMatch(/text\/csv/);
    expect(exp.headers['content-disposition']).toMatch(/attachment; filename="audit-log\.csv"/);
    const lines = exp.text.replace('﻿', '').trim().split(/\r?\n/);
    expect(lines[0]).toBe('time,actor,action,entityType,entityId,country,reason,summary');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Wrong duration was set');
    expect((await audit('audit.export'))).toHaveLength(1);

    for (const a of [editor, support]) {
      expect((await a.get('/api/admin/audit/filters')).status).toBe(403);
      expect((await a.get('/api/admin/audit/export')).status).toBe(403);
      expect((await a.get(`/api/admin/audit/${found.results[0].id}`)).status).toBe(403);
    }
  });

  it('spreadsheet formulas in the exported text are neutralised', async () => {
    await prisma.auditLog.create({ data: { action: 'otp.resend', entityType: 'user', reason: '=HYPERLINK("http://evil")', metadata: {} } });
    const text = (await system.get('/api/admin/audit/export?action=otp.resend')).text;
    expect(text).toContain("'=HYPERLINK");
    expect(text).not.toMatch(/,=HYPERLINK/);
  });
});

describe('team: last active', () => {
  it('shows when each person last used the app', async () => {
    const when = new Date('2026-11-01T08:00:00Z');
    await prisma.user.update({ where: { email: ADMINS.SUPPORT }, data: { lastSeenAt: when } });
    const team = (await system.get('/api/admin/team')).body.team;
    expect(team.find((m: { email: string }) => m.email === ADMINS.SUPPORT).lastActiveAt).toBe(when.toISOString());
    expect(team.every((m: Record<string, unknown>) => 'lastActiveAt' in m)).toBe(true);
  });
});

describe('country actions: provider status, support contact, impact', () => {
  it('shows each payment method\'s status with the callback URL and never a secret', async () => {
    const strong = createApp({
      prisma, config: testConfig({ PAYMENT_PROVIDER_MODE: 'sandbox', PAWAPAY_API_TOKEN: 'secret-token-value-123', PAWAPAY_CALLBACK_SECRET: 'callback-secret-0123456789' }), email: mail, now: () => clock,
    });
    const a = await adminAgent(strong, mail, ADMINS.SYSTEM);
    const res = await a.get('/api/admin/countries/RW');
    const mtn = res.body.paymentMethods.find((m: { provider: string }) => m.provider === 'MTN_MOMO');
    expect(mtn.providerStatus).toMatchObject({ adapter: 'pawapay', credentialsConfigured: true, callbackUrl: 'http://localhost:4000/api/payments/webhooks/pawapay' });
    expect(mtn.providerStatus).toHaveProperty('lastPaymentAt');
    expect(mtn.providerStatus).toHaveProperty('lastSuccessAt');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('secret-token-value-123');
    expect(raw).not.toContain('callback-secret-0123456789');
    expect(raw).not.toContain('token=');

    const fake = (await system.get('/api/admin/countries/RW')).body.paymentMethods[0].providerStatus;
    expect(fake).toMatchObject({ adapter: 'fake', credentialsConfigured: true });
    const direct = createApp({ prisma, config: testConfig({ PAYMENT_PROVIDER_MODE: 'sandbox' }), email: mail, now: () => clock });
    const d = await adminAgent(direct, mail, ADMINS.SYSTEM);
    const directMethods = (await d.get('/api/admin/countries/RW')).body.paymentMethods as { provider: string; providerStatus: { adapter: string; credentialsConfigured: boolean; callbackUrl: string } }[];
    // MTN MoMo and Airtel Money no longer have a direct adapter (pawaPay is their only path): no credentials, no webhook.
    const mtnDirect = directMethods.find((m) => m.provider === 'MTN_MOMO')!.providerStatus;
    expect(mtnDirect).toMatchObject({ adapter: 'direct', credentialsConfigured: false, callbackUrl: '' });
    // M-Pesa still has a direct adapter.
    const mpesaDirect = directMethods.find((m) => m.provider === 'MPESA')?.providerStatus;
    if (mpesaDirect) {
      expect(mpesaDirect.adapter).toBe('direct');
      expect(mpesaDirect.callbackUrl).toMatch(/\/api\/payments\/webhooks\/mpesa$/);
    }
  });

  it('last payment times follow the payments', async () => {
    const u = await signedInAgent(app, mail, 'missing.provider@example.com');
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    const confirmed = new Date('2026-11-01T12:00:00Z');
    await prisma.payment.create({ data: { userId: u.userId, countryCode: 'RW', planId: plan.id, provider: 'AIRTEL_MONEY', msisdn: '+250788610001', amountMinor: 2000, currencyCode: 'RWF', idempotencyKey: 'prov-1', status: 'SUCCESSFUL', expiresAt: confirmed, confirmedAt: confirmed, createdAt: confirmed } });
    const airtel = (await system.get('/api/admin/countries/RW')).body.paymentMethods.find((m: { provider: string }) => m.provider === 'AIRTEL_MONEY');
    expect(airtel.providerStatus.lastSuccessAt).toBe(confirmed.toISOString());
  });

  it('saves a support contact (kept per field, audited) and the public API reads it', async () => {
    const res = await system.patch('/api/admin/countries/KE').send({ supportContact: { phone: '+254 711 222 333', email: 'help@jobprep.co.ke', hours: null } });
    expect(res.status).toBe(200);
    const ke = (await system.get('/api/admin/countries/KE')).body.supportContact;
    expect(ke).toMatchObject({ phone: '+254 711 222 333', email: 'help@jobprep.co.ke', configured: true, placeholder: false });
    expect(ke.hours).toBeNull();
    expect(ke.whatsapp).toBe('+254 700 000 000'); // fields not sent keep their value
    expect((await request(app).get('/api/countries/KE/support')).body.supportContact.email).toBe('help@jobprep.co.ke');
    expect((await audit('country.support.set', 'KE'))).toHaveLength(1);
    expect((await system.patch('/api/admin/countries/KE').send({ supportContact: { email: 'not an email' } })).status).toBe(400);
    expect((await system.patch('/api/admin/countries/KE').send({ supportContact: { phone: '' } })).status).toBe(200);
    expect((await system.get('/api/admin/countries/KE')).body.supportContact.phone).toBeNull();
    expect((await editor.patch('/api/admin/countries/KE').send({ supportContact: { phone: '1' } })).status).toBe(403);
  });

  it('the country detail says whether legal pages are real or placeholder', async () => {
    const before = (await system.get('/api/admin/countries/KE')).body.legal;
    expect(before.pages.map((p: { slug: string; overridden: boolean }) => [p.slug, p.overridden])).toEqual([['terms', false], ['privacy', false], ['refund', false], ['cookies', false]]);
    await system.put('/api/admin/legal/terms').send({ countryCode: 'KE', sections: [{ heading: 'Kenya terms', paragraphs: ['Real text.'] }] });
    const after = (await system.get('/api/admin/countries/KE')).body.legal;
    expect(after.pages.find((p: { slug: string }) => p.slug === 'terms').overridden).toBe(true);
    expect(typeof after.reviewed).toBe('boolean');
    expect((await editor.put('/api/admin/legal/terms').send({ sections: [{ heading: 'No', paragraphs: ['no'] }] })).status).toBe(403);
    expect((await system.put('/api/admin/legal/nope').send({ sections: [{ heading: 'No', paragraphs: ['no'] }] })).status).toBe(400);
    expect((await system.put('/api/admin/legal/terms').send({ countryCode: 'ZZ', sections: [{ heading: 'No', paragraphs: ['no'] }] })).status).toBe(404);
    expect((await audit('legal.update'))).toHaveLength(1);
  });

  it('status-impact gives the numbers for the confirmation dialog', async () => {
    const rw = (await system.get('/api/admin/countries/RW/status-impact?to=PREPARING')).body;
    expect(rw).toMatchObject({ from: 'LIVE', to: 'PREPARING', publishedTests: expect.any(Number), users: expect.any(Number), attemptsInProgress: expect.any(Number), activeAccessGrants: expect.any(Number) });
    expect(rw.checklist).toHaveLength(4);
    const ke = (await system.get('/api/admin/countries/KE/status-impact?to=LIVE')).body;
    expect(ke).toMatchObject({ from: 'PREPARING', to: 'LIVE', readyToLaunch: false });
    expect((await system.get('/api/admin/countries/KE/status-impact?to=NOPE')).status).toBe(400);
    expect((await system.get('/api/admin/countries/ZZ/status-impact?to=LIVE')).status).toBe(404);
    expect((await editor.get('/api/admin/countries/RW/status-impact?to=LIVE')).status).toBe(403);
  });
});

describe('demand: exam requests', () => {
  it('groups by search, marks them done, optionally emails the requesters, and hides done ones from the overview', async () => {
    const post = (q: string, email?: string) => request(app).post('/api/countries/RW/exam-requests').send({ query: q, ...(email && { email }) });
    await post('Veterinary officer', 'vet.a@example.com');
    await post('veterinary  OFFICER', 'vet.b@example.com');
    await post('Veterinary officer');
    await post('Veterinary Officer', 'vet.c@example.com');
    await post('Land surveyor', 'land.a@example.com');

    const open = (await editor.get('/api/admin/demand/exam-requests')).body;
    const vet = open.results.find((r: { query: string }) => r.query === 'Veterinary officer');
    expect(vet).toMatchObject({ countryCode: 'RW', count: 4, withEmail: 3, status: 'OPEN', key: 'RW:veterinary officer' });
    expect(vet.lastAt >= vet.firstAt).toBe(true);
    expect(open.results[0].query).toBe('Veterinary officer'); // most requested first
    expect((await editor.get('/api/admin/demand/exam-requests?q=SURVEY')).body.results.map((r: { query: string }) => r.query)).toEqual(['Land surveyor']);
    const ov = (await editor.get('/api/admin/overview')).body.needsAttention.examRequests;
    expect(ov[0]).toMatchObject({ label: 'Veterinary officer', n: 4 });

    mail.clear();
    expect((await support.post('/api/admin/demand/exam-requests/done').send({ countryCode: 'RW', query: 'Veterinary officer' })).status).toBe(403);
    expect((await editor.post('/api/admin/demand/exam-requests/done').send({ countryCode: 'RW', query: 'Nothing like it' })).body.error).toBe('request_not_found');
    expect((await editor.post('/api/admin/demand/exam-requests/done').send({ countryCode: 'KE', query: 'Veterinary officer' })).status).toBe(404);
    const done = await editor.post('/api/admin/demand/exam-requests/done').send({ countryCode: 'rw', query: '  veterinary officer ', reason: 'Added as Vet mock 1', notify: true });
    expect(done.body).toEqual({ ok: true, marked: 4, notified: 3 });
    expect(mail.sent.map((m) => m.to).sort()).toEqual(['vet.a@example.com', 'vet.b@example.com', 'vet.c@example.com']);
    expect(mail.sent[0]!.text).toContain('Veterinary officer');
    expect((await audit('demand.exam_request.done', 'RW:veterinary officer'))[0]).toMatchObject({ reason: 'Added as Vet mock 1', countryCode: 'RW' });

    expect((await editor.get('/api/admin/demand/exam-requests')).body.results.map((r: { query: string }) => r.query)).toEqual(['Land surveyor']);
    const doneList = (await editor.get('/api/admin/demand/exam-requests?status=done')).body.results;
    expect(doneList[0]).toMatchObject({ query: 'Veterinary officer', count: 4, status: 'DONE', doneNote: 'Added as Vet mock 1', doneBy: 'Marie C.' });
    expect((await editor.get('/api/admin/overview')).body.needsAttention.examRequests.map((r: { label: string }) => r.label)).not.toContain('Veterinary officer');
    expect((await editor.post('/api/admin/demand/exam-requests/done').send({ countryCode: 'RW', query: 'Veterinary officer' })).body.error).toBe('request_not_found');

    // Marking without notify sends nothing.
    mail.clear();
    expect((await editor.post('/api/admin/demand/exam-requests/done').send({ countryCode: 'RW', query: 'Land surveyor' })).body).toEqual({ ok: true, marked: 1, notified: 0 });
    expect(mail.sent).toHaveLength(0);
  });

  it('a country-scoped editor sees only their country\'s requests', async () => {
    await prisma.examRequest.create({ data: { countryCode: 'KE', query: 'Clinical officer', normalizedQuery: 'clinical officer' } });
    expect((await editor.get('/api/admin/demand/exam-requests?pageSize=100')).body.results.every((r: { countryCode: string }) => r.countryCode === 'RW')).toBe(true);
    expect((await editor.get('/api/admin/demand/exam-requests?country=KE')).status).toBe(404);
    expect((await system.get('/api/admin/demand/exam-requests?country=KE')).body.results[0].query).toBe('Clinical officer');
    expect((await support.get('/api/admin/demand/exam-requests')).status).toBe(403);
  });
});

describe('demand: waiting list', () => {
  it('counts per country, lists entries, exports CSV, and notifies once the country is live', async () => {
    const join = (email: string, interest?: string) => request(app).post('/api/countries/KE/waiting-list').send({ email, ...(interest && { interest }) });
    await join('wl.one@example.com', 'TSC teacher');
    await join('wl.two@example.com');
    await join('wl.three@example.com', '=SUM(1+1)');

    const list = (await system.get('/api/admin/demand/waiting-list')).body;
    const ke = list.countries.find((c: { code: string }) => c.code === 'KE');
    expect(ke).toMatchObject({ name: 'Kenya', status: 'PREPARING', count: expect.any(Number), notified: 0 });
    expect(ke.count).toBeGreaterThanOrEqual(3);
    expect(list.entries).toBeUndefined();
    const detail = (await system.get('/api/admin/demand/waiting-list?country=KE&pageSize=2')).body;
    expect(detail.entries).toHaveLength(2);
    expect(detail.total).toBe(ke.count);
    expect(detail.entries[0]).toHaveProperty('email');

    const csv = await system.get('/api/admin/demand/waiting-list/export?country=KE');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.text.replace('﻿', '').trim().split(/\r?\n/);
    expect(lines[0]).toBe('country,email,interest,joined,notified');
    expect(lines.length).toBe(ke.count + 1);
    expect(csv.text).toContain("'=SUM(1+1)");
    expect((await audit('export.waiting_list'))[0]!.metadata).toMatchObject({ rows: ke.count, country: 'KE' });

    // Notify only works once the country is live; each person is told once.
    expect((await system.post('/api/admin/demand/waiting-list/notify').send({ countryCode: 'KE', reason: 'Kenya is going live' })).body.error).toBe('country_not_live');
    expect((await system.post('/api/admin/demand/waiting-list/notify').send({ countryCode: 'KE' })).status).toBe(400);
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      mail.clear();
      const out = await system.post('/api/admin/demand/waiting-list/notify').send({ countryCode: 'KE', reason: 'Kenya is going live' });
      expect(out.body).toEqual({ ok: true, notified: ke.count, failed: 0 });
      expect(mail.sent.some((m) => m.to === 'wl.one@example.com' && /open/i.test(m.subject))).toBe(true);
      expect(await prisma.waitingListEntry.count({ where: { countryCode: 'KE', notifiedAt: null } })).toBe(0);
      mail.clear();
      expect((await system.post('/api/admin/demand/waiting-list/notify').send({ countryCode: 'KE', reason: 'Kenya is going live' })).body.notified).toBe(0);
      expect(mail.sent).toHaveLength(0);
      expect((await system.get('/api/admin/demand/waiting-list')).body.countries.find((c: { code: string }) => c.code === 'KE').notified).toBe(ke.count);
      expect((await audit('demand.waiting_list.notify', 'KE'))[0]).toMatchObject({ reason: 'Kenya is going live' });
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });

  it('a failing mail server leaves the person un-notified (so the next click retries)', async () => {
    await prisma.country.update({ where: { code: 'TZ' }, data: { status: 'LIVE' } });
    try {
      await prisma.waitingListEntry.create({ data: { countryCode: 'TZ', email: 'tz.one@example.com' } });
      const broken = createApp({ prisma, config, email: { send: async () => { throw new Error('smtp down'); } }, now: () => clock });
      const a = await adminAgent(broken, mail, ADMINS.SYSTEM);
      expect((await a.post('/api/admin/demand/waiting-list/notify').send({ countryCode: 'TZ', reason: 'Tanzania is open' })).body).toEqual({ ok: true, notified: 0, failed: 1 });
      expect((await prisma.waitingListEntry.findFirstOrThrow({ where: { countryCode: 'TZ' } })).notifiedAt).toBeNull();
    } finally {
      await prisma.country.update({ where: { code: 'TZ' }, data: { status: 'PLANNED' } });
    }
  });

  it('only people who may see the country can see its list', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'SYSTEM_ADMIN' } });
    expect(role).toBeTruthy();
    for (const a of [editor, support]) {
      expect((await a.get('/api/admin/demand/waiting-list')).status).toBe(403);
      expect((await a.get('/api/admin/demand/waiting-list/export')).status).toBe(403);
      expect((await a.post('/api/admin/demand/waiting-list/notify').send({ countryCode: 'KE', reason: 'trying it' })).status).toBe(403);
    }
  });
});

describe('payments: accounting export and the detail flags', () => {
  it('exports CSV for a date range, country and status; masks the payer number; logs the export', async () => {
    const u = await signedInAgent(app, mail, 'missing.export@example.com');
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    const mk = (key: string, status: 'SUCCESSFUL' | 'DECLINED' | 'PENDING', when: string, extra: Record<string, unknown> = {}) =>
      prisma.payment.create({
        data: {
          userId: u.userId, countryCode: 'RW', planId: plan.id, provider: 'MTN_MOMO', msisdn: '+250788123456', amountMinor: 2000, currencyCode: 'RWF', idempotencyKey: key, status,
          expiresAt: new Date(when), createdAt: new Date(when), ...(status === 'SUCCESSFUL' && { confirmedAt: new Date(when), transactionId: `TX-${key}` }), ...extra,
        },
      });
    const inRange = await mk('exp-in', 'SUCCESSFUL', '2026-10-10T09:00:00Z');
    await mk('exp-edge', 'SUCCESSFUL', '2026-10-15T23:59:00Z');
    await mk('exp-out', 'SUCCESSFUL', '2026-10-16T00:01:00Z');
    await mk('exp-before', 'SUCCESSFUL', '2026-10-09T23:59:00Z');
    await mk('exp-declined', 'DECLINED', '2026-10-12T09:00:00Z');
    await prisma.user.update({ where: { id: u.userId }, data: { name: '=cmd|calc' } });

    const res = await system.get('/api/admin/payments/export?from=2026-10-10&to=2026-10-15&country=RW');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="payments-2026-10-10-to-2026-10-15\.csv"/);
    const lines = res.text.replace('﻿', '').trim().split(/\r?\n/);
    expect(lines[0]).toBe('date,payment_id,country,currency,amount,status,provider,payer_number_masked,customer_name,customer_email,operator_reference,transaction_id,confirmed_at,access_until');
    expect(lines).toHaveLength(3); // paid only by default; the 15th is inside the range, the 16th and the 9th are not
    expect(lines[1]).toContain(inRange.id);
    expect(lines[1]).toContain(',RW,RWF,2000,SUCCESSFUL,MTN_MOMO,****3456,');
    expect(lines[1]).toContain("'=cmd|calc"); // formulas neutralised
    expect(res.text).not.toContain('+250788123456');
    expect(res.text).not.toContain('788123456');

    const failed = (await system.get('/api/admin/payments/export?from=2026-10-10&to=2026-10-15&status=failed')).text.trim().split(/\r?\n/);
    expect(failed).toHaveLength(2);
    expect(failed[1]).toContain('DECLINED');
    expect((await system.get('/api/admin/payments/export?from=2026-10-15&to=2026-10-10')).body.error).toBe('invalid_range');
    expect((await system.get('/api/admin/payments/export?from=yesterday')).status).toBe(400);
    expect((await system.get('/api/admin/payments/export?status=nope')).status).toBe(400);
    expect((await audit('export.payments')).at(-1)!.metadata).toMatchObject({ from: '2026-10-10', to: '2026-10-15', status: 'failed' });
    expect((await support.get('/api/admin/payments/export?from=2026-10-10')).status).toBe(200); // support may read payments
    expect((await editor.get('/api/admin/payments/export')).status).toBe(403);
  });

  it('keeps a country-scoped person to their own countries (Kenya export is a 404, not an empty file)', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPPORT' } });
    await prisma.user.create({ data: { email: 'ke.export@jobprep.test', name: 'Kenya Export', countryCode: 'RW', ...(await readyAccount()), roles: { create: { roleId: role.id, countryScope: ['KE'] } } } });
    const ke = await adminAgent(app, mail, 'ke.export@jobprep.test');
    expect((await ke.get('/api/admin/payments/export?country=RW')).status).toBe(404);
    expect((await ke.get('/api/admin/payments/export?country=KE')).status).toBe(200);
    const all = (await ke.get('/api/admin/payments/export?status=all')).text.trim().split(/\r?\n/);
    expect(all).toHaveLength(1); // header only: no Kenya payments, and no Rwanda rows leak
  });

  it('the payment detail says what the buttons may do', async () => {
    const u = await signedInAgent(app, mail, 'missing.detail@example.com');
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    const mk = (key: string, status: 'PENDING' | 'EXPIRED' | 'DECLINED' | 'SUCCESSFUL', minutesAgo: number, expiresInMs: number) =>
      prisma.payment.create({
        data: {
          userId: u.userId, countryCode: 'RW', planId: plan.id, provider: 'MTN_MOMO', msisdn: '+250788610002', amountMinor: 2000, currencyCode: 'RWF', idempotencyKey: key, status,
          createdAt: new Date(clock.getTime() - minutesAgo * 60_000), expiresAt: new Date(clock.getTime() + expiresInMs),
        },
      });
    const fresh = await mk('det-fresh', 'PENDING', 2, 60_000);
    const stuck = await mk('det-stuck', 'PENDING', 25, -60_000);
    const expiredRecent = await mk('det-exp', 'EXPIRED', 40, -20 * 60_000);
    const declined = await mk('det-dec', 'DECLINED', 50, -40 * 60_000);
    const expiredOld = await mk('det-oldexp', 'EXPIRED', 900, -800 * 60_000);
    const get = async (id: string) => (await support.get(`/api/admin/payments/${id}`)).body.payment;
    expect(await get(fresh.id)).toMatchObject({ stuck: false, waitingMinutes: 2, canCheck: true, canManualGrant: true, ageMinutes: 2 });
    expect(await get(stuck.id)).toMatchObject({ stuck: true, waitingMinutes: 25, canCheck: true, canManualGrant: true });
    expect(await get(expiredRecent.id)).toMatchObject({ stuck: false, waitingMinutes: null, canCheck: true, canManualGrant: true });
    expect(await get(declined.id)).toMatchObject({ canCheck: false, canManualGrant: false });
    expect(await get(expiredOld.id)).toMatchObject({ canCheck: false, canManualGrant: true });
  });
});

describe('candidate view and access preview (support)', () => {
  it('shows the person\'s dashboard, attempts and payments read-only, logs the look-up, and respects country scope', async () => {
    const u = await signedInAgent(app, mail, 'missing.viewas@example.com');
    const s = await u.agent.post('/api/countries/RW/mock-tests/secondary-mathematics-teacher-s1-s3-mock-1/attempts').send({});
    await u.agent.post(`/api/attempts/${s.body.attemptId}/submit`).send({});
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.payment.create({ data: { userId: u.userId, countryCode: 'RW', planId: plan.id, provider: 'MTN_MOMO', msisdn: '+250788610003', amountMinor: 2000, currencyCode: 'RWF', idempotencyKey: 'viewas-1', status: 'DECLINED', expiresAt: clock } });

    const before = await prisma.auditLog.count({ where: { action: 'user.view_as_candidate' } });
    const res = await support.get(`/api/admin/users/${u.userId}/candidate-view`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      readOnly: true, user: { id: u.userId, email: u.email }, country: { code: 'RW' }, access: { current: null },
      dashboard: { user: { name: 'Test Candidate' }, hasActivity: true },
    });
    expect(res.body.attempts[0]).toMatchObject({ id: s.body.attemptId, kind: 'FULL', status: 'SUBMITTED' });
    expect(res.body.payments[0]).toMatchObject({ status: 'DECLINED', priceLabel: 'RWF 2,000', transactionId: null });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash|scrypt\$/);
    expect(await prisma.auditLog.count({ where: { action: 'user.view_as_candidate' } })).toBe(before + 1);
    const [entry] = await prisma.auditLog.findMany({ where: { action: 'user.view_as_candidate' }, orderBy: { createdAt: 'desc' }, take: 1, include: { actor: true } });
    expect(entry).toMatchObject({ entityId: u.userId, countryCode: 'RW' });
    expect(entry!.actor?.email).toBe(ADMINS.SUPPORT);
    // Read only: nothing about the person changed and the support agent is not signed in as them.
    expect((await support.get('/api/me')).body.user.email).toBe(ADMINS.SUPPORT);

    expect((await editor.get(`/api/admin/users/${u.userId}/candidate-view`)).status).toBe(403);
    expect((await support.get('/api/admin/users/nope/candidate-view')).status).toBe(404);
  });

  it('a Kenya-only support agent cannot look at a Rwanda candidate', async () => {
    const u = await signedInAgent(app, mail, 'missing.viewas2@example.com');
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPPORT' } });
    await prisma.user.create({ data: { email: 'ke.viewas@jobprep.test', name: 'Kenya View', countryCode: 'RW', ...(await readyAccount()), roles: { create: { roleId: role.id, countryScope: ['KE'] } } } });
    const ke = await adminAgent(app, mail, 'ke.viewas@jobprep.test');
    expect((await ke.get(`/api/admin/users/${u.userId}/candidate-view`)).status).toBe(404);
    expect((await ke.get(`/api/admin/users/${u.userId}/access-preview`)).status).toBe(404);
  });

  it('previews the window a grant would get, chained after running access', async () => {
    const u = await signedInAgent(app, mail, 'missing.preview@example.com');
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    const fresh = (await support.get(`/api/admin/users/${u.userId}/access-preview`)).body;
    expect(fresh).toMatchObject({ days: 30, currentEndsAt: null });
    expect(fresh.startsAt).toBe(clock.toISOString());
    expect(fresh.endsAt).toBe(new Date(clock.getTime() + 30 * 86_400_000).toISOString());
    const seven = (await support.get(`/api/admin/users/${u.userId}/access-preview?days=7`)).body;
    expect(seven.endsAt).toBe(new Date(clock.getTime() + 7 * 86_400_000).toISOString());

    const g = await system.post(`/api/admin/users/${u.userId}/access`).send({ days: 10, reason: 'Compensation for an outage' });
    const chained = (await support.get(`/api/admin/users/${u.userId}/access-preview?days=5`)).body;
    expect(chained.currentEndsAt).toBe(g.body.endsAt);
    expect(chained.startsAt).toBe(g.body.endsAt);
    expect(chained.endsAt).toBe(new Date(new Date(g.body.endsAt).getTime() + 5 * 86_400_000).toISOString());
    expect(await prisma.accessGrant.count({ where: { userId: u.userId } })).toBe(1); // a preview creates nothing
    expect((await support.get(`/api/admin/users/${u.userId}/access-preview?days=0`)).status).toBe(400);
    expect((await support.get(`/api/admin/users/${u.userId}/access-preview?countryCode=ZZ`)).body.error).toBe('no_plan_for_country');
    expect(plan.durationDays).toBe(30);
  });
});
