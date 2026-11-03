import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { QuestionPayload } from '../../src/domain/scoring';
import { createPracticeAttempt } from '../../src/services/results';
import { ConsoleEmailProvider } from '../../src/services/email';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
let clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: testConfig(), email: mail, now: () => clock });
const advance = (secs: number) => { clock = new Date(clock.getTime() + secs * 1000); };

const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1'; // 20 questions, 21 marks
const startPath = (slug: string) => `/api/countries/RW/mock-tests/${slug}/attempts`;
let emailSeq = 400000;
const nextEmail = () => `user${emailSeq++}@example.com`;

beforeAll(() => resetAndSeed(prisma));
beforeEach(() => { clock = new Date('2026-11-02T10:00:00Z'); mail.clear(); });
afterAll(() => prisma.$disconnect());

/** A client that is either a guest (token header) or a signed-in agent. */
type Client = { get(u: string): request.Test; put(u: string, b: object): request.Test; post(u: string, b?: object): request.Test; patch(u: string, b: object): request.Test };
const guestClient = (token: string): Client => ({
  get: (u) => request(app).get(u).set('X-Guest-Token', token),
  put: (u, b) => request(app).put(u).set('X-Guest-Token', token).send(b),
  post: (u, b = {}) => request(app).post(u).set('X-Guest-Token', token).send(b),
  patch: (u, b) => request(app).patch(u).set('X-Guest-Token', token).send(b),
});
const agentClient = (a: ReturnType<typeof request.agent>): Client => ({
  get: (u) => a.get(u), put: (u, b) => a.put(u).send(b), post: (u, b = {}) => a.post(u).send(b), patch: (u, b) => a.patch(u).send(b),
});

async function key(slug: string) {
  const qs = await prisma.question.findMany({ where: { mockTest: { slug, countryCode: 'RW' } }, orderBy: { sortOrder: 'asc' } });
  return qs.map((q) => {
    const p = q.payload as unknown as QuestionPayload;
    return { id: q.id, correct: p.correct, wrong: p.options.find((o) => !p.correct.includes(o.key))!.key };
  });
}

async function guestStart(slug = MATHS, token?: string) {
  const r = request(app).post(startPath(slug));
  if (token) r.set('X-Guest-Token', token);
  const res = await r.send({});
  expect(res.status).toBeLessThan(300);
  return { id: res.body.attemptId as string, token: res.body.guestToken as string };
}

type Pick = 'right' | 'wrong' | string[] | null;
/** Answer a test by question index. `null` = leave unanswered. */
async function play(c: Client, attemptId: string, slug: string, plan: Record<number, Pick>, flags: number[] = []) {
  const k = await key(slug);
  const changes: object[] = [];
  k.forEach((q, i) => {
    const p = plan[i];
    const selected = p === 'right' ? q.correct : p === 'wrong' ? [q.wrong] : Array.isArray(p) ? p : undefined;
    if (selected || flags.includes(i)) changes.push({ questionId: q.id, ...(selected && { selected }), ...(flags.includes(i) && { flagged: true }) });
  });
  const res = await c.put(`/api/attempts/${attemptId}/answers`, { changes });
  expect(res.status).toBe(200);
}
const range = (a: number, b: number, v: Pick): Record<number, Pick> => Object.fromEntries(Array.from({ length: b - a + 1 }, (_, i) => [a + i, v]));

// Maths S1–S3 layout: 0–5 Algebra · 6 Number (multi, 2 marks) · 7–11 Geometry · 12–15 Statistics · 16–19 Pedagogy
const PLAN_A: Record<number, Pick> = {
  ...range(0, 5, 'right'), 6: ['A'], ...range(7, 9, 'right'), ...range(10, 11, 'wrong'), 12: 'right', ...range(13, 15, 'wrong'),
}; // 11 of 21 marks; pedagogy skipped
const PLAN_B: Record<number, Pick> = { ...range(0, 19, 'right'), 6: ['A', 'C'], ...range(13, 14, 'wrong') }; // 19 of 21

describe('results', () => {
  it('score, counts, per-topic performance and weak areas are computed from the answers', async () => {
    const { id, token } = await guestStart();
    const c = guestClient(token);
    await play(c, id, MATHS, PLAN_A, [10, 16]);
    advance(600);
    await c.post(`/api/attempts/${id}/submit`);

    const res = await c.get(`/api/attempts/${id}/result`);
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.score).toEqual({ marks: 11, totalMarks: 21, percent: 52.38 });
    expect(b.counts).toEqual({ total: 20, correct: 10, incorrect: 6, unanswered: 4 });
    expect(b.attempt).toMatchObject({ status: 'SUBMITTED', autoSubmitted: false, timeSpentSeconds: 600, kind: 'FULL' });
    expect(b.mockTest).toMatchObject({ slug: MATHS, title: 'Secondary Mathematics Teacher (S1–S3) — Mock 1' });

    const byName = Object.fromEntries(b.topics.map((t: { name: string }) => [t.name, t]));
    expect(byName['Algebra & functions']).toMatchObject({ correct: 6, total: 6, percent: 100, weak: false });
    expect(byName['Number & operations']).toMatchObject({ correct: 0, total: 1, marks: 1, marksAvailable: 2, percent: 50, weak: true }); // 50% is under the 60% cut-off
    expect(byName['Geometry & measurement']).toMatchObject({ correct: 3, total: 5, percent: 60, weak: false }); // 60% is not < 60
    expect(byName['Statistics & probability']).toMatchObject({ correct: 1, total: 4, percent: 25, weak: true });
    expect(byName['Pedagogy & CBC']).toMatchObject({ correct: 0, total: 4, percent: 0, weak: true });
    expect(b.topics.map((t: { percent: number }) => t.percent)).toEqual([100, 60, 50, 25, 0]); // best first, like the design
    expect(b.weakestTopic).toMatchObject({ name: 'Pedagogy & CBC', percent: 0 });
    expect(b.canPractice).toBe(true);
  });

  it('shows no pass mark, offers "Save my result" to guests, and has no comparison on a first attempt', async () => {
    const { id, token } = await guestStart();
    const c = guestClient(token);
    await c.post(`/api/attempts/${id}/submit`);
    const b = (await c.get(`/api/attempts/${id}/result`)).body;
    expect(b).toMatchObject({ passMark: null, noOfficialPassMark: true, isGuest: true, comparison: null });
    expect(b.history).toEqual([expect.objectContaining({ attemptId: id, current: true })]);
    expect(b.score.percent).toBe(0);
    expect(b.counts.unanswered).toBe(20);
    expect(b.canPractice).toBe(true); // everything unanswered = every topic is a weak area
  });

  it('"Review these first" lists wrong answers from the weakest topics first, with your answer and the right one', async () => {
    const { id, token } = await guestStart();
    const c = guestClient(token);
    await play(c, id, MATHS, PLAN_A);
    await c.post(`/api/attempts/${id}/submit`);
    const b = (await c.get(`/api/attempts/${id}/result`)).body;
    expect(b.incorrectCount).toBe(6);
    expect(b.reviewFirst).toHaveLength(3);
    expect(b.reviewFirst.every((r: { topic: string }) => r.topic === 'Statistics & probability')).toBe(true); // weakest topic with wrong answers
    expect(b.reviewFirst.map((r: { number: number }) => r.number)).toEqual([14, 15, 16]);
    expect(b.reviewFirst[0]).toMatchObject({ yourAnswer: expect.any(Array), correctAnswer: expect.any(Array) });
    expect(b.reviewFirst[0].yourAnswer).not.toEqual(b.reviewFirst[0].correctAnswer);
  });

  it('compares with the previous attempt: points up, time spent, and a short history', async () => {
    const first = await guestStart();
    const c = guestClient(first.token);
    await play(c, first.id, MATHS, PLAN_A);
    advance(600);
    await c.post(`/api/attempts/${first.id}/submit`);

    advance(400);
    const second = await guestStart(MATHS, first.token); // the first is finished, so this is a fresh attempt
    expect(second.id).not.toBe(first.id);
    await play(c, second.id, MATHS, PLAN_B);
    advance(300);
    await c.post(`/api/attempts/${second.id}/submit`);

    const b = (await c.get(`/api/attempts/${second.id}/result`)).body;
    expect(b.score.percent).toBe(90.48);
    expect(b.comparison).toMatchObject({ previousAttemptId: first.id, previousPercent: 52.38, deltaPoints: 38.1, previousTimeSpentSeconds: 600 });
    expect(b.attempt.timeSpentSeconds).toBe(300);
    expect(b.history.map((h: { percent: number; current: boolean }) => [h.percent, h.current])).toEqual([[52.38, false], [90.48, true]]);
    // The first attempt still shows no comparison (nothing came before it).
    expect((await c.get(`/api/attempts/${first.id}/result`)).body.comparison).toBeNull();
  });

  it('is not available while the attempt is running, and only to its owner', async () => {
    const a = await guestStart();
    const other = await guestStart();
    expect((await guestClient(a.token).get(`/api/attempts/${a.id}/result`)).body.error).toBe('attempt_in_progress');
    await guestClient(a.token).post(`/api/attempts/${a.id}/submit`);
    expect((await guestClient(other.token).get(`/api/attempts/${a.id}/result`)).status).toBe(404);
    expect((await request(app).get(`/api/attempts/${a.id}/result`)).status).toBe(404);
  });

  it('an attempt that ran out of time is closed on first view and flagged as auto-submitted', async () => {
    const a = await guestStart();
    const c = guestClient(a.token);
    await play(c, a.id, MATHS, range(0, 4, 'right'));
    advance(1800 + 45);
    const b = (await c.get(`/api/attempts/${a.id}/result`)).body;
    expect(b.attempt).toMatchObject({ status: 'AUTO_SUBMITTED', autoSubmitted: true, timeSpentSeconds: 1800 });
    expect(b.score.marks).toBe(5);
  });

  it('shows an official pass mark only with a source', async () => {
    const t = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'headteacher-school-leadership-mock-1' } });
    const a = await guestStart('headteacher-school-leadership-mock-1');
    const c = guestClient(a.token);
    await c.post(`/api/attempts/${a.id}/submit`);
    try {
      await prisma.mockTest.update({ where: { id: t.id }, data: { passMarkPercent: 50 } });
      expect((await c.get(`/api/attempts/${a.id}/result`)).body.passMark).toBeNull();
      await prisma.mockTest.update({ where: { id: t.id }, data: { passMarkSource: 'Circular 12/2026' } });
      expect((await c.get(`/api/attempts/${a.id}/result`)).body.passMark).toEqual({ percent: 50, source: 'Circular 12/2026' });
    } finally {
      await prisma.mockTest.update({ where: { id: t.id }, data: { passMarkPercent: null, passMarkSource: null } });
    }
  });
});

describe('answer review', () => {
  let id: string; let c: Client;
  beforeAll(async () => {
    clock = new Date('2026-11-02T10:00:00Z');
    const g = await guestStart();
    id = g.id; c = guestClient(g.token);
    await play(c, id, MATHS, PLAN_A, [10, 16]);
    await c.post(`/api/attempts/${id}/submit`);
  });

  it('tab counts match the design: incorrect (incl. partly correct), flagged, unanswered, all', async () => {
    const b = (await c.get(`/api/attempts/${id}/review?filter=all`)).body;
    expect(b.counts).toEqual({ incorrect: 6, flagged: 2, unanswered: 4, all: 20 });
    expect(b.items).toHaveLength(20);
  });

  it('filters', async () => {
    const f = async (name: string) => (await c.get(`/api/attempts/${id}/review?filter=${name}`)).body.items.map((i: { number: number }) => i.number);
    expect(await f('incorrect')).toEqual([7, 11, 12, 14, 15, 16]); // 7 is the partly-correct multiple-select
    expect(await f('flagged')).toEqual([11, 17]);
    expect(await f('unanswered')).toEqual([17, 18, 19, 20]);
    expect((await f('all')).length).toBe(20);
    expect(await (async () => (await c.get(`/api/attempts/${id}/review`)).body.filter)()).toBe('incorrect'); // default
  });

  it('every item shows the options with the correct answer and your pick marked, plus the explanation', async () => {
    const items = (await c.get(`/api/attempts/${id}/review?filter=incorrect`)).body.items;
    const wrong = items.find((i: { number: number }) => i.number === 12);
    expect(wrong.status).toBe('incorrect');
    expect(wrong.options.filter((o: { isCorrect: boolean }) => o.isCorrect)).toHaveLength(1);
    const pick = wrong.options.find((o: { isYourPick: boolean }) => o.isYourPick);
    expect(pick.isCorrect).toBe(false);
    expect(wrong.explanation.length).toBeGreaterThan(20);
    expect(wrong.topic).toBe('Geometry & measurement');

    const partial = items.find((i: { number: number }) => i.number === 7);
    expect(partial).toMatchObject({ status: 'partial', multiple: true, marks: 2, marksAwarded: 1, yourAnswer: ['A'] });
    expect(partial.options.filter((o: { isCorrect: boolean }) => o.isCorrect).map((o: { key: string }) => o.key)).toEqual(['A', 'C']);
  });

  it('has a jump grid over every question whatever the filter, and unanswered items have no pick', async () => {
    const b = (await c.get(`/api/attempts/${id}/review?filter=flagged`)).body;
    expect(b.grid).toHaveLength(20);
    expect(b.grid[10]).toMatchObject({ number: 11, status: 'incorrect', flagged: true });
    expect(b.grid[19]).toMatchObject({ number: 20, status: 'unanswered', flagged: false });
    const un = (await c.get(`/api/attempts/${id}/review?filter=unanswered`)).body.items[0];
    expect(un.options.some((o: { isYourPick: boolean }) => o.isYourPick)).toBe(false);
    expect(un.options.some((o: { isCorrect: boolean }) => o.isCorrect)).toBe(true);
  });

  it('is closed while the attempt runs, rejects bad filters, and is private', async () => {
    const live = await guestStart();
    expect((await guestClient(live.token).get(`/api/attempts/${live.id}/review`)).body.error).toBe('attempt_in_progress');
    expect((await c.get(`/api/attempts/${id}/review?filter=nope`)).status).toBe(400);
    expect((await request(app).get(`/api/attempts/${id}/review`)).status).toBe(404);
  });

  it('hides explanations on free tests when the admin setting says so', async () => {
    await prisma.setting.update({ where: { key: 'free.showExplanationsOnResults' }, data: { value: false } });
    try {
      const items = (await c.get(`/api/attempts/${id}/review?filter=all`)).body.items;
      expect(items.every((i: { explanation: string | null }) => i.explanation === null)).toBe(true);
    } finally {
      await prisma.setting.update({ where: { key: 'free.showExplanationsOnResults' }, data: { value: true } });
    }
  });

  it('case-based reviews carry the case passage and tables', async () => {
    const { agent, userId } = await signedInAgent(app, mail, nextEmail());
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.create({ data: { userId, countryCode: 'RW', planId: plan.id, startsAt: clock, endsAt: new Date(clock.getTime() + 864e5 * 9), source: 'MANUAL', reason: 't' } });
    const start = await agent.post(startPath('accountant-public-institution-mock-1')).send({});
    const cl = agentClient(agent);
    await play(cl, start.body.attemptId, 'accountant-public-institution-mock-1', range(7, 11, 'right'));
    await cl.post(`/api/attempts/${start.body.attemptId}/submit`);
    const b = (await cl.get(`/api/attempts/${start.body.attemptId}/review?filter=all`)).body;
    expect(b.cases[0]).toMatchObject({ title: 'Umucyo District Hospital, financial year 2025/26', questionNumbers: [8, 9, 10, 11, 12] });
    expect(b.items.filter((i: { caseId: string | null; status: string }) => i.caseId && i.status === 'correct')).toHaveLength(5);
    const r = (await cl.get(`/api/attempts/${start.body.attemptId}/result`)).body;
    expect(r.score.marks).toBe(12.5);
    expect(r.isGuest).toBe(false);
  });
});

describe('practice weak areas', () => {
  async function finishedA() {
    const g = await guestStart();
    const c = guestClient(g.token);
    await play(c, g.id, MATHS, PLAN_A);
    await c.post(`/api/attempts/${g.id}/submit`);
    return { ...g, c };
  }

  it('builds a short set from this attempt’s weak topics, using only tests the guest can open', async () => {
    const { id, c } = await finishedA();
    const res = await c.post(`/api/attempts/${id}/practice`);
    expect(res.status).toBe(201);
    expect(res.body.topics.map((t: { name: string }) => t.name)).toEqual(['Pedagogy & CBC', 'Statistics & probability', 'Number & operations']); // lowest first, max 3
    expect(res.body.questionCount).toBe(10); // Pedagogy 4 + 1 (primary teacher, free) + Statistics 4 + Number 1; paid tests excluded
    expect(res.body).toMatchObject({ minutes: null, untimed: true }); // the designed practice runner has no countdown

    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: res.body.attemptId } });
    expect(attempt).toMatchObject({ kind: 'PRACTICE', status: 'IN_PROGRESS', durationSeconds: 12 * 3600 }); // only a safety limit
    const qs = await prisma.question.findMany({ where: { id: { in: attempt.questionIds } }, include: { mockTest: true, topic: true } });
    expect(qs.every((q) => q.mockTest.isFree)).toBe(true);
    expect(new Set(qs.map((q) => q.topic.name))).toEqual(new Set(['Pedagogy & CBC', 'Statistics & probability', 'Number & operations']));
    expect(qs.every((q) => q.caseId === null)).toBe(true);
  });

  it('the practice set plays like an exam: its own questions, a title from its topics, then results', async () => {
    const { id, c } = await finishedA();
    const pr = (await c.post(`/api/attempts/${id}/practice`)).body;
    const state = (await c.get(`/api/attempts/${pr.attemptId}`)).body;
    expect(state.attempt).toMatchObject({ kind: 'PRACTICE' });
    expect(state.attempt.mockTest.title).toMatch(/^Practice set: /);
    expect(state.questions).toHaveLength(10);
    expect(state.timer).toMatchObject({ untimed: true, low: false });

    const k = await prisma.question.findMany({ where: { id: { in: state.questions.map((q: { id: string }) => q.id) } } });
    const changes = k.map((q) => ({ questionId: q.id, selected: (q.payload as unknown as QuestionPayload).correct }));
    expect((await c.put(`/api/attempts/${pr.attemptId}/answers`, { changes })).body.counts.answered).toBe(10);
    await c.post(`/api/attempts/${pr.attemptId}/submit`);
    const r = (await c.get(`/api/attempts/${pr.attemptId}/result`)).body;
    expect(r.score.percent).toBe(100);
    expect(r.attempt.kind).toBe('PRACTICE');
    expect(r.comparison).toBeNull();
    expect(r.history).toEqual([]);
  });

  it('practice shows the right answer and explanation only after you have answered', async () => {
    const { id, c } = await finishedA();
    const pr = (await c.post(`/api/attempts/${id}/practice`)).body;
    const q = (await c.get(`/api/attempts/${pr.attemptId}`)).body.questions[0];
    expect((await c.post(`/api/attempts/${pr.attemptId}/check`, { questionId: q.id })).body.error).toBe('answer_first');

    const row = await prisma.question.findUniqueOrThrow({ where: { id: q.id } });
    const p = row.payload as unknown as QuestionPayload;
    const wrongKey = p.options.find((o) => !p.correct.includes(o.key))!.key;
    await c.put(`/api/attempts/${pr.attemptId}/answers`, { changes: [{ questionId: q.id, selected: [wrongKey] }] });
    const chk = await c.post(`/api/attempts/${pr.attemptId}/check`, { questionId: q.id });
    expect(chk.status).toBe(200);
    expect(chk.body).toMatchObject({ state: 'incorrect', correct: p.correct, yourAnswer: [wrongKey] });
    expect(chk.body.explanation.length).toBeGreaterThan(10);

    expect((await c.post(`/api/attempts/${pr.attemptId}/check`, { questionId: 'nope' })).status).toBe(404);
    // A real exam never leaks answers this way.
    expect((await c.post(`/api/attempts/${id}/check`, { questionId: q.id })).body.error).toBe('not_a_practice_attempt');
  });

  it('puts questions you got wrong or skipped before ahead of ones you answered correctly', async () => {
    const { token } = await finishedA(); // Statistics: Q13 right, Q14–16 wrong
    const stats = await prisma.topic.findFirstOrThrow({ where: { slug: 'statistics-and-probability', category: { countryCode: 'RW' } } });
    const country = await prisma.country.findUniqueOrThrow({ where: { code: 'RW' } });
    const out = await createPracticeAttempt(
      { prisma, now: () => clock },
      { country, viewer: { user: null, guestTokens: [token] }, topicIds: [stats.id], limit: 3 },
    );
    const k = await key(MATHS);
    const wrongIds = new Set([k[13]!.id, k[14]!.id, k[15]!.id]);
    expect(new Set(out.attempt.questionIds)).toEqual(wrongIds);
  });

  it('with Full Access the pool includes paid tests as well', async () => {
    const { agent, userId } = await signedInAgent(app, mail, nextEmail());
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.create({ data: { userId, countryCode: 'RW', planId: plan.id, startsAt: clock, endsAt: new Date(clock.getTime() + 864e5 * 9), source: 'MANUAL', reason: 't' } });
    const ped = await prisma.topic.findFirstOrThrow({ where: { slug: 'pedagogy-and-cbc', category: { countryCode: 'RW' } } });
    const res = await agent.post('/api/countries/RW/practice').send({ topicId: ped.id });
    expect(res.status).toBe(201);
    expect(res.body.questionCount).toBe(7); // 4 + 1 free, + 2 in the paid Teaching Profession test
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: res.body.attemptId } });
    const paid = await prisma.question.count({ where: { id: { in: attempt.questionIds }, mockTest: { isFree: false } } });
    expect(paid).toBe(2);
  });

  it('refuses when nothing is weak, when the pool is too small, and for another country’s topic', async () => {
    const g = await guestStart();
    const c = guestClient(g.token);
    await play(c, g.id, MATHS, range(0, 19, 'right'));
    await c.post(`/api/attempts/${g.id}/submit`);
    expect((await c.post(`/api/attempts/${g.id}/practice`)).body.error).toBe('no_weak_areas');
    expect((await guestClient(g.token).get(`/api/attempts/${g.id}/result`)).body.canPractice).toBe(false);

    const tiny = await prisma.topic.findFirstOrThrow({ where: { slug: 'number-and-operations', category: { countryCode: 'RW' } } });
    expect((await request(app).post('/api/countries/RW/practice').send({ topicId: tiny.id })).body.error).toBe('not_enough_questions');
    const ke = await prisma.topic.findFirstOrThrow({ where: { category: { countryCode: 'KE' } } });
    expect((await request(app).post('/api/countries/RW/practice').send({ topicId: ke.id })).body.error).toBe('topic_not_found');
  });

  it('is private to the owner and needs a finished attempt', async () => {
    const { id } = await finishedA();
    const other = await guestStart();
    expect((await guestClient(other.token).post(`/api/attempts/${id}/practice`)).status).toBe(404);
    const live = await guestStart();
    expect((await guestClient(live.token).post(`/api/attempts/${live.id}/practice`)).body.error).toBe('attempt_in_progress');
  });
});

describe('dashboard', () => {
  it('needs a session', async () => {
    expect((await request(app).get('/api/me/dashboard')).status).toBe(401);
  });

  it('a brand-new user gets an empty but valid dashboard', async () => {
    const { agent } = await signedInAgent(app, mail, nextEmail());
    const b = (await agent.get('/api/me/dashboard')).body;
    expect(b).toMatchObject({
      hasActivity: false, resume: null, recommended: null, scoreHistory: [], recentlyCompleted: [],
      topics: { strong: [], needsWork: [] }, goal: null, access: { current: null, otherCountries: [] },
    });
    expect(b.user.firstName).toBe('Test');
  });

  it('shows progress after two attempts: history, strong / needs-work topics, recent attempts, resume, recommendation, access', async () => {
    const { agent, userId } = await signedInAgent(app, mail, nextEmail());
    const c = agentClient(agent);
    const teaching = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'teaching-positions' } });
    await agent.patch('/api/me').send({ goalCategoryId: teaching.id });

    const a1 = (await agent.post(startPath(MATHS)).send({})).body.attemptId;
    await play(c, a1, MATHS, PLAN_A);
    advance(600);
    await c.post(`/api/attempts/${a1}/submit`);
    advance(86_400);
    const a2 = (await agent.post(startPath(MATHS)).send({})).body.attemptId;
    await play(c, a2, MATHS, PLAN_B);
    advance(300);
    await c.post(`/api/attempts/${a2}/submit`);

    const primary = 'primary-teacher-general-p1-p6-mock-1';
    const live = (await agent.post(startPath(primary)).send({})).body.attemptId;
    await play(c, live, primary, range(0, 1, 'right'));

    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.create({ data: { userId, countryCode: 'RW', planId: plan.id, startsAt: clock, endsAt: new Date(clock.getTime() + 864e5 * 22.5), source: 'MANUAL', reason: 't' } });

    const b = (await c.get('/api/me/dashboard')).body;
    expect(b.goal).toMatchObject({ slug: 'teaching-positions', name: 'Teaching positions' });
    expect(b.hasActivity).toBe(true);
    expect(b.scoreHistory.map((h: { percent: number }) => h.percent)).toEqual([52.38, 90.48]); // oldest → newest, for the chart
    // Marks-weighted across both attempts
    expect(b.topics.strong).toEqual([
      { topicId: expect.any(String), name: 'Algebra & functions', percent: 100 },
      { topicId: expect.any(String), name: 'Geometry & measurement', percent: 80 },
      { topicId: expect.any(String), name: 'Number & operations', percent: 75 },
    ]);
    expect(b.topics.needsWork.map((t: { name: string; percent: number }) => [t.name, t.percent])).toEqual([
      ['Statistics & probability', 38], ['Pedagogy & CBC', 50],
    ]);
    expect(b.recentlyCompleted.map((r: { attemptNumber: number; percent: number }) => [r.attemptNumber, r.percent])).toEqual([[2, 90.48], [1, 52.38]]);
    expect(b.resume).toMatchObject({ id: live, answered: 2, total: 6, mockTest: { slug: primary } });
    // Weakest topic with enough questions the user can open (Statistics has 4 free ones)
    expect(b.recommended).toMatchObject({ topicName: 'Statistics & probability', percent: 38 });
    expect(b.recommended.questionCount).toBeGreaterThanOrEqual(3);
    expect(b.access.current.daysLeft).toBe(23);

    // The recommendation can be started in one call
    const start = await agent.post('/api/countries/RW/practice').send({ topicId: b.recommended.topicId });
    expect(start.status).toBe(201);

    // Score history can be narrowed to one category
    expect((await c.get('/api/me/dashboard?category=procurement')).body.scoreHistory).toEqual([]);
    expect((await c.get('/api/me/dashboard?category=teaching-positions')).body.scoreHistory).toHaveLength(2);
  });

  it('counts practice attempts toward strengths, and never mixes in another user’s results', async () => {
    const x = await signedInAgent(app, mail, nextEmail());
    const y = await signedInAgent(app, mail, nextEmail());
    const a = (await x.agent.post(startPath(MATHS)).send({})).body.attemptId;
    await play(agentClient(x.agent), a, MATHS, range(0, 19, 'right'));
    await agentClient(x.agent).post(`/api/attempts/${a}/submit`);
    expect((await y.agent.get('/api/me/dashboard')).body.hasActivity).toBe(false);
    expect((await x.agent.get('/api/me/dashboard')).body.topics.strong.length).toBe(3);
  });
});
