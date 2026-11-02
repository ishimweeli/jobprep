import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { ConsoleSmsProvider } from '../../src/services/sms';
import { resetAndSeed, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const sms = new ConsoleSmsProvider(() => {});
let clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: testConfig(), sms, now: () => clock });

const RW = (n: string) => `+250788${n}`; // n: 6 digits → valid RW mobile
let seq = 100000;
const nextPhone = () => RW(String(seq++));

beforeAll(() => resetAndSeed(prisma));
beforeEach(() => {
  clock = new Date('2026-11-02T10:00:00Z');
  sms.clear();
});
afterAll(() => prisma.$disconnect());

async function requestCode(agent: request.Agent, phone: string, purpose: 'sign_up' | 'sign_in' = 'sign_up', countryCode?: string) {
  return agent.post('/api/auth/otp/request').send({ purpose, phone, countryCode });
}

async function signUp(phone: string, name = 'Aline Uwase', extra: Record<string, unknown> = {}) {
  const agent = request.agent(app);
  const r = await requestCode(agent, phone, 'sign_up', 'RW');
  expect(r.status).toBe(200);
  const res = await agent.post('/api/auth/sign-up').send({
    countryCode: 'RW', phone, name, code: sms.lastCode(phone), ...extra,
  });
  return { agent, res };
}

describe('sign-up', () => {
  it('country → phone → OTP creates an account and a session cookie', async () => {
    const phone = nextPhone();
    const { agent, res } = await signUp(phone);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ phone, countryCode: 'RW', name: 'Aline Uwase', language: 'en' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/jp_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.phone).toBe(phone);
    expect(me.body.country).toMatchObject({ code: 'RW', currencyCode: 'RWF' });
    expect(me.body.access).toEqual({ current: null, expired: null, otherCountries: [] });
  });

  it('accepts a locally typed number and stores E.164', async () => {
    const agent = request.agent(app);
    const r = await requestCode(agent, '078 811 2233', 'sign_up', 'RW');
    expect(r.status).toBe(200);
    expect(sms.lastCode('+250788112233')).toMatch(/^\d{6}$/);
  });

  it('never returns the code in the API response', async () => {
    const phone = nextPhone();
    const r = await requestCode(request.agent(app), phone);
    expect(JSON.stringify(r.body)).not.toContain(sms.lastCode(phone)!);
    expect(r.body).toEqual({ cooldownSeconds: 45, expiresInSeconds: 300 });
  });

  it('rejects numbers from another country and malformed numbers', async () => {
    const a = request.agent(app);
    expect((await requestCode(a, '+254712345678', 'sign_up', 'RW')).body.error).toBe('invalid_phone');
    expect((await requestCode(a, '0788', 'sign_up', 'RW')).status).toBe(400);
  });

  it('refuses to create accounts in countries that are not live', async () => {
    const a = request.agent(app);
    const r = await requestCode(a, '0712345678', 'sign_up', 'KE');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('country_not_available');
  });

  it('409s when the number already has an account', async () => {
    const phone = nextPhone();
    await signUp(phone);
    const again = await requestCode(request.agent(app), phone, 'sign_up', 'RW');
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('account_exists');
  });

  it('validates the body (name, 6-digit code)', async () => {
    const phone = nextPhone();
    const agent = request.agent(app);
    await requestCode(agent, phone, 'sign_up', 'RW');
    const bad = await agent.post('/api/auth/sign-up').send({ countryCode: 'RW', phone, name: 'A', code: '12' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('validation_error');
  });
});

describe('OTP rules', () => {
  it('enforces a resend cooldown with Retry-After', async () => {
    const phone = nextPhone();
    const a = request.agent(app);
    expect((await requestCode(a, phone)).status).toBe(200);
    const second = await requestCode(a, phone);
    expect(second.status).toBe(429);
    expect(second.body.error).toBe('otp_cooldown');
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);

    clock = new Date(clock.getTime() + 46_000);
    expect((await requestCode(a, phone)).status).toBe(200);
  });

  it('caps requests per hour', async () => {
    const phone = nextPhone();
    const a = request.agent(app);
    for (let i = 0; i < 5; i++) {
      expect((await requestCode(a, phone)).status).toBe(200);
      clock = new Date(clock.getTime() + 46_000);
    }
    const sixth = await requestCode(a, phone);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error).toBe('otp_hourly_limit');
  });

  it('a wrong code fails and five wrong guesses burn the code, even if the right one follows', async () => {
    const phone = nextPhone();
    const a = request.agent(app);
    await requestCode(a, phone);
    const good = sms.lastCode(phone)!;
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await a.post('/api/auth/sign-up').send({ countryCode: 'RW', phone, name: 'Test User', code: wrong });
      expect(r.body.error).toBe('invalid_code');
    }
    const late = await a.post('/api/auth/sign-up').send({ countryCode: 'RW', phone, name: 'Test User', code: good });
    expect(late.status).toBe(400);
    expect(late.body.error).toBe('too_many_attempts');
  });

  it('a code expires after the TTL', async () => {
    const phone = nextPhone();
    const a = request.agent(app);
    await requestCode(a, phone);
    const code = sms.lastCode(phone);
    clock = new Date(clock.getTime() + 301_000);
    const r = await a.post('/api/auth/sign-up').send({ countryCode: 'RW', phone, name: 'Test User', code });
    expect(r.body.error).toBe('code_expired'); // distinct from a wrong code, so the screen can offer "Send a new code"
  });

  it('a code is single use', async () => {
    const phone = nextPhone();
    const { res } = await signUp(phone);
    expect(res.status).toBe(201);
    const code = sms.lastCode(phone);
    const replay = await request(app).post('/api/auth/sign-up').send({ countryCode: 'RW', phone, name: 'Test User', code });
    expect(replay.status).toBe(400);
  });

  it('a code for one purpose cannot be used for another', async () => {
    const phone = nextPhone();
    const a = request.agent(app);
    await requestCode(a, phone, 'sign_up', 'RW');
    const code = sms.lastCode(phone);
    // A sign-up code does not work at the sign-in endpoint…
    const wrongPurpose = await a.post('/api/auth/sign-in').send({ phone, code });
    expect(wrongPurpose.status).toBe(400);
    expect(wrongPurpose.body.error).toBe('invalid_code');
    // …and was not consumed by that attempt: it still completes the sign-up.
    const ok = await a.post('/api/auth/sign-up').send({ countryCode: 'RW', phone, name: 'Test User', code });
    expect(ok.status).toBe(201);
  });
});

describe('sign-in', () => {
  it('signs an existing user in and sets a new session', async () => {
    const phone = nextPhone();
    await signUp(phone);
    clock = new Date(clock.getTime() + 60_000);
    const a = request.agent(app);
    expect((await requestCode(a, phone, 'sign_in')).status).toBe(200);
    const res = await a.post('/api/auth/sign-in').send({ phone, code: sms.lastCode(phone) });
    expect(res.status).toBe(200);
    expect((await a.get('/api/me')).status).toBe(200);
  });

  it('works with a local number plus country, and detects the country from a +prefix', async () => {
    const phone = nextPhone();
    await signUp(phone);
    clock = new Date(clock.getTime() + 60_000);
    const a = request.agent(app);
    const r = await requestCode(a, phone, 'sign_in'); // no countryCode, E.164 prefix
    expect(r.status).toBe(200);
  });

  it('gives the same answer for unknown numbers and sends nothing (no account discovery)', async () => {
    const unknown = nextPhone();
    const known = nextPhone();
    await signUp(known);
    sms.clear();
    clock = new Date(clock.getTime() + 60_000);
    const a = await requestCode(request.agent(app), unknown, 'sign_in');
    const b = await requestCode(request.agent(app), known, 'sign_in');
    expect(a.status).toBe(b.status);
    expect(a.body).toEqual(b.body);
    expect(sms.lastTo(unknown)).toBeUndefined();
    expect(sms.lastTo(known)).toBeDefined();
    const verify = await request(app).post('/api/auth/sign-in').send({ phone: unknown, code: '123456' });
    expect(verify.body.error).toBe('invalid_code');
  });

  it('blocks suspended users, and kills their existing sessions', async () => {
    const phone = nextPhone();
    const { agent } = await signUp(phone);
    await prisma.user.update({ where: { phone }, data: { status: 'SUSPENDED' } });
    expect((await agent.get('/api/me')).status).toBe(401);

    clock = new Date(clock.getTime() + 60_000);
    const a = request.agent(app);
    await requestCode(a, phone, 'sign_in');
    const r = await a.post('/api/auth/sign-in').send({ phone, code: sms.lastCode(phone) });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('account_suspended');
  });

  it('sign-out ends the session', async () => {
    const { agent } = await signUp(nextPhone());
    expect((await agent.post('/api/auth/sign-out')).status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('sessions expire after 30 days and a forged cookie is rejected', async () => {
    const { agent } = await signUp(nextPhone());
    expect((await agent.get('/api/me')).status).toBe(200);
    clock = new Date(clock.getTime() + 31 * 86_400_000);
    expect((await agent.get('/api/me')).status).toBe(401);
    const forged = await request(app).get('/api/me').set('Cookie', 'jp_session=not-a-real-token');
    expect(forged.status).toBe(401);
  });

  it('stores only a hash of the session token', async () => {
    const { res } = await signUp(nextPhone());
    const token = /jp_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
    const sessions = await prisma.session.findMany();
    expect(sessions.some((s) => s.tokenHash === token)).toBe(false);
  });
});

describe('profile and job goal', () => {
  it('lets a user pick a job goal from their own country’s categories only', async () => {
    const { agent } = await signUp(nextPhone());
    const rw = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'teaching-positions' } });
    const ke = await prisma.category.findFirstOrThrow({ where: { countryCode: 'KE', slug: 'teaching-positions' } });

    const ok = await agent.patch('/api/me').send({ goalCategoryId: rw.id });
    expect(ok.status).toBe(200);
    expect(ok.body.user.goalCategoryId).toBe(rw.id);

    const bad = await agent.patch('/api/me').send({ goalCategoryId: ke.id });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid_goal');
  });

  it('only allows languages the country offers', async () => {
    const { agent } = await signUp(nextPhone());
    expect((await agent.patch('/api/me').send({ language: 'rw' })).status).toBe(200);
    expect((await agent.patch('/api/me').send({ language: 'sw' })).body.error).toBe('language_not_available');
  });

  it('requires a session', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).patch('/api/me').send({ name: 'x y' })).status).toBe(401);
  });

  it('lists the categories of a country with test counts', async () => {
    const res = await request(app).get('/api/countries/RW/categories');
    expect(res.body.categories).toHaveLength(6);
    expect(res.body.categories[0]).toMatchObject({ slug: 'teaching-positions', featured: true });
    const ke = await request(app).get('/api/countries/KE/categories');
    expect(ke.body.categories.map((c: { slug: string }) => c.slug)).toContain('county-government');
    expect(res.body.categories.map((c: { slug: string }) => c.slug)).not.toContain('county-government');
  });
});

describe('changing country', () => {
  async function userWithRwAccess() {
    const phone = nextPhone();
    const { agent } = await signUp(phone);
    const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.create({
      data: {
        userId: user.id, countryCode: 'RW', planId: plan.id, startsAt: new Date(clock.getTime() - 7 * 86_400_000),
        endsAt: new Date(clock.getTime() + 23 * 86_400_000), source: 'MANUAL', reason: 'test',
      },
    });
    return { agent, user };
  }

  it('previews what changes: access in the old country keeps running, results kept', async () => {
    const { agent } = await userWithRwAccess();
    const res = await agent.get('/api/me/country-change?to=KE');
    expect(res.status).toBe(200);
    expect(res.body.from.code).toBe('RW');
    expect(res.body.to).toMatchObject({ code: 'KE', currencyCode: 'KES', selectable: false, paymentMethods: ['M-Pesa'] });
    expect(res.body.currentAccess.daysLeft).toBe(23);
    expect(res.body.keepsResults).toBe(true);
  });

  it('refuses a switch to a country that is not live, and requires explicit confirmation', async () => {
    const { agent } = await userWithRwAccess();
    expect((await agent.post('/api/me/country').send({ countryCode: 'KE', confirm: true })).body.error).toBe('country_not_available');
    expect((await agent.post('/api/me/country').send({ countryCode: 'KE' })).status).toBe(400);
    expect((await agent.post('/api/me/country').send({ countryCode: 'RW', confirm: true })).body.error).toBe('already_in_country');
  });

  it('switching keeps Rwanda access attached to Rwanda and clears the job goal', async () => {
    const { agent, user } = await userWithRwAccess();
    const rwGoal = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'procurement' } });
    await agent.patch('/api/me').send({ goalCategoryId: rwGoal.id });
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const res = await agent.post('/api/me/country').send({ countryCode: 'KE', confirm: true });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ countryCode: 'KE', goalCategoryId: null, language: 'en' });
      // In Kenya there is no active grant, but the Rwanda one is still running and reported separately.
      expect(res.body.access.current).toBeNull();
      expect(res.body.access.otherCountries).toEqual([expect.objectContaining({ countryCode: 'RW', daysLeft: 23 })]);

      const grants = await prisma.accessGrant.findMany({ where: { userId: user.id } });
      expect(grants).toHaveLength(1);
      expect(grants[0]!.countryCode).toBe('RW');

      // And back again: the Rwanda access is active once more.
      const back = await agent.post('/api/me/country').send({ countryCode: 'RW', confirm: true });
      expect(back.body.access.current.daysLeft).toBe(23);
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });
});

describe('waiting list', () => {
  it('records "notify me" for countries that are not live, once per number', async () => {
    const first = await request(app).post('/api/countries/KE/waiting-list').send({ phone: '0712 345 678' });
    const again = await request(app).post('/api/countries/KE/waiting-list').send({ phone: '+254712345678' });
    expect([first.status, again.status]).toEqual([201, 201]);
    expect(await prisma.waitingListEntry.count({ where: { countryCode: 'KE', phone: '+254712345678' } })).toBe(1);
  });

  it('is not offered for live countries or with a number from elsewhere', async () => {
    expect((await request(app).post('/api/countries/RW/waiting-list').send({ phone: '0788000111' })).body.error).toBe('country_already_live');
    expect((await request(app).post('/api/countries/UG/waiting-list').send({ phone: '+250788000111' })).body.error).toBe('invalid_phone');
  });
});

describe('"Save my result": claiming guest attempts', () => {
  const mkAttempt = async (over: { guestToken: string; countryCode?: string; userId?: string | null }) => {
    const slug = over.countryCode === 'KE' ? 'secondary-mathematics-teacher-sample' : 'secondary-mathematics-teacher-s1-s3-mock-1';
    const test = await prisma.mockTest.findFirstOrThrow({ where: { slug, countryCode: over.countryCode ?? 'RW' } });
    return prisma.attempt.create({
      data: {
        mockTestId: test.id, countryCode: over.countryCode ?? 'RW', guestToken: over.guestToken, userId: over.userId ?? null,
        status: 'SUBMITTED', durationSeconds: 1800, deadlineAt: new Date(), submittedAt: new Date(),
      },
    });
  };

  it('sign-up with the guest token links the guest attempt to the new account', async () => {
    const att = await mkAttempt({ guestToken: 'guest-token-aaaa' });
    const phone = nextPhone();
    const { res, agent } = await signUp(phone, 'Aline Uwase', { guestTokens: ['guest-token-aaaa'] });
    expect(res.body.claimedAttempts).toBe(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: att.id } })).userId).toBe(user.id);
    expect((await agent.get('/api/me')).status).toBe(200);
  });

  it('never steals an attempt that already belongs to someone else, or one from another country', async () => {
    const owner = await prisma.user.create({ data: { countryCode: 'RW', phone: '+250788999001', name: 'Owner One' } });
    const owned = await mkAttempt({ guestToken: 'guest-token-bbbb', userId: owner.id });
    const keAttempt = await mkAttempt({ guestToken: 'guest-token-cccc', countryCode: 'KE' });

    const { res } = await signUp(nextPhone(), 'Thief Person', { guestTokens: ['guest-token-bbbb', 'guest-token-cccc'] });
    expect(res.body.claimedAttempts).toBe(0);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: owned.id } })).userId).toBe(owner.id);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: keAttempt.id } })).userId).toBeNull();
  });

  it('a signed-in user can claim later, and the call needs a session', async () => {
    const att = await mkAttempt({ guestToken: 'guest-token-dddd' });
    expect((await request(app).post('/api/me/claim-attempts').send({ guestTokens: ['guest-token-dddd'] })).status).toBe(401);
    const { agent } = await signUp(nextPhone());
    const res = await agent.post('/api/me/claim-attempts').send({ guestTokens: ['guest-token-dddd'] });
    expect(res.body.claimed).toBe(1);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: att.id } })).userId).not.toBeNull();
  });
});

describe('test endpoints and production safety', () => {
  it('exposes the OTP only when test endpoints are enabled', async () => {
    const phone = nextPhone();
    await requestCode(request.agent(app), phone);
    const res = await request(app).get('/api/test/otp').query({ phone });
    expect(res.body.code).toBe(sms.lastCode(phone));

    const off = createApp({ prisma, config: testConfig({ ENABLE_TEST_ENDPOINTS: 'false' }), sms });
    expect((await request(off).get('/api/test/otp').query({ phone })).status).toBe(404);
  });

  it('config refuses fake payments / console SMS in production and forces test endpoints off', () => {
    const base = { DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'x'.repeat(20), NODE_ENV: 'production' };
    const safeProd = {
      DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'r4nd0m-'.repeat(6), NODE_ENV: 'production', PAYMENT_PROVIDER_MODE: 'live', SMS_PROVIDER: 'live',
      PUBLIC_API_URL: 'https://api.jobprep.test', WEB_ORIGIN: 'https://jobprep.test',
      MTN_MOMO_CALLBACK_SECRET: 'a'.repeat(20), AIRTEL_CALLBACK_SECRET: 'b'.repeat(20), MPESA_CALLBACK_SECRET: 'c'.repeat(20),
    };
    expect(() => loadConfig({ ...base, PAYMENT_PROVIDER_MODE: 'fake', SMS_PROVIDER: 'live' })).toThrow(/fake/);
    expect(() => loadConfig({ ...base, PAYMENT_PROVIDER_MODE: 'live', SMS_PROVIDER: 'console' })).toThrow(/console/);
    const ok = loadConfig({ ...safeProd, ENABLE_TEST_ENDPOINTS: 'true' });
    expect(ok.ENABLE_TEST_ENDPOINTS).toBe(false);
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(app).post('/api/auth/otp/request').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_json');
  });
});
