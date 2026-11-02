import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { QuestionPayload } from '../../src/domain/scoring';
import { LATE_SYNC_WINDOW_SECONDS, sweepExpiredAttempts } from '../../src/services/attempts';
import { ConsoleSmsProvider } from '../../src/services/sms';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const sms = new ConsoleSmsProvider(() => {});
let clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: testConfig(), sms, now: () => clock });
const at = (secs: number) => new Date(clock.getTime() + secs * 1000);
const advance = (secs: number) => { clock = at(secs); };

const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1'; // free, 20 questions, 30 min
const ACCOUNTANT = 'accountant-public-institution-mock-1'; // paid, 12 questions incl. 5 case-based, 45 min
const startPath = (slug: string) => `/api/countries/RW/mock-tests/${slug}/attempts`;

let phoneSeq = 300000;
const nextPhone = () => `+250788${phoneSeq++}`;

beforeAll(() => resetAndSeed(prisma));
beforeEach(() => { clock = new Date('2026-11-02T10:00:00Z'); sms.clear(); });
afterAll(() => prisma.$disconnect());

async function guestStart(slug = MATHS, token?: string) {
  const r = request(app).post(startPath(slug));
  if (token) r.set('X-Guest-Token', token);
  const res = await r.send({});
  return { res, id: res.body.attemptId as string, token: res.body.guestToken as string };
}
const state = (id: string, token: string) => request(app).get(`/api/attempts/${id}`).set('X-Guest-Token', token);
const save = (id: string, token: string, changes: object[]) =>
  request(app).put(`/api/attempts/${id}/answers`).set('X-Guest-Token', token).send({ changes });
const submit = (id: string, token: string, body: object = {}) =>
  request(app).post(`/api/attempts/${id}/submit`).set('X-Guest-Token', token).send(body);

/** Questions in order with their correct keys, read straight from the database. */
async function answerKey(slug: string) {
  const qs = await prisma.question.findMany({ where: { mockTest: { slug, countryCode: 'RW' } }, orderBy: { sortOrder: 'asc' } });
  return qs.map((q) => ({ id: q.id, type: q.type, correct: (q.payload as unknown as QuestionPayload).correct, options: (q.payload as unknown as QuestionPayload).options.map((o) => o.key) }));
}
const wrongKey = (q: { correct: string[]; options: string[] }) => q.options.find((k) => !q.correct.includes(k))!;

describe('starting an attempt', () => {
  it('a guest can start a free test with no account and gets a secret guest token', async () => {
    const { res, token } = await guestStart();
    expect(res.status).toBe(201);
    expect(res.body.resumed).toBe(false);
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(res.body.timer).toMatchObject({ remainingSeconds: 1800, expired: false, low: false });
  });

  it('the exam state has every question with options, and never reveals answers or explanations', async () => {
    const { id, token } = await guestStart();
    const res = await state(id, token);
    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(20);
    expect(res.body.counts).toEqual({ total: 20, answered: 0, flagged: 0 });
    expect(res.body.attempt).toMatchObject({ status: 'IN_PROGRESS', kind: 'FULL', mockTest: { slug: MATHS, countryCode: 'RW' } });
    const q1 = res.body.questions[0];
    expect(q1).toMatchObject({ number: 1, sectionName: 'Algebra & functions', multiple: false, marks: 1 });
    expect(q1.options.map((o: { key: string }) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/explanation|"correct"|"payload"|Factorise/);
    expect(res.body.questions.find((q: { multiple: boolean }) => q.multiple)).toBeDefined();
  });

  it('starting again resumes the same attempt; a different guest gets a different one', async () => {
    const a = await guestStart();
    const again = await guestStart(MATHS, a.token);
    expect(again.res.status).toBe(200);
    expect(again.res.body.resumed).toBe(true);
    expect(again.id).toBe(a.id);
    expect((await guestStart()).id).not.toBe(a.id);
  });

  it('paid tests: guest must sign up (401), no grant → 402, active same-country grant → ok', async () => {
    expect((await guestStart(ACCOUNTANT)).res.body.error).toBe('sign_in_required');
    const { agent, userId } = await signedInAgent(app, sms, nextPhone());
    const denied = await agent.post(startPath(ACCOUNTANT)).send({});
    expect(denied.status).toBe(402);
    expect(denied.body.error).toBe('full_access_required');

    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.create({
      data: { userId, countryCode: 'RW', planId: plan.id, startsAt: at(-86400), endsAt: at(86400 * 20), source: 'MANUAL', reason: 'test' },
    });
    const ok = await agent.post(startPath(ACCOUNTANT)).send({});
    expect(ok.status).toBe(201);
    expect(ok.body.guestToken).toBeNull(); // signed-in attempts belong to the account
    expect((await agent.get(`/api/attempts/${ok.body.attemptId}`)).body.questions).toHaveLength(12);
  });

  it('an expired or suspended grant does not unlock a paid test', async () => {
    const { agent, userId } = await signedInAgent(app, sms, nextPhone());
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.createMany({
      data: [
        { userId, countryCode: 'RW', planId: plan.id, startsAt: at(-86400 * 40), endsAt: at(-86400), source: 'MANUAL' as const, reason: 'old' },
        { userId, countryCode: 'RW', planId: plan.id, startsAt: at(-86400), endsAt: at(86400 * 9), source: 'MANUAL' as const, reason: 'x', status: 'SUSPENDED' as const },
      ],
    });
    expect((await agent.post(startPath(ACCOUNTANT)).send({})).status).toBe(402);
  });

  it('hidden, draft and unknown tests cannot be started', async () => {
    expect((await request(app).post('/api/countries/KE/mock-tests/accountant-mock-1/attempts').send({})).body.error).toBe('country_not_available');
    expect((await request(app).post(startPath('nope')).send({})).body.error).toBe('mock_test_not_found');
    const t = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'ict-officer-free-sample' } });
    await prisma.mockTest.update({ where: { id: t.id }, data: { status: 'DRAFT' } });
    try {
      expect((await request(app).post(startPath('ict-officer-free-sample')).send({})).status).toBe(404);
    } finally {
      await prisma.mockTest.update({ where: { id: t.id }, data: { status: 'PUBLISHED' } });
    }
  });

  it('a signed-in user cannot start a test from another country', async () => {
    const { agent } = await signedInAgent(app, sms, nextPhone());
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const res = await agent.post('/api/countries/KE/mock-tests/secondary-mathematics-teacher-sample/attempts').send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('country_mismatch');
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });

  it('refuses a test with no published questions', async () => {
    const t = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'ict-officer-free-sample' } });
    await prisma.question.updateMany({ where: { mockTestId: t.id }, data: { status: 'DRAFT' } });
    try {
      expect((await request(app).post(startPath('ict-officer-free-sample')).send({})).body.error).toBe('no_questions');
    } finally {
      await prisma.question.updateMany({ where: { mockTestId: t.id }, data: { status: 'PUBLISHED' } });
    }
  });
});

describe('who can see an attempt', () => {
  it('only its owner: no token, someone else’s token, or another user all get 404', async () => {
    const a = await guestStart();
    const other = await guestStart();
    expect((await request(app).get(`/api/attempts/${a.id}`)).status).toBe(404);
    expect((await state(a.id, other.token)).status).toBe(404);
    expect((await save(a.id, other.token, [{ questionId: 'x', flagged: true }])).status).toBe(404);
    expect((await submit(a.id, other.token)).status).toBe(404);
    const { agent } = await signedInAgent(app, sms, nextPhone());
    expect((await agent.get(`/api/attempts/${a.id}`)).status).toBe(404);
    expect((await state(a.id, a.token)).status).toBe(200);
  });

  it('a signed-in user resumes on another device (new session, same account)', async () => {
    const phone = nextPhone();
    const { agent, userId } = await signedInAgent(app, sms, phone);
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.create({ data: { userId, countryCode: 'RW', planId: plan.id, startsAt: at(-10), endsAt: at(86400 * 9), source: 'MANUAL', reason: 't' } });
    const start = await agent.post(startPath(ACCOUNTANT)).send({});
    const q = (await answerKey(ACCOUNTANT))[0]!;
    await agent.put(`/api/attempts/${start.body.attemptId}/answers`).send({ changes: [{ questionId: q.id, selected: [q.correct[0]], flagged: true }] });

    advance(120);
    const device2 = request.agent(app);
    await device2.post('/api/auth/otp/request').send({ purpose: 'sign_in', phone });
    await device2.post('/api/auth/sign-in').send({ phone, code: sms.lastCode(phone) });
    const res = await device2.get(`/api/attempts/${start.body.attemptId}`);
    expect(res.status).toBe(200);
    expect(res.body.answers[q.id]).toEqual({ selected: q.correct, flagged: true });
    expect(res.body.timer.remainingSeconds).toBe(2700 - 120); // server clock: the 2 minutes passed
  });
});

describe('autosave', () => {
  it('saves an answer and a flag, and state reflects them', async () => {
    const { id, token } = await guestStart();
    const key = await answerKey(MATHS);
    const res = await save(id, token, [
      { questionId: key[0]!.id, selected: ['A'] },
      { questionId: key[1]!.id, flagged: true },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      { questionId: key[0]!.id, status: 'saved' },
      { questionId: key[1]!.id, status: 'saved' },
    ]);
    expect(res.body.counts).toEqual({ total: 20, answered: 1, flagged: 1 });
    const s = (await state(id, token)).body;
    expect(s.answers[key[0]!.id]).toEqual({ selected: ['A'], flagged: false });
    expect(s.answers[key[1]!.id]).toEqual({ selected: [], flagged: true });
    expect(s.counts).toEqual({ total: 20, answered: 1, flagged: 1 });
  });

  it('is idempotent: resending the same batch changes nothing', async () => {
    const { id, token } = await guestStart();
    const key = await answerKey(MATHS);
    const batch = [{ questionId: key[2]!.id, selected: ['C'], at: at(-5).toISOString() }];
    await save(id, token, batch);
    const again = await save(id, token, batch);
    expect(again.body.results[0].status).toBe('saved');
    expect(await prisma.attemptAnswer.count({ where: { attemptId: id } })).toBe(1);
    expect((await state(id, token)).body.answers[key[2]!.id].selected).toEqual(['C']);
  });

  it('the latest change wins, even when an offline queue arrives out of order', async () => {
    const { id, token } = await guestStart();
    const q = (await answerKey(MATHS))[0]!;
    advance(60);
    await save(id, token, [{ questionId: q.id, selected: ['B'], at: at(-10).toISOString() }]);
    const stale = await save(id, token, [{ questionId: q.id, selected: ['D'], at: at(-30).toISOString() }]); // older
    expect(stale.body.results[0].status).toBe('stale');
    expect((await state(id, token)).body.answers[q.id].selected).toEqual(['B']);
    const newer = await save(id, token, [{ questionId: q.id, selected: ['C'], at: at(-1).toISOString() }]);
    expect(newer.body.results[0].status).toBe('saved');
    expect((await state(id, token)).body.answers[q.id].selected).toEqual(['C']);
  });

  it('answer and flag are independent: an older flag change never discards a newer answer', async () => {
    const { id, token } = await guestStart();
    const q = (await answerKey(MATHS))[0]!;
    advance(60);
    await save(id, token, [{ questionId: q.id, selected: ['A'], at: at(-5).toISOString() }]);
    const r = await save(id, token, [{ questionId: q.id, flagged: true, at: at(-20).toISOString() }]); // older, other field
    expect(r.body.results[0].status).toBe('saved');
    expect((await state(id, token)).body.answers[q.id]).toEqual({ selected: ['A'], flagged: true });
  });

  it('can clear an answer and unflag', async () => {
    const { id, token } = await guestStart();
    const q = (await answerKey(MATHS))[0]!;
    await save(id, token, [{ questionId: q.id, selected: ['A'], flagged: true }]);
    advance(5);
    await save(id, token, [{ questionId: q.id, selected: [], flagged: false }]);
    const s = (await state(id, token)).body;
    expect(s.answers[q.id]).toEqual({ selected: [], flagged: false });
    expect(s.counts.answered).toBe(0);
  });

  it('a client timestamp in the future cannot lock out later changes', async () => {
    const { id, token } = await guestStart();
    const q = (await answerKey(MATHS))[0]!;
    await save(id, token, [{ questionId: q.id, selected: ['A'], at: at(3600).toISOString() }]); // clamped to now
    advance(10);
    const r = await save(id, token, [{ questionId: q.id, selected: ['B'], at: at(-1).toISOString() }]);
    expect(r.body.results[0].status).toBe('saved');
    expect((await state(id, token)).body.answers[q.id].selected).toEqual(['B']);
  });

  it('validates each change: unknown question, bad option key, two answers on a single-choice question', async () => {
    const { id, token } = await guestStart();
    const key = await answerKey(MATHS);
    const multi = key.find((k) => k.type === 'MULTIPLE_SELECT')!;
    const res = await save(id, token, [
      { questionId: 'not-a-question', selected: ['A'] },
      { questionId: key[0]!.id, selected: ['Z'] },
      { questionId: key[0]!.id, selected: ['A', 'B'] },
      { questionId: multi.id, selected: ['A', 'C'] }, // multiple-select allows several
    ]);
    expect(res.body.results.map((r: { status: string; error?: string }) => r.error ?? r.status)).toEqual([
      'unknown_question', 'invalid_option', 'invalid_option', 'saved',
    ]);
    expect((await state(id, token)).body.answers[multi.id].selected).toEqual(['A', 'C']);
  });

  it('rejects malformed requests', async () => {
    const { id, token } = await guestStart();
    expect((await save(id, token, [])).status).toBe(400);
    expect((await save(id, token, [{ questionId: 'x' }])).status).toBe(400); // neither selected nor flagged
    expect((await save(id, token, [{ questionId: 'x', flagged: true, at: 'yesterday' }])).status).toBe(400);
    const tooMany = Array.from({ length: 101 }, () => ({ questionId: 'x', flagged: true }));
    expect((await save(id, token, tooMany)).status).toBe(400);
  });

  it('parallel saves of the same question end on the latest change', async () => {
    const { id, token } = await guestStart();
    const q = (await answerKey(MATHS))[0]!;
    advance(30);
    const keys = ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D'];
    await Promise.all(keys.map((k, i) => save(id, token, [{ questionId: q.id, selected: [k], at: at(-30 + i).toISOString() }])));
    expect((await state(id, token)).body.answers[q.id].selected).toEqual(['D']); // i = 7 is the newest
    expect(await prisma.attemptAnswer.count({ where: { attemptId: id } })).toBe(1);
  });
});

describe('the server-authoritative timer', () => {
  it('remaining time comes from the server clock; a refresh shows the true value', async () => {
    const { id, token } = await guestStart();
    expect((await state(id, token)).body.timer.remainingSeconds).toBe(1800);
    advance(754);
    expect((await state(id, token)).body.timer.remainingSeconds).toBe(1046);
    const t = await request(app).get(`/api/attempts/${id}/timer`).set('X-Guest-Token', token);
    expect(t.body).toMatchObject({ status: 'IN_PROGRESS', remainingSeconds: 1046, expired: false });
    expect(new Date(t.body.serverNow).getTime()).toBe(clock.getTime());
  });

  it('turns "low" under five minutes', async () => {
    const { id, token } = await guestStart();
    advance(1800 - 299);
    expect((await state(id, token)).body.timer).toMatchObject({ remainingSeconds: 299, low: true });
  });

  it('time-up auto-submits with the answers that were saved, and keeps them', async () => {
    const { id, token } = await guestStart();
    const key = await answerKey(MATHS);
    await save(id, token, key.slice(0, 5).map((k) => ({ questionId: k.id, selected: k.correct })));
    await save(id, token, key.slice(5, 8).map((k) => ({ questionId: k.id, selected: [wrongKey(k)] })));
    advance(1800 + 1);

    const s = (await state(id, token)).body;
    expect(s.attempt.status).toBe('AUTO_SUBMITTED');
    expect(s.finished).toBe(true);
    expect(s.timer).toMatchObject({ remainingSeconds: 0, expired: true });
    expect(s.counts.answered).toBe(8);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(row.submittedAt).toEqual(row.deadlineAt); // stamped at time-up, not whenever someone looked
    expect(Number(row.scoreMarks)).toBe(5 + 0); // 5 right answers; wrong ones score 0 (no negative marking)
  });

  it('the sweeper auto-submits expired attempts nobody came back to', async () => {
    const a = await guestStart();
    const b = await guestStart();
    advance(1800 + 60);
    expect(await sweepExpiredAttempts({ prisma, now: () => clock })).toBeGreaterThanOrEqual(2);
    for (const x of [a, b]) expect((await prisma.attempt.findUniqueOrThrow({ where: { id: x.id } })).status).toBe('AUTO_SUBMITTED');
    expect(await sweepExpiredAttempts({ prisma, now: () => clock })).toBe(0); // idempotent
  });

  it('a save arriving a moment after time-up (inside the grace window) is still kept', async () => {
    const { id, token } = await guestStart();
    const q = (await answerKey(MATHS))[0]!;
    advance(1800 + 3);
    const r = await save(id, token, [{ questionId: q.id, selected: ['A'], at: at(-4).toISOString() }]);
    expect(r.status).toBe(200);
    expect(r.body.results[0].status).toBe('saved');
  });
});

describe('offline answers synced after time-up', () => {
  it('answers made before the deadline are kept and re-scored; ones made after are rejected', async () => {
    const { id, token } = await guestStart();
    const key = await answerKey(MATHS);
    // Candidate answers 3 questions while offline in the last minute…
    const madeAt = at(1800 - 40); // 40 s before the deadline
    advance(1800 + 120); // …and the connection only comes back 2 minutes after time-up.
    expect((await state(id, token)).body.attempt.status).toBe('AUTO_SUBMITTED');
    expect(Number((await prisma.attempt.findUniqueOrThrow({ where: { id } })).scoreMarks)).toBe(0);

    const res = await save(id, token, [
      ...key.slice(0, 3).map((k) => ({ questionId: k.id, selected: k.correct, at: madeAt.toISOString() })),
      { questionId: key[3]!.id, selected: key[3]!.correct, at: at(-10).toISOString() }, // made after time-up
    ]);
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { status: string; error?: string }) => r.error ?? r.status)).toEqual(['saved', 'saved', 'saved', 'after_deadline']);
    expect(res.body.status).toBe('AUTO_SUBMITTED');
    expect(res.body.counts.answered).toBe(3);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(Number(row.scoreMarks)).toBe(3); // re-scored
    expect(row.submittedAt).toEqual(row.deadlineAt); // original auto-submit time preserved
  });

  it('is only possible for a bounded window after an automatic submit', async () => {
    const { id, token } = await guestStart();
    const q = (await answerKey(MATHS))[0]!;
    const madeAt = at(1700);
    advance(1800 + LATE_SYNC_WINDOW_SECONDS + 5);
    const res = await save(id, token, [{ questionId: q.id, selected: ['A'], at: madeAt.toISOString() }]);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('attempt_closed');
  });

  it('a manual submit closes the attempt for good', async () => {
    const { id, token } = await guestStart();
    const q = (await answerKey(MATHS))[0]!;
    expect((await submit(id, token)).status).toBe(200);
    const res = await save(id, token, [{ questionId: q.id, selected: ['A'] }]);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('attempt_closed');
  });
});

describe('submitting', () => {
  it('scores per answer key: all correct = 100%, stored with a per-topic breakdown', async () => {
    const { id, token } = await guestStart();
    const key = await answerKey(MATHS);
    await save(id, token, key.map((k) => ({ questionId: k.id, selected: k.correct })));
    advance(600);
    const res = await submit(id, token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'SUBMITTED', autoSubmitted: false, unanswered: 0 });
    expect(res.body.counts).toEqual({ total: 20, answered: 20, flagged: 0 });

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'SUBMITTED' });
    expect([Number(row.scoreMarks), Number(row.totalMarks), Number(row.percent)]).toEqual([21, 21, 100]);
    expect(row.submittedAt).toEqual(clock);
    const topics = row.topicBreakdown as { topicName: string; percent: number }[];
    expect(topics.map((t) => t.topicName).sort()).toEqual(
      ['Algebra & functions', 'Geometry & measurement', 'Number & operations', 'Pedagogy & CBC', 'Statistics & probability'],
    );
    expect(topics.every((t) => t.percent === 100)).toBe(true);
    const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: id } });
    expect(answers.every((a) => a.isCorrect === true)).toBe(true);
  });

  it('counts unanswered, wrong and partial-credit multiple-select correctly', async () => {
    const { id, token } = await guestStart();
    const key = await answerKey(MATHS);
    const multi = key.find((k) => k.type === 'MULTIPLE_SELECT')!; // marks 2, correct A+C, PARTIAL
    const single = key.filter((k) => k.type !== 'MULTIPLE_SELECT');
    await save(id, token, [
      { questionId: multi.id, selected: ['A'] }, // 1 of 2 marks
      { questionId: single[0]!.id, selected: single[0]!.correct }, // 1
      { questionId: single[1]!.id, selected: [wrongKey(single[1]!)] }, // 0
    ]);
    await submit(id, token);
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(Number(row.scoreMarks)).toBe(2);
    expect(Number(row.percent)).toBeCloseTo(9.52, 2);
    const m = await prisma.attemptAnswer.findFirstOrThrow({ where: { attemptId: id, questionId: multi.id } });
    expect(Number(m.marksAwarded)).toBe(1);
    expect(m.isCorrect).toBe(false); // partial is not "fully correct"
  });

  it('applies negative marking only when the exam configures it, and never goes below zero', async () => {
    const t = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'procurement-officer-free-sample' } });
    await prisma.mockTest.update({ where: { id: t.id }, data: { negativeMarkPerWrong: 0.5 } });
    try {
      const { id, token } = await guestStart('procurement-officer-free-sample');
      const key = await answerKey('procurement-officer-free-sample');
      await save(id, token, [
        { questionId: key[0]!.id, selected: key[0]!.correct }, // +1
        { questionId: key[1]!.id, selected: [wrongKey(key[1]!)] }, // -0.5
        { questionId: key[2]!.id, selected: [wrongKey(key[2]!)] }, // -0.5
        { questionId: key[3]!.id, selected: [wrongKey(key[3]!)] }, // -0.5
      ]);
      await submit(id, token);
      expect(Number((await prisma.attempt.findUniqueOrThrow({ where: { id } })).scoreMarks)).toBe(0);
    } finally {
      await prisma.mockTest.update({ where: { id: t.id }, data: { negativeMarkPerWrong: 0 } });
    }
  });

  it('is idempotent and can flush the last queued changes in the same request', async () => {
    const { id, token } = await guestStart();
    const key = await answerKey(MATHS);
    const first = await submit(id, token, { changes: [{ questionId: key[0]!.id, selected: key[0]!.correct }] });
    expect(first.body.counts.answered).toBe(1);
    advance(50);
    const second = await submit(id, token);
    expect(second.body.status).toBe('SUBMITTED');
    expect(second.body.submittedAt).toBe(first.body.submittedAt); // the first outcome stands
    expect(Number((await prisma.attempt.findUniqueOrThrow({ where: { id } })).scoreMarks)).toBe(1);
  });

  it('a submit after the deadline is recorded as an automatic submit at the deadline', async () => {
    const { id, token } = await guestStart();
    advance(1800 + 90);
    const res = await submit(id, token);
    expect(res.body).toMatchObject({ status: 'AUTO_SUBMITTED', autoSubmitted: true });
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(row.submittedAt).toEqual(row.deadlineAt);
  });

  it('simultaneous submits finalise exactly once', async () => {
    const { id, token } = await guestStart();
    const key = await answerKey(MATHS);
    await save(id, token, [{ questionId: key[0]!.id, selected: key[0]!.correct }]);
    const results = await Promise.all(Array.from({ length: 6 }, () => submit(id, token)));
    expect(results.every((r) => r.status === 200 && r.body.status === 'SUBMITTED')).toBe(true);
    expect(new Set(results.map((r) => r.body.submittedAt)).size).toBe(1);
  });
});

describe('case-based exams', () => {
  it('the state carries the case passage and tables, with the question numbers that belong to it', async () => {
    const { agent, userId } = await signedInAgent(app, sms, nextPhone());
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.create({ data: { userId, countryCode: 'RW', planId: plan.id, startsAt: at(-10), endsAt: at(86400 * 9), source: 'MANUAL', reason: 't' } });
    const start = await agent.post(startPath(ACCOUNTANT)).send({});
    const s = (await agent.get(`/api/attempts/${start.body.attemptId}`)).body;

    expect(s.cases).toHaveLength(1);
    expect(s.cases[0]).toMatchObject({ title: 'Umucyo District Hospital, financial year 2025/26', questionNumbers: [8, 9, 10, 11, 12] });
    expect(s.cases[0].tables[0].caption).toBe('Cash summary (RWF)');
    expect(s.cases[0].tables[0].rows.length).toBe(9);
    expect(s.cases[0].notes).toHaveLength(3);
    const caseQs = s.questions.filter((q: { caseId: string | null }) => q.caseId);
    expect(caseQs).toHaveLength(5);
    expect(caseQs.every((q: { type: string; marks: number }) => q.type === 'CASE_BASED' && q.marks === 2.5)).toBe(true);

    const key = await answerKey(ACCOUNTANT);
    await agent.put(`/api/attempts/${start.body.attemptId}/answers`).send({ changes: key.map((k) => ({ questionId: k.id, selected: k.correct })) });
    await agent.post(`/api/attempts/${start.body.attemptId}/submit`).send({});
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: start.body.attemptId } });
    expect([Number(row.scoreMarks), Number(row.percent)]).toEqual([19.5, 100]);
  });
});

describe('resume prompt', () => {
  it('lists unfinished attempts for a guest token and for a user, with progress and time left', async () => {
    const a = await guestStart();
    const key = await answerKey(MATHS);
    await save(a.id, a.token, key.slice(0, 4).map((k) => ({ questionId: k.id, selected: k.correct })));
    advance(600);
    const res = await request(app).get('/api/attempts/in-progress').set('X-Guest-Token', a.token);
    expect(res.body.attempts).toEqual([
      expect.objectContaining({ id: a.id, total: 20, answered: 4, remainingSeconds: 1200, mockTest: expect.objectContaining({ slug: MATHS }) }),
    ]);
    expect((await request(app).get('/api/attempts/in-progress')).body.attempts).toEqual([]); // anonymous: nothing
  });

  it('does not list finished or expired attempts', async () => {
    const done = await guestStart();
    await submit(done.id, done.token);
    const expired = await guestStart(MATHS, undefined);
    advance(1800 + 5);
    const both = await request(app).get('/api/attempts/in-progress').set('X-Guest-Token', `${done.token},${expired.token}`);
    expect(both.body.attempts).toEqual([]);
  });

  it('starting after the previous attempt expired closes it and begins a fresh one', async () => {
    const a = await guestStart();
    advance(1800 + 30);
    const b = await guestStart(MATHS, a.token);
    expect(b.res.body.resumed).toBe(false);
    expect(b.id).not.toBe(a.id);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('AUTO_SUBMITTED');
  });
});

describe('guest → account', () => {
  it('a guest’s finished attempt is claimed on sign-up and is then reachable from the account', async () => {
    const a = await guestStart();
    const key = await answerKey(MATHS);
    await save(a.id, a.token, [{ questionId: key[0]!.id, selected: key[0]!.correct }]);
    await submit(a.id, a.token);

    const phone = nextPhone();
    const agent = request.agent(app);
    await agent.post('/api/auth/otp/request').send({ purpose: 'sign_up', phone, countryCode: 'RW' });
    const signUp = await agent.post('/api/auth/sign-up').send({ countryCode: 'RW', phone, name: 'Saved Result', code: sms.lastCode(phone), guestTokens: [a.token] });
    expect(signUp.body.claimedAttempts).toBe(1);
    expect((await agent.get(`/api/attempts/${a.id}`)).status).toBe(200); // by session now, no header
  });
});
