import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { QuestionPayload } from '../../src/domain/scoring';
import { ConsoleEmailProvider } from '../../src/services/email';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

/**
 * Backend support for the Batch 1 designs: code tries, "Choose N", untimed practice, the new-user dashboard,
 * access states, checkout summary, details with an unfinished attempt, and the error reference.
 */
const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
let clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: testConfig(), email: mail, now: () => clock });
const DAY = 86_400_000;
const advance = (secs: number) => { clock = new Date(clock.getTime() + secs * 1000); };
let seq = 800000;
const nextEmail = () => `user${seq++}@example.com`;
const nextMsisdn = () => `+250788${seq++}`;
const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1';

beforeAll(() => resetAndSeed(prisma));
beforeEach(() => { clock = new Date('2026-11-02T10:00:00Z'); mail.clear(); });
afterAll(() => prisma.$disconnect());

async function grant(userId: string, startOffsetDays: number, endOffsetDays: number, status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
  const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW', code: 'FULL_ACCESS' } });
  return prisma.accessGrant.create({
    data: {
      userId, countryCode: 'RW', planId: plan.id, source: 'MANUAL', reason: 'test', status,
      startsAt: new Date(clock.getTime() + startOffsetDays * DAY), endsAt: new Date(clock.getTime() + endOffsetDays * DAY),
    },
  });
}

describe('verification codes: tries left and expiry', () => {
  const signUp = (a: request.Agent, email: string) => a.post('/api/auth/sign-up').send({ countryCode: 'RW', email, name: 'Tries Test', password: 'a long enough password' });
  const verify = (a: request.Agent, email: string, code: string) => a.post('/api/auth/verify-email').send({ email, code });

  it('counts down the tries on each wrong code, then the code is dead', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await signUp(a, email);
    const good = mail.lastCode(email)!;
    const wrong = good === '000000' ? '111111' : '000000';
    const left: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await verify(a, email, wrong);
      expect(r.body.error).toBe('invalid_code');
      left.push(r.body.triesLeft);
    }
    expect(left).toEqual([4, 3, 2, 1, 0]);
    const dead = await verify(a, email, good);
    expect(dead.body).toMatchObject({ error: 'too_many_attempts', triesLeft: 0 });
  });

  it('a new code after the old one is dead works, and the answer carries the real lifetime and resend wait', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    const first = await signUp(a, email);
    expect(first.body).toEqual({ status: 'verification_required', email, cooldownSeconds: 45, expiresInSeconds: 600 });
    for (let i = 0; i < 5; i++) await verify(a, email, '999999');
    advance(46);
    const again = await a.post('/api/auth/verify-email/resend').send({ email });
    expect(again.body).toEqual({ ok: true, cooldownSeconds: 45, expiresInSeconds: 600 }); // the screen shows these, not hard-coded numbers
    const ok = await verify(a, email, mail.lastCode(email)!);
    expect(ok.status).toBe(200);
  });

  it('"expired" looks the same for an unverified account and an address with none (still no account discovery)', async () => {
    const known = nextEmail();
    const unknown = nextEmail();
    const a = request.agent(app);
    await signUp(a, known);
    await a.post('/api/auth/verify-email/resend').send({ email: unknown });
    advance(601);
    const k = await verify(a, known, '123456');
    const u = await verify(a, unknown, '123456');
    expect(k.body.error).toBe('code_expired');
    expect(u.body.error).toBe('code_expired');
    // and an address that never asked for a code just gets "invalid"
    expect((await verify(a, nextEmail(), '123456')).body.error).toBe('invalid_code');
  });
});

describe('"Choose N" for multiple-select', () => {
  async function multi() {
    const q = await prisma.question.findFirstOrThrow({ where: { type: 'MULTIPLE_SELECT', mockTest: { slug: MATHS } } });
    return q;
  }
  const start = async () => {
    const res = await request(app).post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
    return { id: res.body.attemptId as string, token: res.body.guestToken as string };
  };
  const save = (id: string, token: string, changes: object[]) =>
    request(app).put(`/api/attempts/${id}/answers`).set('X-Guest-Token', token).send({ changes });

  it('the exam state says how many to choose (default: the number of correct options), and null for single-answer questions', async () => {
    const { id, token } = await start();
    const state = (await request(app).get(`/api/attempts/${id}`).set('X-Guest-Token', token)).body;
    const m = state.questions.find((q: { multiple: boolean }) => q.multiple);
    expect(m.choose).toBe(2);
    expect(state.questions.filter((q: { multiple: boolean }) => !q.multiple).every((q: { choose: unknown }) => q.choose === null)).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(/"correct"|explanation/);
  });

  it('accepts up to N picks and rejects more, so the cap is enforced on the server too', async () => {
    const { id, token } = await start();
    const q = await multi();
    const ok = await save(id, token, [{ questionId: q.id, selected: ['A', 'C'] }]);
    expect(ok.body.results[0].status).toBe('saved');
    const tooMany = await save(id, token, [{ questionId: q.id, selected: ['A', 'B', 'C'] }]);
    expect(tooMany.body.results[0]).toMatchObject({ status: 'rejected', error: 'too_many_choices' });
    const state = (await request(app).get(`/api/attempts/${id}`).set('X-Guest-Token', token)).body;
    expect(state.answers[q.id].selected).toEqual(['A', 'C']); // unchanged by the rejected save
  });

  it('an explicit choose larger than the number of correct answers is honoured (e.g. choose up to 3 of which 2 are right)', async () => {
    const q = await multi();
    const original = q.payload as unknown as QuestionPayload;
    await prisma.question.update({ where: { id: q.id }, data: { payload: { ...original, choose: 3 } } });
    try {
      const { id, token } = await start();
      const state = (await request(app).get(`/api/attempts/${id}`).set('X-Guest-Token', token)).body;
      expect(state.questions.find((x: { id: string }) => x.id === q.id).choose).toBe(3);
      expect((await save(id, token, [{ questionId: q.id, selected: ['A', 'B', 'C'] }])).body.results[0].status).toBe('saved');
      expect((await save(id, token, [{ questionId: q.id, selected: ['A', 'B', 'C', 'D'] }])).body.results[0].error).toBe('too_many_choices');
    } finally {
      await prisma.question.update({ where: { id: q.id }, data: { payload: original as object } });
    }
  });

  it('single-answer questions still take exactly one pick', async () => {
    const { id, token } = await start();
    const single = await prisma.question.findFirstOrThrow({ where: { type: 'SINGLE_CHOICE', mockTest: { slug: MATHS } } });
    expect((await save(id, token, [{ questionId: single.id, selected: ['A', 'B'] }])).body.results[0].error).toBe('invalid_option');
  });
});

describe('untimed practice', () => {
  it('a practice set shows no countdown; a real exam still does', async () => {
    const g = await request(app).post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
    const h = { 'X-Guest-Token': g.body.guestToken as string };
    expect(g.body.timer.untimed).toBe(false);
    await request(app).post(`/api/attempts/${g.body.attemptId}/submit`).set(h).send({});
    const p = await request(app).post(`/api/attempts/${g.body.attemptId}/practice`).set(h);
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ minutes: null, untimed: true });
    const state = (await request(app).get(`/api/attempts/${p.body.attemptId}`).set(h)).body;
    expect(state.timer).toMatchObject({ untimed: true, low: false, expired: false });
    const timer = (await request(app).get(`/api/attempts/${p.body.attemptId}/timer`).set(h)).body;
    expect(timer.untimed).toBe(true);
    // 20 minutes later it is still open: no auto-submit for practice
    advance(20 * 60);
    expect((await request(app).get(`/api/attempts/${p.body.attemptId}`).set(h)).body.attempt.status).toBe('IN_PROGRESS');
    const full = (await request(app).post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).set(h).send({})).body;
    expect(full.timer.untimed).toBe(false);
  });
});

describe('dashboard for a new user', () => {
  it('suggests a free test to start with and more tests for the goal; nothing to resume or recommend', async () => {
    const { agent } = await signedInAgent(app, mail, nextEmail());
    const teaching = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'teaching-positions' } });
    await agent.patch('/api/me').send({ goalCategoryId: teaching.id });
    const b = (await agent.get('/api/me/dashboard')).body;
    expect(b).toMatchObject({ hasActivity: false, resume: null, recommended: null, scoreHistory: [], pendingPayment: null });
    expect(b.startHere).toMatchObject({ isFree: true, slug: 'primary-teacher-general-p1-p6-mock-1', questionCount: 6, durationMinutes: 20 });
    expect(b.suggestedTests).toHaveLength(3);
    expect(b.suggestedTests.map((t: { slug: string }) => t.slug)).not.toContain(b.startHere.slug);
    expect(b.suggestedTests[0].isFree).toBe(true); // free tests first
    // all suggestions belong to the goal category
    for (const t of b.suggestedTests) {
      const row = await prisma.mockTest.findFirstOrThrow({ where: { slug: t.slug, countryCode: 'RW' } });
      expect(row.categoryId).toBe(teaching.id);
    }
  });

  it('without a goal it falls back to the featured category; once they have taken a test, "start here" goes away', async () => {
    const { agent } = await signedInAgent(app, mail, nextEmail());
    const b = (await agent.get('/api/me/dashboard')).body;
    expect(b.goal).toBeNull();
    expect(b.startHere).not.toBeNull();
    const start = await agent.post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
    await agent.post(`/api/attempts/${start.body.attemptId}/submit`).send({});
    const after = (await agent.get('/api/me/dashboard')).body;
    expect(after.hasActivity).toBe(true);
    expect(after.startHere).toBeNull();
  });
});

describe('My access states', () => {
  it('no access: current and expired are both null', async () => {
    const { agent } = await signedInAgent(app, mail, nextEmail());
    expect((await agent.get('/api/me/dashboard')).body.access).toEqual({ current: null, expired: null, otherCountries: [] });
  });

  it('active, and "ending soon" at 3 days or fewer', async () => {
    const a = await signedInAgent(app, mail, nextEmail());
    await grant(a.userId, -20, 10);
    expect((await a.agent.get('/api/me/dashboard')).body.access.current).toMatchObject({ daysLeft: 10, endingSoon: false });

    const b = await signedInAgent(app, mail, nextEmail());
    await grant(b.userId, -28, 2);
    expect((await b.agent.get('/api/me/dashboard')).body.access.current).toMatchObject({ daysLeft: 2, endingSoon: true });
    const edge = await signedInAgent(app, mail, nextEmail());
    await grant(edge.userId, -27, 3);
    expect((await edge.agent.get('/api/me')).body.access.current).toMatchObject({ daysLeft: 3, endingSoon: true });
  });

  it('expired: no current access, and when it ended', async () => {
    const { agent, userId } = await signedInAgent(app, mail, nextEmail());
    const g = await grant(userId, -40, -5);
    const access = (await agent.get('/api/me/dashboard')).body.access;
    expect(access.current).toBeNull();
    expect(new Date(access.expired.endedAt).getTime()).toBe(g.endsAt.getTime());
  });

  it('a suspended grant does not count as expired access either', async () => {
    const { agent, userId } = await signedInAgent(app, mail, nextEmail());
    await grant(userId, -40, -5, 'SUSPENDED');
    expect((await agent.get('/api/me')).body.access).toEqual({ current: null, expired: null, otherCountries: [] });
  });

  it('renewed while active: one continuous "until" date that includes the days still left', async () => {
    const { agent, userId } = await signedInAgent(app, mail, nextEmail());
    await grant(userId, -20, 10);
    await grant(userId, 10, 40); // the renewal starts where the first ends
    expect((await agent.get('/api/me')).body.access.current).toMatchObject({ daysLeft: 40, endingSoon: false });
  });

  it('shows a payment that is waiting for approval, and clears it once approved', async () => {
    const msisdn = nextMsisdn();
    const { agent } = await signedInAgent(app, mail, nextEmail());
    const created = await agent.post('/api/payments').send({ provider: 'MTN_MOMO', msisdn });
    const pending = (await agent.get('/api/me/dashboard')).body.pendingPayment;
    expect(pending).toMatchObject({ id: created.body.id, providerLabel: 'MTN MoMo', priceLabel: 'RWF 2,000' });
    await request(app).post(`/api/test/payments/${created.body.id}/simulate`).send({ outcome: 'success' });
    const done = (await agent.get('/api/me/dashboard')).body;
    expect(done.pendingPayment).toBeNull();
    expect(done.access.current.daysLeft).toBe(30);
  });

  it('a payment that ran out of time is no longer "pending"', async () => {
    const msisdn = nextMsisdn();
    const { agent } = await signedInAgent(app, mail, nextEmail());
    await agent.post('/api/payments').send({ provider: 'MTN_MOMO', msisdn });
    advance(200);
    expect((await agent.get('/api/me/dashboard')).body.pendingPayment).toBeNull();
  });
});

describe('checkout summary for someone who already has access', () => {
  it('without access the new days start now', async () => {
    const { agent } = await signedInAgent(app, mail, nextEmail());
    const b = (await agent.get('/api/me/checkout')).body;
    expect(b.currentAccess).toBeNull();
    expect(new Date(b.newAccessEndsAt).getTime()).toBe(clock.getTime() + 30 * DAY);
  });

  it('with access the new days start when the current ones end', async () => {
    const { agent, userId } = await signedInAgent(app, mail, nextEmail());
    await grant(userId, -20, 10);
    const b = (await agent.get('/api/me/checkout')).body;
    expect(b.currentAccess).toMatchObject({ daysLeft: 10 });
    expect(new Date(b.newAccessEndsAt).getTime()).toBe(clock.getTime() + 40 * DAY);
  });
});

describe('exam details with an unfinished attempt', () => {
  it('gives a signed-in user what they need to show "Resume"', async () => {
    const { agent } = await signedInAgent(app, mail, nextEmail());
    const none = (await agent.get(`/api/countries/RW/mock-tests/${MATHS}`)).body;
    expect(none.inProgress).toBeNull();
    const start = await agent.post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
    const qs = await prisma.question.findMany({ where: { mockTest: { slug: MATHS } }, orderBy: { sortOrder: 'asc' }, take: 3 });
    await agent.put(`/api/attempts/${start.body.attemptId}/answers`).send({ changes: qs.map((q) => ({ questionId: q.id, selected: ['A'] })) });
    advance(120);
    const b = (await agent.get(`/api/countries/RW/mock-tests/${MATHS}`)).body;
    expect(b.inProgress).toEqual({ attemptId: start.body.attemptId, answered: 3, total: 20, remainingSeconds: 1800 - 120 });
    await agent.post(`/api/attempts/${start.body.attemptId}/submit`).send({});
    const after = (await agent.get(`/api/countries/RW/mock-tests/${MATHS}`)).body;
    expect(after.inProgress).toBeNull();
    expect(after.previousAttempts).toHaveLength(1); // the "taken before" state: new attempt + review last attempt
    expect(after.previousAttempts[0].id).toBe(start.body.attemptId);
  });

  it('is not shown for a guest', async () => {
    expect((await request(app).get(`/api/countries/RW/mock-tests/${MATHS}`)).body.inProgress).toBeNull();
  });
});

describe('error reference for the "something went wrong" page', () => {
  it('every response carries a short request id', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9A-F]{8}$/);
    const other = await request(app).get('/api/health');
    expect(other.headers['x-request-id']).not.toBe(res.headers['x-request-id']);
  });

  it('error bodies repeat the id, so the page can show it as "Reference" and support can find the log line', async () => {
    const notFound = await request(app).get('/api/nope');
    expect(notFound.body.requestId).toBe(notFound.headers['x-request-id']);
    const invalid = await request(app).get('/api/countries/RW/mock-tests?price=cheap');
    expect(invalid.body).toMatchObject({ error: 'validation_error', requestId: invalid.headers['x-request-id'] });
    const denied = await request(app).get('/api/me');
    expect(denied.body.requestId).toBe(denied.headers['x-request-id']);
  });

  it('an unexpected failure is a generic 500 with the id, and the details stay in the server log only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = createApp({
      prisma: { country: { findMany: async () => { throw new Error('secret database detail'); } } } as unknown as typeof prisma,
      config: testConfig(), email: mail, now: () => clock,
    });
    const res = await request(broken).get('/api/countries');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error', requestId: res.headers['x-request-id'] });
    expect(JSON.stringify(res.body)).not.toContain('secret database detail');
    expect(spy.mock.calls.some((c) => String(c[0]).includes(res.body.requestId))).toBe(true);
    spy.mockRestore();
  });
});
