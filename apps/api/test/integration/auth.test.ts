import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { ConsoleEmailProvider } from '../../src/services/email';
import { resetAndSeed, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
let clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: testConfig(), email: mail, now: () => clock });

let seq = 100000;
const nextEmail = () => `user${seq++}@example.com`;

beforeAll(() => resetAndSeed(prisma));
beforeEach(() => {
  clock = new Date('2026-11-02T10:00:00Z');
  mail.clear();
});
afterAll(() => prisma.$disconnect());

async function requestCode(agent: request.Agent, email: string, purpose: 'sign_up' | 'sign_in' = 'sign_up', countryCode: string | undefined = purpose === 'sign_up' ? 'RW' : undefined) {
  return agent.post('/api/auth/otp/request').send({ purpose, email, countryCode });
}

async function signUp(email: string, name = 'Aline Uwase', extra: Record<string, unknown> = {}) {
  const agent = request.agent(app);
  const r = await requestCode(agent, email, 'sign_up', 'RW');
  expect(r.status).toBe(200);
  const res = await agent.post('/api/auth/sign-up').send({
    countryCode: 'RW', email, name, code: mail.lastCode(email.trim().toLowerCase()), ...extra,
  });
  return { agent, res };
}

describe('sign-up', () => {
  it('country → email → OTP creates an account and a session cookie', async () => {
    const email = nextEmail();
    const { agent, res } = await signUp(email);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, countryCode: 'RW', name: 'Aline Uwase', language: 'en' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/jp_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.country).toMatchObject({ code: 'RW', currencyCode: 'RWF' });
    expect(me.body.access).toEqual({ current: null, expired: null, otherCountries: [] });
  });

  it('treats the address case-insensitively: A@x.com and a@x.com are one account', async () => {
    const mixed = `Mixed.Case${seq++}@Example.COM`;
    const lower = mixed.toLowerCase();
    // the code goes to the normalised (trimmed, lower-case) address
    const { agent, res } = await signUp(`  ${mixed}  `);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(lower);
    expect(mail.lastTo(lower)).toBeDefined();
    expect((await agent.get('/api/me')).body.user.email).toBe(lower);
    expect(await prisma.user.count({ where: { email: lower } })).toBe(1);

    // the other spelling is the same person: sign-up is refused, sign-in works
    const again = await requestCode(request.agent(app), lower.toUpperCase(), 'sign_up', 'RW');
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('account_exists');
    clock = new Date(clock.getTime() + 60_000);
    const a = request.agent(app);
    expect((await requestCode(a, lower.toUpperCase(), 'sign_in')).status).toBe(200);
    expect((await a.post('/api/auth/sign-in').send({ email: lower.toUpperCase(), code: mail.lastCode(lower) })).status).toBe(200);
  });

  it('never returns the code in the API response', async () => {
    const email = nextEmail();
    const r = await requestCode(request.agent(app), email);
    expect(JSON.stringify(r.body)).not.toContain(mail.lastCode(email)!);
    expect(r.body).toEqual({ cooldownSeconds: 45, expiresInSeconds: 300 });
  });

  it('rejects malformed email addresses, and sends nothing', async () => {
    const a = request.agent(app);
    for (const bad of ['0788123456', 'not-an-email', 'a@', '@example.com', 'a b@example.com', `${'x'.repeat(250)}@example.com`]) {
      const r = await requestCode(a, bad, 'sign_up', 'RW');
      expect(r.status, bad).toBe(400);
      expect(r.body.error, bad).toBe('validation_error');
    }
    expect((await requestCode(a, 'not-an-email', 'sign_in')).status).toBe(400);
    expect(mail.sent).toHaveLength(0);
  });

  it('needs a country to sign up (not to sign in), and the country must exist', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    const none = await a.post('/api/auth/otp/request').send({ purpose: 'sign_up', email }); // no countryCode
    expect([none.status, none.body.error]).toEqual([400, 'country_required']);
    const unknown = await requestCode(a, email, 'sign_up', 'ZZ');
    expect([unknown.status, unknown.body.error]).toEqual([400, 'invalid_country']);
    expect(mail.sent).toHaveLength(0);
    // sign-up itself also needs a valid country
    const noCountry = await a.post('/api/auth/sign-up').send({ email, name: 'No Country', code: '123456' });
    expect([noCountry.status, noCountry.body.error]).toEqual([400, 'validation_error']);
    const badCountry = await a.post('/api/auth/sign-up').send({ countryCode: 'ZZ', email, name: 'No Country', code: '123456' });
    expect(badCountry.body.error).toBe('invalid_country');
    // sign-in does not take a country at all
    expect((await requestCode(a, email, 'sign_in')).status).toBe(200);
  });

  it('refuses to create accounts in countries that are not live', async () => {
    const a = request.agent(app);
    const r = await requestCode(a, nextEmail(), 'sign_up', 'KE');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('country_not_available');
  });

  it('409s when the address already has an account', async () => {
    const email = nextEmail();
    await signUp(email);
    const again = await requestCode(request.agent(app), email, 'sign_up', 'RW');
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('account_exists');
  });

  it('validates the body (name, 6-digit code)', async () => {
    const email = nextEmail();
    const agent = request.agent(app);
    await requestCode(agent, email, 'sign_up', 'RW');
    const bad = await agent.post('/api/auth/sign-up').send({ countryCode: 'RW', email, name: 'A', code: '12' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('validation_error');
  });
});

describe('OTP rules', () => {
  it('enforces a resend cooldown with Retry-After', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    expect((await requestCode(a, email)).status).toBe(200);
    const second = await requestCode(a, email);
    expect(second.status).toBe(429);
    expect(second.body.error).toBe('otp_cooldown');
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);

    clock = new Date(clock.getTime() + 46_000);
    expect((await requestCode(a, email)).status).toBe(200);
  });

  it('the cooldown and the hourly cap are per address (and per purpose), not global', async () => {
    const one = nextEmail();
    const two = nextEmail();
    const a = request.agent(app);
    expect((await requestCode(a, one)).status).toBe(200);
    expect((await requestCode(a, one.toUpperCase())).status).toBe(429); // same address in other letters
    expect((await requestCode(a, two)).status).toBe(200); // another address is not held up
    await signUp(nextEmail());
    expect((await requestCode(a, one, 'sign_in')).status).toBe(200); // a different purpose has its own counter
  });

  it('caps requests per hour', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    for (let i = 0; i < 5; i++) {
      expect((await requestCode(a, email)).status).toBe(200);
      clock = new Date(clock.getTime() + 46_000);
    }
    const sixth = await requestCode(a, email);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error).toBe('otp_hourly_limit');
  });

  it('a wrong code fails and five wrong guesses burn the code, even if the right one follows', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await requestCode(a, email);
    const good = mail.lastCode(email)!;
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await a.post('/api/auth/sign-up').send({ countryCode: 'RW', email, name: 'Test User', code: wrong });
      expect(r.body.error).toBe('invalid_code');
    }
    const late = await a.post('/api/auth/sign-up').send({ countryCode: 'RW', email, name: 'Test User', code: good });
    expect(late.status).toBe(400);
    expect(late.body.error).toBe('too_many_attempts');
  });

  it('a code expires after the TTL', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await requestCode(a, email);
    const code = mail.lastCode(email);
    clock = new Date(clock.getTime() + 301_000);
    const r = await a.post('/api/auth/sign-up').send({ countryCode: 'RW', email, name: 'Test User', code });
    expect(r.body.error).toBe('code_expired'); // distinct from a wrong code, so the screen can offer "Send a new code"
  });

  it('a code is single use', async () => {
    const email = nextEmail();
    const { res } = await signUp(email);
    expect(res.status).toBe(201);
    const code = mail.lastCode(email);
    const replay = await request(app).post('/api/auth/sign-up').send({ countryCode: 'RW', email, name: 'Test User', code });
    expect(replay.status).toBe(400);
  });

  it('a code for one purpose cannot be used for another', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await requestCode(a, email, 'sign_up', 'RW');
    const code = mail.lastCode(email);
    // A sign-up code does not work at the sign-in endpoint…
    const wrongPurpose = await a.post('/api/auth/sign-in').send({ email, code });
    expect(wrongPurpose.status).toBe(400);
    expect(wrongPurpose.body.error).toBe('invalid_code');
    // …and was not consumed by that attempt: it still completes the sign-up.
    const ok = await a.post('/api/auth/sign-up').send({ countryCode: 'RW', email, name: 'Test User', code });
    expect(ok.status).toBe(201);
  });
});

describe('sign-in', () => {
  it('signs an existing user in and sets a new session', async () => {
    const email = nextEmail();
    await signUp(email);
    clock = new Date(clock.getTime() + 60_000);
    const a = request.agent(app);
    expect((await requestCode(a, email, 'sign_in')).status).toBe(200);
    const res = await a.post('/api/auth/sign-in').send({ email, code: mail.lastCode(email) });
    expect(res.status).toBe(200);
    expect((await a.get('/api/me')).status).toBe(200);
  });

  it('needs no country: the account already knows which country it belongs to', async () => {
    const email = nextEmail();
    await signUp(email);
    clock = new Date(clock.getTime() + 60_000);
    const a = request.agent(app);
    const r = await requestCode(a, email, 'sign_in'); // no countryCode
    expect(r.status).toBe(200);
    const res = await a.post('/api/auth/sign-in').send({ email, code: mail.lastCode(email) });
    expect(res.body.user).toMatchObject({ email, countryCode: 'RW' });
    expect(res.body.user).not.toHaveProperty('phone');
  });

  it('gives the same answer for unknown addresses and sends nothing (no account discovery)', async () => {
    const unknown = nextEmail();
    const known = nextEmail();
    await signUp(known);
    mail.clear();
    clock = new Date(clock.getTime() + 60_000);
    const a = await requestCode(request.agent(app), unknown, 'sign_in');
    const b = await requestCode(request.agent(app), known, 'sign_in');
    expect(a.status).toBe(b.status);
    expect(a.body).toEqual(b.body);
    expect(mail.lastTo(unknown)).toBeUndefined();
    expect(mail.lastTo(known)).toBeDefined();
    const verify = await request(app).post('/api/auth/sign-in').send({ email: unknown, code: '123456' });
    expect(verify.body.error).toBe('invalid_code');
  });

  it('blocks suspended users, and kills their existing sessions', async () => {
    const email = nextEmail();
    const { agent } = await signUp(email);
    await prisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });
    expect((await agent.get('/api/me')).status).toBe(401);

    clock = new Date(clock.getTime() + 60_000);
    const a = request.agent(app);
    await requestCode(a, email, 'sign_in');
    const r = await a.post('/api/auth/sign-in').send({ email, code: mail.lastCode(email) });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('account_suspended');
  });

  it('sign-out ends the session', async () => {
    const { agent } = await signUp(nextEmail());
    expect((await agent.post('/api/auth/sign-out')).status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('sessions expire after 30 days and a forged cookie is rejected', async () => {
    const { agent } = await signUp(nextEmail());
    expect((await agent.get('/api/me')).status).toBe(200);
    clock = new Date(clock.getTime() + 31 * 86_400_000);
    expect((await agent.get('/api/me')).status).toBe(401);
    const forged = await request(app).get('/api/me').set('Cookie', 'jp_session=not-a-real-token');
    expect(forged.status).toBe(401);
  });

  it('stores only a hash of the session token', async () => {
    const { res } = await signUp(nextEmail());
    const token = /jp_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
    const sessions = await prisma.session.findMany();
    expect(sessions.some((s) => s.tokenHash === token)).toBe(false);
  });
});

describe('profile and job goal', () => {
  it('lets a user pick a job goal from their own country’s categories only', async () => {
    const { agent } = await signUp(nextEmail());
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
    const { agent } = await signUp(nextEmail());
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
    const email = nextEmail();
    const { agent } = await signUp(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
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
  it('records "notify me" for countries that are not live, once per address', async () => {
    const first = await request(app).post('/api/countries/KE/waiting-list').send({ email: 'Waiting.Person@Example.com' });
    const again = await request(app).post('/api/countries/KE/waiting-list').send({ email: ' waiting.person@example.com ' });
    expect([first.status, again.status]).toEqual([201, 201]);
    expect(await prisma.waitingListEntry.count({ where: { countryCode: 'KE', email: 'waiting.person@example.com' } })).toBe(1);
  });

  it('is not offered for live countries or with a malformed address', async () => {
    expect((await request(app).post('/api/countries/RW/waiting-list').send({ email: 'someone@example.com' })).body.error).toBe('country_already_live');
    expect((await request(app).post('/api/countries/UG/waiting-list').send({ email: '0788000111' })).status).toBe(400);
    expect((await request(app).post('/api/countries/UG/waiting-list').send({})).status).toBe(400);
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
    const email = nextEmail();
    const { res, agent } = await signUp(email, 'Aline Uwase', { guestTokens: ['guest-token-aaaa'] });
    expect(res.body.claimedAttempts).toBe(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: att.id } })).userId).toBe(user.id);
    expect((await agent.get('/api/me')).status).toBe(200);
  });

  it('never steals an attempt that already belongs to someone else, or one from another country', async () => {
    const owner = await prisma.user.create({ data: { countryCode: 'RW', email: 'owner.one@example.com', name: 'Owner One' } });
    const owned = await mkAttempt({ guestToken: 'guest-token-bbbb', userId: owner.id });
    const keAttempt = await mkAttempt({ guestToken: 'guest-token-cccc', countryCode: 'KE' });

    const { res } = await signUp(nextEmail(), 'Thief Person', { guestTokens: ['guest-token-bbbb', 'guest-token-cccc'] });
    expect(res.body.claimedAttempts).toBe(0);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: owned.id } })).userId).toBe(owner.id);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: keAttempt.id } })).userId).toBeNull();
  });

  it('a signed-in user can claim later, and the call needs a session', async () => {
    const att = await mkAttempt({ guestToken: 'guest-token-dddd' });
    expect((await request(app).post('/api/me/claim-attempts').send({ guestTokens: ['guest-token-dddd'] })).status).toBe(401);
    const { agent } = await signUp(nextEmail());
    const res = await agent.post('/api/me/claim-attempts').send({ guestTokens: ['guest-token-dddd'] });
    expect(res.body.claimed).toBe(1);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: att.id } })).userId).not.toBeNull();
  });
});

describe('test endpoints and production safety', () => {
  it('exposes the OTP only when test endpoints are enabled', async () => {
    const email = nextEmail();
    await requestCode(request.agent(app), email);
    const res = await request(app).get('/api/test/otp').query({ email: email.toUpperCase() });
    expect(res.body).toEqual({ email, code: mail.lastCode(email) });

    const off = createApp({ prisma, config: testConfig({ ENABLE_TEST_ENDPOINTS: 'false' }), email: mail });
    expect((await request(off).get('/api/test/otp').query({ email })).status).toBe(404);
  });

  it('config refuses fake payments / console email in production and forces test endpoints off', () => {
    const base = { DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'x'.repeat(20), NODE_ENV: 'production' };
    const safeProd = {
      DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'r4nd0m-'.repeat(6), NODE_ENV: 'production', PAYMENT_PROVIDER_MODE: 'live',
      EMAIL_PROVIDER: 'smtp', MAIL_HOST: 'smtp.example.test', MAIL_USERNAME: 'noreply@jobprep.test', MAIL_PASSWORD: 'mail-secret', MAIL_FROM_ADDRESS: 'noreply@jobprep.test',
      PUBLIC_API_URL: 'https://api.jobprep.test', WEB_ORIGIN: 'https://jobprep.test',
      PAWAPAY_API_TOKEN: 'pawapay-test-token', PAWAPAY_CALLBACK_SECRET: 'a'.repeat(20),
    };
    expect(() => loadConfig({ ...base, PAYMENT_PROVIDER_MODE: 'fake', EMAIL_PROVIDER: 'smtp' })).toThrow(/fake/);
    expect(() => loadConfig({ ...base, PAYMENT_PROVIDER_MODE: 'live', EMAIL_PROVIDER: 'console' })).toThrow(/console/);
    const ok = loadConfig({ ...safeProd, ENABLE_TEST_ENDPOINTS: 'true' });
    expect(ok.ENABLE_TEST_ENDPOINTS).toBe(false);
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(app).post('/api/auth/otp/request').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_json');
  });
});
