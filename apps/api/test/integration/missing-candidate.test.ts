import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleEmailProvider } from '../../src/services/email';
import { ADMINS, adminAgent, resetAndSeed, signedInAgent, TEST_PASSWORD, testConfig, testPrisma } from '../helpers';

/**
 * The candidate-side additions of the "missing designs" pass: catalog pagination and filters, attempt stats, the wrong-country
 * answer, de-duplicated requests, waiting list, support contact, legal pages, maintenance status, profile and account
 * changes, payment history and receipts, "save my result" outcomes, reopening a finished attempt, translations,
 * result edge states and level/subject-aware recommendations.
 */
const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: testConfig(), email: mail, now: () => clock });

const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1';
const MATHS_S46 = 'secondary-mathematics-teacher-s4-s6-mock-1';
const PRIMARY = 'primary-teacher-general-p1-p6-mock-1';
const ACCOUNTANT_FREE = 'accountant-free-sample';
const ACCOUNTANT_PAID = 'accountant-public-institution-mock-1';
type Agent = ReturnType<typeof request.agent>;
let system: Agent;

beforeAll(async () => {
  await resetAndSeed(prisma);
  system = await adminAgent(app, mail, ADMINS.SYSTEM);
});
afterAll(() => prisma.$disconnect());

let n = 0;
const newUser = (countryCode = 'RW') => signedInAgent(app, mail, `missing.cand${++n}@example.com`, countryCode);
const finishFree = async (agent: Agent, slug = MATHS) => {
  const s = await agent.post(`/api/countries/RW/mock-tests/${slug}/attempts`).send({});
  const id = s.body.attemptId as string;
  expect((await agent.post(`/api/attempts/${id}/submit`).send({})).status).toBe(200);
  return id;
};

describe('catalog: pagination, multi-value filters, sort', () => {
  it('pages with hasMore / nextPage / totalPages', async () => {
    const p1 = (await request(app).get('/api/countries/RW/mock-tests?pageSize=5&page=1')).body;
    expect(p1).toMatchObject({ total: 12, page: 1, totalPages: 3, hasMore: true, nextPage: 2 });
    expect(p1.results).toHaveLength(5);
    const p3 = (await request(app).get('/api/countries/RW/mock-tests?pageSize=5&page=3')).body;
    expect(p3).toMatchObject({ page: 3, hasMore: false, nextPage: null });
    expect(p3.results).toHaveLength(2);
    const empty = (await request(app).get('/api/countries/RW/mock-tests?q=zzzzqqq')).body;
    expect(empty).toMatchObject({ total: 0, hasMore: false, nextPage: null, totalPages: 1 });
  });

  it('difficulty, language and subject accept a comma list (OR within one filter), single values still work', async () => {
    const tests = await prisma.mockTest.findMany({ where: { countryCode: 'RW', status: 'PUBLISHED' } });
    const levels = [...new Set(tests.map((t) => t.difficulty))];
    expect(levels.length).toBeGreaterThanOrEqual(2);
    const two = levels.slice(0, 2);
    const expected = tests.filter((t) => two.includes(t.difficulty)).length;
    const res = (await request(app).get(`/api/countries/RW/mock-tests?difficulty=${two.join(',')}&pageSize=50`)).body;
    expect(res.total).toBe(expected);
    expect((await request(app).get(`/api/countries/RW/mock-tests?difficulty=${two[0]}&pageSize=50`)).body.total).toBe(tests.filter((t) => t.difficulty === two[0]).length);
    expect((await request(app).get('/api/countries/RW/mock-tests?difficulty=NOPE')).status).toBe(400);
    expect((await request(app).get('/api/countries/RW/mock-tests?language=en,rw&pageSize=50')).body.total).toBe(12);
    expect((await request(app).get('/api/countries/RW/mock-tests?language=sw')).body.total).toBe(0);
    const topics = (await request(app).get('/api/countries/RW/mock-tests')).body.facets.subjects.slice(0, 2).map((s: { slug: string }) => s.slug);
    const bySubject = (await request(app).get(`/api/countries/RW/mock-tests?subject=${topics.join(',')}&pageSize=50`)).body;
    expect(bySubject.total).toBeGreaterThan(0);
  });

  it('sort=free_first lists every free test before any paid one', async () => {
    const res = (await request(app).get('/api/countries/RW/mock-tests?sort=free_first&pageSize=50')).body.results as { isFree: boolean }[];
    const firstPaid = res.findIndex((r) => !r.isFree);
    expect(firstPaid).toBeGreaterThan(0);
    expect(res.slice(firstPaid).every((r) => !r.isFree)).toBe(true);
    expect((await request(app).get('/api/countries/RW/mock-tests?sort=bogus')).status).toBe(400);
  });
});

describe('exam details: practice sets are not attempts of the test', () => {
  it('attemptStats and previousAttempts count FULL attempts only; guests get zeros', async () => {
    const u = await newUser();
    const first = await finishFree(u.agent);
    const second = await finishFree(u.agent);
    // A practice set is anchored to a test too; it must not count as an attempt, a "last attempt" or a best score.
    const topic = await prisma.topic.findFirstOrThrow({ where: { name: 'Algebra & functions', category: { countryCode: 'RW' } } }); // 7 free questions: enough for a practice set
    const pr = await u.agent.post('/api/countries/RW/practice').send({ topicId: topic.id });
    expect(pr.status).toBe(201);
    await u.agent.post(`/api/attempts/${pr.body.attemptId}/submit`).send({});

    const d = (await u.agent.get(`/api/countries/RW/mock-tests/${MATHS}`)).body;
    expect(d.attemptStats.count).toBe(2);
    expect(d.attemptStats.last.id).toBe(second);
    expect(d.previousAttempts.map((a: { id: string }) => a.id).sort()).toEqual([first, second].sort());
    expect(d.previousAttempts.every((a: { kind: string }) => a.kind === 'FULL')).toBe(true);
    const best = Math.max(...(await prisma.attempt.findMany({ where: { id: { in: [first, second] } } })).map((a) => Number(a.percent)));
    expect(d.attemptStats.bestPercent).toBe(best);

    const guest = (await request(app).get(`/api/countries/RW/mock-tests/${MATHS}`)).body;
    expect(guest.attemptStats).toEqual({ count: 0, bestPercent: null, last: null });
  });
});

describe('the wrong-country answer says what the link was', () => {
  it('403 country_mismatch names both countries and the test', async () => {
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const u = await newUser();
      const ke = await prisma.mockTest.findFirstOrThrow({ where: { countryCode: 'KE', status: 'PUBLISHED' } });
      const res = await u.agent.get(`/api/countries/KE/mock-tests/${ke.slug}`);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        error: 'country_mismatch', requestedCountry: { code: 'KE', name: 'Kenya' }, userCountry: { code: 'RW', name: 'Rwanda' },
        test: { slug: ke.slug, title: ke.title },
      });
      const list = await u.agent.get('/api/countries/KE/mock-tests');
      expect(list.status).toBe(403);
      expect(list.body.test).toBeUndefined();
      const start = await u.agent.post(`/api/countries/KE/mock-tests/${ke.slug}/attempts`).send({});
      expect(start.body).toMatchObject({ error: 'country_mismatch', requestedCountry: { code: 'KE' }, userCountry: { code: 'RW' }, test: { title: ke.title } });
      expect((await u.agent.get('/api/countries/KE/mock-tests/not-a-test')).body.test).toBeNull();
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });
});

describe('request this exam and the waiting list', () => {
  it('requests are de-duplicated per address, anonymous ones always count, and the count comes back', async () => {
    const a = await request(app).post('/api/countries/RW/exam-requests').send({ query: 'Dentist', email: 'dent.one@example.com' });
    expect(a.status).toBe(201);
    expect(a.body).toEqual({ ok: true, alreadyRequested: false, requestCount: 1 });
    const again = await request(app).post('/api/countries/RW/exam-requests').send({ query: '  dentist ', email: 'DENT.one@example.com' });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, alreadyRequested: true, requestCount: 1 });
    const other = await request(app).post('/api/countries/RW/exam-requests').send({ query: 'DENTIST', email: 'dent.two@example.com' });
    expect(other.body).toMatchObject({ alreadyRequested: false, requestCount: 2 });
    const anon1 = await request(app).post('/api/countries/RW/exam-requests').send({ query: 'Dentist' });
    const anon2 = await request(app).post('/api/countries/RW/exam-requests').send({ query: 'Dentist' });
    expect([anon1.status, anon2.status, anon2.body.requestCount]).toEqual([201, 201, 4]);
    expect(await prisma.examRequest.count({ where: { normalizedQuery: 'dentist' } })).toBe(4);
  });

  it('a signed-in person is asked on their own address', async () => {
    const u = await newUser();
    const r = await u.agent.post('/api/countries/RW/exam-requests').send({ query: 'Radiographer' });
    expect(r.status).toBe(201);
    expect((await prisma.examRequest.findFirstOrThrow({ where: { normalizedQuery: 'radiographer' } })).email).toBe(u.email);
    expect((await u.agent.post('/api/countries/RW/exam-requests').send({ query: 'radiographer' })).body.alreadyRequested).toBe(true);
  });

  it('waiting list: 201 first time, 200 "already on the list" after, the interest is kept and updated', async () => {
    const first = await request(app).post('/api/countries/KE/waiting-list').send({ email: 'Wait.List@Example.com', interest: 'County accountant' });
    expect([first.status, first.body]).toEqual([201, { ok: true, alreadyOnList: false }]);
    const again = await request(app).post('/api/countries/KE/waiting-list').send({ email: ' wait.list@example.com ', interest: 'TSC teacher' });
    expect([again.status, again.body]).toEqual([200, { ok: true, alreadyOnList: true }]);
    const row = await prisma.waitingListEntry.findFirstOrThrow({ where: { countryCode: 'KE', email: 'wait.list@example.com' } });
    expect(row.interest).toBe('TSC teacher');
    expect(await prisma.waitingListEntry.count({ where: { countryCode: 'KE', email: 'wait.list@example.com' } })).toBe(1);
    expect((await request(app).post('/api/countries/KE/waiting-list').send({ email: 'x@example.com', interest: 'y'.repeat(121) })).status).toBe(400);
  });

  it('a signed-in person may leave the address out; a guest may not', async () => {
    const u = await newUser();
    const ok = await u.agent.post('/api/countries/KE/waiting-list').send({});
    expect(ok.status).toBe(201);
    expect((await prisma.waitingListEntry.findFirst({ where: { countryCode: 'KE', email: u.email } }))).not.toBeNull();
    expect((await request(app).post('/api/countries/KE/waiting-list').send({})).status).toBe(400);
  });
});

describe('support contact', () => {
  it('is public per country, from the admin setting, and says when nothing is configured', async () => {
    const rw = (await request(app).get('/api/countries/RW/support')).body.supportContact;
    expect(rw).toMatchObject({ configured: true, placeholder: true });
    expect(rw.phone).toBeTruthy();
    expect((await request(app).get('/api/countries/RW')).body.supportContact).toEqual(rw);
    const ug = (await request(app).get('/api/countries/UG/support')).body.supportContact;
    expect(ug).toEqual({ phone: null, whatsapp: null, email: null, hours: null, configured: false, placeholder: false });
    expect((await request(app).get('/api/countries/ZZ/support')).status).toBe(404);
  });

  it('falls back to the SUPPORT_* environment values', async () => {
    const withEnv = createApp({ prisma, config: testConfig({ SUPPORT_EMAIL: 'help@jobprep.example', SUPPORT_PHONE: '+256 700 111 222' }), email: mail, now: () => clock });
    const ug = (await request(withEnv).get('/api/countries/UG/support')).body.supportContact;
    expect(ug).toMatchObject({ email: 'help@jobprep.example', phone: '+256 700 111 222', whatsapp: null, configured: true, placeholder: false });
  });
});

describe('legal pages and maintenance status', () => {
  it('lists four pages with a last-updated date; every page is flagged placeholder until an admin saves real text', async () => {
    const list = (await request(app).get('/api/legal')).body.pages;
    expect(list.map((p: { slug: string }) => p.slug)).toEqual(['terms', 'privacy', 'refund', 'cookies']);
    expect(list.every((p: { placeholder: boolean; lastUpdated: string }) => p.placeholder && /^\d{4}-\d{2}-\d{2}$/.test(p.lastUpdated))).toBe(true);
    const terms = (await request(app).get('/api/legal/terms?country=RW')).body;
    expect(terms).toMatchObject({ slug: 'terms', title: 'Terms of use', placeholder: true, country: { code: 'RW', name: 'Rwanda' } });
    expect(terms.intro).toMatch(/Placeholder text/);
    expect(terms.sections.length).toBeGreaterThan(2);
    expect(terms.sections.every((s: { id: string; heading: string; paragraphs: string[] }) => s.id && s.heading && s.paragraphs.length > 0)).toBe(true);
    expect((await request(app).get('/api/legal/terms')).body.country).toBeNull();
    expect((await request(app).get('/api/legal/nope')).body.error).toBe('legal_page_not_found');
    expect((await request(app).get('/api/legal/terms?country=ZZ')).body.error).toBe('country_not_found');
  });

  it('real text saved by a system admin replaces the placeholder: for one country, or for all', async () => {
    const put = await system.put('/api/admin/legal/refund').send({
      countryCode: 'RW', title: 'Refund policy', lastUpdated: '2026-12-01', intro: 'Reviewed.', sections: [{ heading: 'Refunds', paragraphs: ['We refund within 7 days.'] }, { heading: 'Refunds', paragraphs: ['Second.'] }],
    });
    expect(put.status).toBe(200);
    const rw = (await request(app).get('/api/legal/refund?country=RW')).body;
    expect(rw).toMatchObject({ placeholder: false, lastUpdated: '2026-12-01', intro: 'Reviewed.' });
    expect(rw.sections.map((s: { id: string }) => s.id)).toEqual(['refunds', 'refunds-2']);
    expect((await request(app).get('/api/legal/refund?country=KE')).body.placeholder).toBe(true);
    expect((await request(app).get('/api/legal/refund')).body.placeholder).toBe(true);
    expect((await system.put('/api/admin/legal/privacy').send({ title: 'Privacy', sections: [{ heading: 'All', paragraphs: ['x'] }] })).status).toBe(200);
    expect((await request(app).get('/api/legal/privacy?country=KE')).body.placeholder).toBe(false);
    expect((await request(app).get('/api/legal')).body.pages.find((p: { slug: string }) => p.slug === 'privacy').placeholder).toBe(false);
    expect((await system.delete('/api/admin/legal/refund?country=RW')).status).toBe(200);
    expect((await request(app).get('/api/legal/refund?country=RW')).body.placeholder).toBe(true);
    expect((await system.delete('/api/admin/legal/refund?country=RW')).body.error).toBe('legal_override_not_found');
    expect((await system.get('/api/admin/legal')).body.pages.find((p: { slug: string }) => p.slug === 'privacy').overrides).toEqual(['*']);
  });

  it('GET /api/status shows the maintenance switch an admin set', async () => {
    expect((await request(app).get('/api/status')).body).toEqual({ ok: true, maintenance: { enabled: false, message: null, backAt: null } });
    const on = await system.put('/api/admin/settings').send({ maintenance: { enabled: true, message: 'Short upgrade', backAt: '2026-11-03T08:00:00.000Z' } });
    expect(on.status).toBe(200);
    expect((await request(app).get('/api/status')).body.maintenance).toEqual({ enabled: true, message: 'Short upgrade', backAt: '2026-11-03T08:00:00.000Z' });
    expect((await system.get('/api/admin/settings')).body.maintenance.enabled).toBe(true);
    expect((await system.put('/api/admin/settings').send({ maintenance: { enabled: false } })).status).toBe(200);
    const after = (await request(app).get('/api/status')).body.maintenance;
    expect(after.enabled).toBe(false);
    expect((await system.put('/api/admin/settings').send({ maintenance: { backAt: 'tomorrow' } })).status).toBe(400);
  });
});

describe('profile and account changes', () => {
  it('PATCH /me edits level, subject and exam date, and refuses a date that does not exist', async () => {
    const u = await newUser();
    const ok = await u.agent.patch('/api/me').send({ level: 'Secondary (S1–S3)', subject: 'Mathematics', examDate: '2026-12-14', name: 'Aline Uwase' });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ name: 'Aline Uwase', level: 'Secondary (S1–S3)', subject: 'Mathematics', examDate: '2026-12-14' });
    expect((await u.agent.patch('/api/me').send({ examDate: '2026-02-31' })).body.error).toBe('invalid_exam_date');
    expect((await u.agent.patch('/api/me').send({ examDate: 'soon' })).status).toBe(400);
    const cleared = await u.agent.patch('/api/me').send({ level: null, subject: null, examDate: null });
    expect(cleared.body.user).toMatchObject({ level: null, subject: null, examDate: null });
    expect((await u.agent.patch('/api/me').send({ language: 'sw' })).body.error).toBe('language_not_available');
    const cat = await prisma.category.findFirstOrThrow({ where: { countryCode: 'KE' } });
    expect((await u.agent.patch('/api/me').send({ goalCategoryId: cat.id })).body.error).toBe('invalid_goal');
  });

  it('PATCH /me saves and clears the preferred job, and refuses one from another country', async () => {
    const u = await newUser();
    const exam = await prisma.exam.findFirstOrThrow({ where: { profession: { category: { countryCode: 'RW' } } } });
    const saved = await u.agent.patch('/api/me').send({ preferredExamId: exam.id });
    expect(saved.status).toBe(200);
    expect(saved.body.preferredJob).toMatchObject({ examId: exam.id, slug: exam.slug });
    expect(saved.body.user.preferredExamId).toBe(exam.id);
    const fetched = await u.agent.get('/api/me');
    expect(fetched.body.preferredJob).toMatchObject({ examId: exam.id, slug: exam.slug });

    const otherCountry = await prisma.exam.findFirstOrThrow({ where: { profession: { category: { countryCode: 'KE' } } } });
    const rejected = await u.agent.patch('/api/me').send({ preferredExamId: otherCountry.id });
    expect(rejected.body.error).toBe('invalid_preferred_job');

    const cleared = await u.agent.patch('/api/me').send({ preferredExamId: null });
    expect(cleared.body.preferredJob).toBeNull();
    expect(cleared.body.user.preferredExamId).toBeNull();
  });

  it('changes the password: current one required, others signed out, this device stays', async () => {
    const u = await newUser();
    const other = request.agent(app);
    expect((await other.post('/api/auth/sign-in').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
    expect((await other.get('/api/me')).status).toBe(200);

    expect((await u.agent.post('/api/me/password').send({ newPassword: 'a brand new password' })).body.error).toBe('current_password_required');
    const wrong = await u.agent.post('/api/me/password').send({ currentPassword: 'not the password', newPassword: 'a brand new password' });
    expect([wrong.status, wrong.body.error]).toEqual([400, 'invalid_current_password']);
    expect((await u.agent.post('/api/me/password').send({ currentPassword: TEST_PASSWORD, newPassword: 'short' })).status).toBe(400);
    expect((await u.agent.post('/api/me/password').send({ currentPassword: TEST_PASSWORD, newPassword: 'a brand new password' })).body).toEqual({ ok: true });

    expect((await u.agent.get('/api/me')).status).toBe(200); // this device stays signed in
    expect((await other.get('/api/me')).status).toBe(401); // the other one is signed out
    expect((await request(app).post('/api/auth/sign-in').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/auth/sign-in').send({ email: u.email, password: 'a brand new password' })).status).toBe(200);
  });

  it('wrong current passwords lock like sign-in does (5 in a row)', async () => {
    const u = await newUser();
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await u.agent.post('/api/me/password').send({ currentPassword: 'wrong wrong wrong', newPassword: 'another password 1' })).status;
    expect(last).toBe(429);
    const locked = await u.agent.post('/api/me/password').send({ currentPassword: TEST_PASSWORD, newPassword: 'another password 1' });
    expect([locked.status, locked.body.error]).toEqual([429, 'too_many_attempts']);
    expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('a Google-only account (no password) can set its first password without a current one', async () => {
    const u = await newUser();
    await prisma.user.update({ where: { id: u.userId }, data: { passwordHash: null } });
    expect((await u.agent.post('/api/me/password').send({ newPassword: 'first password here' })).body).toEqual({ ok: true });
    expect((await request(app).post('/api/auth/sign-in').send({ email: u.email, password: 'first password here' })).status).toBe(200);
  });

  it('changes the email in two steps: a code to the new address, then the code', async () => {
    const u = await newUser();
    const next = `changed.${u.email}`;
    expect((await u.agent.post('/api/me/email-change').send({ email: u.email, password: TEST_PASSWORD })).body.error).toBe('same_email');
    expect((await u.agent.post('/api/me/email-change').send({ email: next, password: 'nope nope nope' })).body.error).toBe('invalid_current_password');
    expect((await u.agent.post('/api/me/email-change').send({ email: 'missing.cand1@example.com', password: TEST_PASSWORD })).body.error).toBe('email_taken');
    const step1 = await u.agent.post('/api/me/email-change').send({ email: next.toUpperCase(), password: TEST_PASSWORD });
    expect(step1.status).toBe(200);
    expect(step1.body).toMatchObject({ ok: true, expiresInSeconds: expect.any(Number), cooldownSeconds: expect.any(Number) });
    const code = mail.lastCode(next)!;
    expect(code).toMatch(/^\d{6}$/);
    expect((await u.agent.get('/api/me')).body.user.email).toBe(u.email); // nothing changed yet

    const bad = await u.agent.post('/api/me/email-change/verify').send({ email: next, code: code === '000000' ? '111111' : '000000' });
    expect([bad.status, bad.body.error]).toEqual([400, 'invalid_code']);
    const done = await u.agent.post('/api/me/email-change/verify').send({ email: next, code });
    expect(done.status).toBe(200);
    expect(done.body.user).toMatchObject({ email: next, emailVerified: true });
    expect((await request(app).post('/api/auth/sign-in').send({ email: next, password: TEST_PASSWORD })).status).toBe(200);
    expect((await request(app).post('/api/auth/sign-in').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(401);
    expect((await u.agent.post('/api/me/email-change/verify').send({ email: next, code })).status).toBe(400); // the code is single use (and now it is the same address)
  });

  it('the email-change code is limited like any verification code', async () => {
    const u = await newUser();
    const first = await u.agent.post('/api/me/email-change').send({ email: `limit.${u.email}`, password: TEST_PASSWORD });
    expect(first.status).toBe(200);
    const second = await u.agent.post('/api/me/email-change').send({ email: `limit.${u.email}`, password: TEST_PASSWORD });
    expect([second.status, second.body.error]).toEqual([429, 'otp_cooldown']);
  });

  it('account routes need a signed-in person', async () => {
    expect((await request(app).post('/api/me/password').send({ newPassword: 'whatever it is' })).status).toBe(401);
    expect((await request(app).post('/api/me/email-change').send({ email: 'a@b.co' })).status).toBe(401);
    expect((await request(app).get('/api/me/recommended-tests')).status).toBe(401);
    expect((await request(app).get('/api/me/payments')).status).toBe(401);
  });

  it('country-change says the goal will be cleared and asked again', async () => {
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const u = await newUser();
      const cat = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'teaching-positions' } });
      await u.agent.patch('/api/me').send({ goalCategoryId: cat.id });
      const res = (await u.agent.get('/api/me/country-change?to=KE')).body;
      expect(res).toMatchObject({ clearsGoal: true, currentGoal: { id: cat.id, name: 'Teaching positions' }, goalWillBeAskedAgain: true, keepsResults: true });
      const same = (await u.agent.get('/api/me/country-change?to=RW')).body;
      expect(same.clearsGoal).toBe(false);
      const noGoal = await newUser();
      expect((await noGoal.agent.get('/api/me/country-change?to=KE')).body).toMatchObject({ clearsGoal: false, currentGoal: null });
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });
});

describe('payment history and receipts', () => {
  it('lists only my payments, newest first and paged, with Check payment on pending ones; a receipt only for successful ones', async () => {
    const u = await newUser();
    const stranger = await newUser();
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    const mk = (userId: string, key: string, status: 'PENDING' | 'SUCCESSFUL' | 'DECLINED' | 'EXPIRED', minutesAgo: number, extra: Record<string, unknown> = {}) =>
      prisma.payment.create({
        data: {
          userId, countryCode: 'RW', planId: plan.id, provider: 'MTN_MOMO', msisdn: '+250788610001', amountMinor: 2000, currencyCode: 'RWF', idempotencyKey: key, status,
          expiresAt: new Date(clock.getTime() - (minutesAgo - 3) * 60_000), createdAt: new Date(clock.getTime() - minutesAgo * 60_000), ...extra,
        },
      });
    const ok = await mk(u.userId, 'hist-ok', 'SUCCESSFUL', 5000, { confirmedAt: new Date(clock.getTime() - 4990 * 60_000), transactionId: 'TXN-OK-1', providerReference: 'REF-OK-1' });
    await prisma.accessGrant.create({ data: { userId: u.userId, countryCode: 'RW', planId: plan.id, startsAt: new Date(clock.getTime() - 4990 * 60_000), endsAt: new Date(clock.getTime() + 20 * 86_400_000), paymentId: ok.id } });
    const declined = await mk(u.userId, 'hist-dec', 'DECLINED', 3000);
    const pending = await mk(u.userId, 'hist-pen', 'PENDING', 1, { expiresAt: new Date(clock.getTime() + 120_000) });
    const oldExpired = await mk(u.userId, 'hist-exp-old', 'EXPIRED', 600);
    const justExpired = await mk(u.userId, 'hist-exp-new', 'EXPIRED', 20);
    await mk(stranger.userId, 'hist-other', 'SUCCESSFUL', 10, { confirmedAt: clock, transactionId: 'TXN-OTHER' });

    const list = (await u.agent.get('/api/me/payments?pageSize=3')).body;
    expect(list).toMatchObject({ total: 5, page: 1, pageSize: 3, hasMore: true });
    expect(list.payments.map((p: { id: string }) => p.id)).toEqual([pending.id, justExpired.id, oldExpired.id]);
    const p2 = (await u.agent.get('/api/me/payments?pageSize=3&page=2')).body;
    expect(p2).toMatchObject({ hasMore: false });
    expect(p2.payments.map((p: { id: string }) => p.id)).toEqual([declined.id, ok.id]);

    const row = (id: string) => [...list.payments, ...p2.payments].find((p: { id: string }) => p.id === id);
    expect(row(pending.id)).toMatchObject({ status: 'PENDING', canCheck: true, priceLabel: 'RWF 2,000', providerLabel: 'MTN MoMo', transactionId: null });
    expect(row(justExpired.id).canCheck).toBe(true); // a late approval is still honoured
    expect(row(oldExpired.id).canCheck).toBe(false);
    expect(row(declined.id).canCheck).toBe(false);
    expect(row(ok.id)).toMatchObject({ status: 'SUCCESSFUL', transactionId: 'TXN-OK-1', canCheck: false });
    expect(row(ok.id).accessUntil).toBeTruthy();

    const receipt = (await u.agent.get(`/api/me/payments/${ok.id}`)).body;
    expect(receipt.payment).toMatchObject({ id: ok.id, status: 'SUCCESSFUL', transactionId: 'TXN-OK-1' });
    expect(receipt.receipt).toMatchObject({
      number: 'TXN-OK-1', issuedTo: { email: u.email }, country: { code: 'RW', name: 'Rwanda' }, plan: { name: 'Full Access', durationDays: 30 },
    });
    expect(receipt.receipt.accessEndsAt).toBeTruthy();
    expect((await u.agent.get(`/api/me/payments/${declined.id}`)).body.receipt).toBeNull();
    expect((await u.agent.get(`/api/me/payments/${(await prisma.payment.findFirstOrThrow({ where: { idempotencyKey: 'hist-other' } })).id}`)).status).toBe(404);
  });
});

describe('"Save my result" outcomes', () => {
  it('saved, already saved and nothing to save (unknown token, someone else\'s attempt)', async () => {
    const g = await request(app).post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
    const token = g.body.guestToken as string;
    await request(app).post(`/api/attempts/${g.body.attemptId}/submit`).set('X-Guest-Token', token).send({});
    const u = await newUser();
    const saved = (await u.agent.post('/api/me/claim-attempts').send({ guestTokens: [token] })).body;
    expect(saved).toMatchObject({ claimed: 1, outcome: 'saved', attemptIds: [g.body.attemptId], alreadyYours: 0, unknown: 0 });
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: g.body.attemptId } })).userId).toBe(u.userId);

    const again = (await u.agent.post('/api/me/claim-attempts').send({ guestTokens: [token] })).body;
    expect(again).toMatchObject({ claimed: 0, alreadyYours: 1, outcome: 'already_saved', attemptIds: [] });

    const thief = await newUser();
    const stolen = (await thief.agent.post('/api/me/claim-attempts').send({ guestTokens: [token] })).body;
    expect(stolen).toMatchObject({ claimed: 0, belongsToSomeoneElse: 1, outcome: 'nothing_to_save' });
    const unknown = (await thief.agent.post('/api/me/claim-attempts').send({ guestTokens: ['no-such-token-1234'] })).body;
    expect(unknown).toMatchObject({ claimed: 0, unknown: 1, outcome: 'nothing_to_save' });
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: g.body.attemptId } })).userId).toBe(u.userId);
  });

  it('an attempt from another country is not saved, and says so', async () => {
    const g = await request(app).post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
    await prisma.attempt.update({ where: { id: g.body.attemptId }, data: { countryCode: 'KE' } });
    const u = await newUser();
    const out = (await u.agent.post('/api/me/claim-attempts').send({ guestTokens: [g.body.guestToken] })).body;
    expect(out).toMatchObject({ claimed: 0, otherCountry: 1, outcome: 'nothing_to_save' });
  });
});

describe('reopening a finished attempt', () => {
  it('says it ended, whether it was automatic, and whether a new one may start', async () => {
    const u = await newUser();
    const id = await finishFree(u.agent);
    const s = (await u.agent.get(`/api/attempts/${id}`)).body;
    expect(s.finished).toBe(true);
    expect(s.reopen).toEqual({ ended: true, autoSubmitted: false, canStartNew: true, startNewReason: null, mockTestSlug: MATHS, countryCode: 'RW' });

    // A running attempt has no reopen block.
    const running = await u.agent.post(`/api/countries/RW/mock-tests/${PRIMARY}/attempts`).send({});
    expect((await u.agent.get(`/api/attempts/${running.body.attemptId}`)).body.reopen).toBeNull();

    // Auto-submitted when time ran out.
    await prisma.attempt.update({ where: { id: running.body.attemptId }, data: { status: 'AUTO_SUBMITTED', submittedAt: clock } });
    expect((await u.agent.get(`/api/attempts/${running.body.attemptId}`)).body.reopen).toMatchObject({ ended: true, autoSubmitted: true });

    // A paid test the person has no access to cannot be started again; practice sets cannot either.
    const paid = await prisma.mockTest.findFirstOrThrow({ where: { countryCode: 'RW', slug: ACCOUNTANT_PAID } });
    const att = await prisma.attempt.create({
      data: { mockTestId: paid.id, countryCode: 'RW', userId: u.userId, status: 'SUBMITTED', durationSeconds: 600, deadlineAt: clock, submittedAt: clock, scoreMarks: 0, totalMarks: 1, percent: 0 },
    });
    expect((await u.agent.get(`/api/attempts/${att.id}`)).body.reopen).toMatchObject({ canStartNew: false, startNewReason: 'needs_full_access' });
    await prisma.attempt.update({ where: { id: att.id }, data: { kind: 'PRACTICE', questionIds: [(await prisma.question.findFirstOrThrow({ where: { mockTestId: paid.id } })).id] } });
    expect((await u.agent.get(`/api/attempts/${att.id}`)).body.reopen).toMatchObject({ canStartNew: false, startNewReason: 'practice' });
  });
});

describe('results edge states', () => {
  it('flags a blank exam, and a topic breakdown with no weak area', async () => {
    const u = await newUser();
    const blank = await finishFree(u.agent);
    const r = (await u.agent.get(`/api/attempts/${blank}/result`)).body;
    expect(r.edge).toMatchObject({ noneAnswered: true, perfect: false });
    expect(r.counts.unanswered).toBe(r.counts.total);

    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: blank } });
    await prisma.attempt.update({
      where: { id: blank },
      data: { topicBreakdown: [{ topicId: 't1', topicName: 'Algebra', correct: 4, total: 5, percent: 80, marks: 4, marksAvailable: 5 }, { topicId: 't2', topicName: 'Geometry', correct: 3, total: 5, percent: 60, marks: 3, marksAvailable: 5 }] },
    });
    expect(attempt.kind).toBe('FULL');
    const r2 = (await u.agent.get(`/api/attempts/${blank}/result`)).body;
    expect(r2.edge).toMatchObject({ noWeakAreas: true, allTopicsStrong: false });
    expect(r2.canPractice).toBe(false);
    await prisma.attempt.update({
      where: { id: blank },
      data: { topicBreakdown: [{ topicId: 't1', topicName: 'Algebra', correct: 4, total: 5, percent: 80, marks: 4, marksAvailable: 5 }, { topicId: 't2', topicName: 'Geometry', correct: 1, total: 5, percent: 20, marks: 1, marksAvailable: 5 }] },
    });
    const r3 = (await u.agent.get(`/api/attempts/${blank}/result`)).body;
    expect(r3.edge).toMatchObject({ noWeakAreas: false, allTopicsStrong: false });
    expect(r3.canPractice).toBe(true);
  });

  it('a perfect score is flagged', async () => {
    const u = await newUser();
    const s = await u.agent.post(`/api/countries/RW/mock-tests/${ACCOUNTANT_FREE}/attempts`).send({});
    const id = s.body.attemptId as string;
    const state = (await u.agent.get(`/api/attempts/${id}`)).body;
    const qs = await prisma.question.findMany({ where: { id: { in: state.questions.map((q: { id: string }) => q.id) } } });
    const changes = qs.map((q) => ({ questionId: q.id, selected: (q.payload as { correct: string[] }).correct }));
    expect((await u.agent.put(`/api/attempts/${id}/answers`).send({ changes })).status).toBe(200);
    await u.agent.post(`/api/attempts/${id}/submit`).send({});
    const r = (await u.agent.get(`/api/attempts/${id}/result`)).body;
    expect(r.score.percent).toBe(100);
    expect(r.edge).toMatchObject({ perfect: true, noneAnswered: false, noWeakAreas: true, allTopicsStrong: true });
  });
});

describe('recommended tests respect the goal, level and subject', () => {
  it('ranks matching tests first (dashboard and the new endpoint agree) and never hides the rest', async () => {
    const u = await newUser();
    const teaching = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'teaching-positions' } });
    await u.agent.patch('/api/me').send({ goalCategoryId: teaching.id });

    const plain = (await u.agent.get('/api/me/recommended-tests?limit=10')).body;
    expect(plain.basis).toMatchObject({ goal: { name: 'Teaching positions' }, level: null, subject: null });
    expect(plain.tests.map((t: { slug: string }) => t.slug).sort()).toEqual([MATHS, MATHS_S46, PRIMARY, 'teaching-profession-cbc-pedagogy'].sort());
    expect(plain.tests.every((t: { reason: string }) => t.reason === 'goal')).toBe(true);

    await u.agent.patch('/api/me').send({ level: 'Primary (P1–P6)', subject: 'Pedagogy' });
    const primary = (await u.agent.get('/api/me/recommended-tests?limit=10')).body;
    expect(primary.tests[0]).toMatchObject({ slug: PRIMARY, matchedLevel: true });

    await u.agent.patch('/api/me').send({ level: 'Secondary (S4–S6)', subject: 'Mathematics' });
    const s46 = (await u.agent.get('/api/me/recommended-tests?limit=10')).body;
    expect(s46.tests[0]).toMatchObject({ slug: MATHS_S46, matchedSubject: true, matchedLevel: true, reason: 'subject_level' });
    expect(s46.tests.slice(-2).map((t: { slug: string }) => t.slug).sort()).toEqual([PRIMARY, 'teaching-profession-cbc-pedagogy'].sort());
    const slugs = s46.tests.map((t: { slug: string }) => t.slug);
    expect(slugs.indexOf(MATHS_S46)).toBeLessThan(slugs.indexOf(MATHS)); // the exact level code beats the word "secondary"

    const dash = (await u.agent.get('/api/me/dashboard')).body;
    expect(dash.startHere.isFree).toBe(true);
    const free = s46.tests.filter((t: { isFree: boolean }) => t.isFree);
    expect(dash.startHere.slug).toBe(free[0].slug);
    expect(dash.suggestedTests.length).toBeGreaterThan(0);
    expect(dash.suggestedTests.map((t: { slug: string }) => t.slug)).not.toContain(dash.startHere.slug);

    expect((await u.agent.get('/api/me/recommended-tests?limit=1')).body.tests).toHaveLength(1);
    expect((await u.agent.get('/api/me/recommended-tests?limit=0')).status).toBe(400);
  });

  it('tests the person already completed come last', async () => {
    const u = await newUser();
    const teaching = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'teaching-positions' } });
    await u.agent.patch('/api/me').send({ goalCategoryId: teaching.id, subject: 'Mathematics' });
    const before = (await u.agent.get('/api/me/recommended-tests?limit=10')).body.tests.map((t: { slug: string }) => t.slug);
    await finishFree(u.agent, before[0]);
    const after = (await u.agent.get('/api/me/recommended-tests?limit=10')).body.tests.map((t: { slug: string }) => t.slug);
    expect(after.at(-1)).toBe(before[0]);
  });
});
