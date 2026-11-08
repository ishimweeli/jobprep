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
const advance = (secs: number) => { clock = new Date(clock.getTime() + secs * 1000); };

let seq = 100000;
const nextEmail = () => `user${seq++}@example.com`;
const PW = 'a sensible password';

beforeAll(() => resetAndSeed(prisma));
beforeEach(() => {
  clock = new Date('2026-11-02T10:00:00Z');
  mail.clear();
});
afterAll(() => prisma.$disconnect());

const norm = (e: string) => e.trim().toLowerCase();
const signUpRaw = (agent: request.Agent, email: string, extra: Record<string, unknown> = {}) =>
  agent.post('/api/auth/sign-up').send({ name: 'Aline Uwase', email, password: PW, ...extra });
const verifyRaw = (agent: request.Agent, email: string, code?: string, extra: Record<string, unknown> = {}) =>
  agent.post('/api/auth/verify-email').send({ email, code: code ?? mail.lastCode(norm(email)) ?? undefined, ...extra });
const signInRaw = (agent: request.Agent, email: string, password = PW, extra: Record<string, unknown> = {}) =>
  agent.post('/api/auth/sign-in').send({ email, password, ...extra });
const forgot = (email: string) => request(app).post('/api/auth/forgot-password').send({ email });
const reset = (token: string, password = 'brand new password') => request(app).post('/api/auth/reset-password').send({ token, password });

/** Sign up and verify through the real endpoints: `res` is the verify answer; `agent` holds the cookie. */
async function signUp(email: string, name = 'Aline Uwase', extra: Record<string, unknown> = {}) {
  const agent = request.agent(app);
  const r = await signUpRaw(agent, email, { name });
  expect(r.status).toBe(201);
  const res = await verifyRaw(agent, email, undefined, extra);
  return { agent, res };
}

/** An account that is verified and has a password, made without the endpoints. */
async function makeUser(over: Record<string, unknown> = {}) {
  const email = nextEmail();
  const { hashPassword } = await import('../../src/services/password');
  const now = new Date();
  const user = await prisma.user.create({
    data: { email, name: 'Made User', countryCode: 'RW', passwordHash: await hashPassword(PW), emailVerifiedAt: now, countryConfirmedAt: now, onboardedAt: now, ...over },
  });
  return { email, user };
}

describe('GET /api/auth/providers', () => {
  it('says whether Google is configured', async () => {
    expect((await request(app).get('/api/auth/providers')).body).toEqual({ google: false });
    const g = createApp({ prisma, config: testConfig({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret' }), email: mail });
    expect((await request(g).get('/api/auth/providers')).body).toEqual({ google: true });
    // half configured is not "configured"
    const half = createApp({ prisma, config: testConfig({ GOOGLE_CLIENT_ID: 'cid' }), email: mail });
    expect((await request(half).get('/api/auth/providers')).body).toEqual({ google: false });
  });
});

describe('sign-up', () => {
  it('when the email cannot be sent (tried twice) it says so and does not hold the person to the resend cooldown', async () => {
    let tries = 0;
    let down = true;
    const flaky = { send: async (m: Parameters<typeof mail.send>[0]) => { tries++; if (down) throw new Error('smtp down'); await mail.send(m); } };
    const broken = createApp({ prisma, config: testConfig(), email: flaky, now: () => clock });
    const email = nextEmail();
    const first = await signUpRaw(request.agent(broken), email);
    expect([first.status, first.body.error]).toEqual([503, 'email_not_sent']);
    expect(tries).toBe(2);
    expect(await prisma.otpCode.count({ where: { email } })).toBe(0);

    down = false;
    const again = await signUpRaw(request.agent(broken), email);
    expect(again.status).toBe(201);
    expect(mail.lastCode(email)).toMatch(/^\d{6}$/);
  });

  it('the code email has an HTML part as well as text', async () => {
    const email = nextEmail();
    await signUpRaw(request.agent(app), email);
    const sent = mail.lastTo(email)!;
    expect(sent.html).toContain(mail.lastCode(email)!);
    expect(sent.text).toContain(mail.lastCode(email)!);
  });

  it('creates an UNVERIFIED account, emails a 6-digit code, and signs nobody in', async () => {
    const email = nextEmail();
    const agent = request.agent(app);
    const res = await signUpRaw(agent, email);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: 'verification_required', email, cooldownSeconds: 45, expiresInSeconds: 600 });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect((await agent.get('/api/me')).status).toBe(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ name: 'Aline Uwase', countryCode: 'RW', language: 'en', emailVerifiedAt: null, countryConfirmedAt: null, onboardedAt: null, googleId: null });
    expect(user.passwordHash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(user.passwordHash).not.toContain(PW);

    const sent = mail.lastTo(email)!;
    expect(sent.subject).toBe(`Your JobPrep verification code: ${mail.lastCode(email)}`);
    expect(mail.lastCode(email)).toMatch(/^\d{6}$/);
    expect(sent.text).toContain('10 minutes');
    expect(sent.text).not.toContain(PW);
    expect(JSON.stringify(res.body)).not.toContain(mail.lastCode(email)!);
  });

  it('the code verifies the address, signs the person in with a persistent 30-day cookie, and returns the user', async () => {
    const email = nextEmail();
    const { agent, res } = await signUp(email);
    expect(res.status).toBe(200);
    expect(res.body.claimedAttempts).toBe(0);
    expect(res.body.user).toMatchObject({
      email, name: 'Aline Uwase', countryCode: 'RW', language: 'en', emailVerified: true, roles: [], goalCategoryId: null, level: null, subject: null, examDate: null,
      onboarding: { done: false, nextStep: 'country' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/jp_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/i);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).toEqual(clock);

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.country).toMatchObject({ code: 'RW', currencyCode: 'RWF' });
    expect(me.body.access).toEqual({ current: null, expired: null, otherCountries: [] });
  });

  it('treats the address case-insensitively: A@x.com and a@x.com are one account', async () => {
    const mixed = `Mixed.Case${seq++}@Example.COM`;
    const lower = mixed.toLowerCase();
    const { agent, res } = await signUp(`  ${mixed}  `);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(lower);
    expect(mail.lastTo(lower)).toBeDefined(); // the code goes to the normalised address
    expect(await prisma.user.count({ where: { email: lower } })).toBe(1);
    expect((await agent.get('/api/me')).body.user.email).toBe(lower);

    // the other spelling is the same person: sign-up is refused, sign-in works
    const again = await signUpRaw(request.agent(app), lower.toUpperCase());
    expect([again.status, again.body.error]).toEqual([409, 'account_exists']);
    expect((await signInRaw(request.agent(app), lower.toUpperCase())).status).toBe(200);
  });

  it('409 account_exists when a VERIFIED account already has the address', async () => {
    const email = nextEmail();
    await signUp(email);
    const again = await signUpRaw(request.agent(app), email, { password: 'another password' });
    expect([again.status, again.body.error]).toEqual([409, 'account_exists']);
    // and the existing password is untouched
    expect((await signInRaw(request.agent(app), email)).status).toBe(200);
  });

  it('an UNVERIFIED account is taken over by the newest sign-up: name and password overwritten, a new code, the old code dead', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await signUpRaw(a, email, { name: 'First Try', password: 'the first password' });
    const firstCode = mail.lastCode(email)!;
    advance(46);
    const second = await signUpRaw(a, email, { name: 'Second Try', password: 'the second password' });
    expect(second.status).toBe(201);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ name: 'Second Try', emailVerifiedAt: null });
    expect(mail.sent.filter((m) => m.to === email)).toHaveLength(2);

    const secondCode = mail.lastCode(email)!;
    if (firstCode !== secondCode) expect((await verifyRaw(a, email, firstCode)).body.error).toBe('invalid_code');
    expect((await verifyRaw(a, email, secondCode)).status).toBe(200);
    expect((await signInRaw(request.agent(app), email, 'the first password')).status).toBe(401);
    expect((await signInRaw(request.agent(app), email, 'the second password')).status).toBe(200);
  });

  it('a second sign-up inside the 45 s wait is 429 otp_cooldown and changes nothing', async () => {
    const email = nextEmail();
    await signUpRaw(request.agent(app), email, { password: 'the first password' });
    const again = await signUpRaw(request.agent(app), email, { name: 'Intruder', password: 'the intruder password' });
    expect([again.status, again.body.error]).toEqual([429, 'otp_cooldown']);
    expect(Number(again.headers['retry-after'])).toBeGreaterThan(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ name: 'Aline Uwase' });
    expect(mail.sent.filter((m) => m.to === email)).toHaveLength(1);
  });

  it('validates the body: 8 to 128 characters and no composition rules; name; email', async () => {
    const a = request.agent(app);
    const bad = async (over: Record<string, unknown>) => {
      const r = await signUpRaw(a, nextEmail(), over);
      expect([r.status, r.body.error], JSON.stringify(over)).toEqual([400, 'validation_error']);
    };
    await bad({ password: '1234567' });
    await bad({ password: 'x'.repeat(129) });
    await bad({ password: undefined });
    await bad({ name: 'A' });
    await bad({ name: undefined });
    await bad({ email: 'not-an-email' });
    expect(mail.sent).toHaveLength(0);

    for (const ok of ['aaaaaaaa', '12345678', 'x'.repeat(128), 'pass word with spaces']) {
      expect((await signUpRaw(a, nextEmail(), { password: ok })).status, ok.slice(0, 12)).toBe(201);
    }
    for (const badEmail of ['0788123456', 'a@', '@example.com', 'a b@example.com', `${'x'.repeat(250)}@example.com`]) {
      expect((await signUpRaw(a, badEmail)).status, badEmail).toBe(400);
    }
  });

  it('country: Rwanda (home) unless a LIVE country is given; unknown or not-live countries are refused', async () => {
    const a = request.agent(app);
    const e1 = nextEmail();
    expect((await signUpRaw(a, e1)).status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: e1 } })).countryCode).toBe('RW');
    const e2 = nextEmail();
    expect((await signUpRaw(a, e2, { countryCode: 'rw' })).status).toBe(201);
    const ke = await signUpRaw(a, nextEmail(), { countryCode: 'KE' });
    expect([ke.status, ke.body.error]).toEqual([400, 'country_not_available']);
    const zz = await signUpRaw(a, nextEmail(), { countryCode: 'ZZ' });
    expect([zz.status, zz.body.error]).toEqual([400, 'invalid_country']);
    // a not-live country is allowed once it is live
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const e3 = nextEmail();
      expect((await signUpRaw(a, e3, { countryCode: 'KE' })).status).toBe(201);
      expect(await prisma.user.findUniqueOrThrow({ where: { email: e3 } })).toMatchObject({ countryCode: 'KE', language: 'en' });
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });
});

describe('verify-email', () => {
  it('a wrong code is invalid_code with the tries left; five wrong guesses burn the code, even if the right one follows', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await signUpRaw(a, email);
    const good = mail.lastCode(email)!;
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await verifyRaw(a, email, wrong);
      expect([r.status, r.body.error, r.body.triesLeft]).toEqual([400, 'invalid_code', 4 - i]);
    }
    const late = await verifyRaw(a, email, good);
    expect([late.status, late.body.error, late.body.triesLeft]).toEqual([400, 'too_many_attempts', 0]);
    expect(late.headers['set-cookie']).toBeUndefined();
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).toBeNull();
  });

  it('a code lasts 10 minutes, then it is code_expired (distinct from a wrong code)', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await signUpRaw(a, email);
    const code = mail.lastCode(email)!;
    advance(599);
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await verifyRaw(a, email, wrong)).body.error).toBe('invalid_code'); // still alive
    advance(2);
    const r = await verifyRaw(a, email, code);
    expect([r.status, r.body.error]).toEqual([400, 'code_expired']);
  });

  it('a code is single use, and an already verified account never signs in with one', async () => {
    const email = nextEmail();
    const { res } = await signUp(email);
    expect(res.status).toBe(200);
    const code = mail.lastCode(email);
    const replay = await verifyRaw(request.agent(app), email, code ?? undefined);
    expect(replay.status).toBe(400);
    expect(replay.headers['set-cookie']).toBeUndefined();
  });

  it('a stale (older) code stops working once a newer one is sent', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await signUpRaw(a, email);
    const first = mail.lastCode(email)!;
    advance(46);
    await a.post('/api/auth/verify-email/resend').send({ email });
    const second = mail.lastCode(email)!;
    if (first !== second) expect((await verifyRaw(a, email, first)).body.error).toBe('invalid_code');
    expect((await verifyRaw(a, email, second)).status).toBe(200);
  });

  it('claims guest attempts on the account it verifies', async () => {
    const test = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'secondary-mathematics-teacher-s1-s3-mock-1', countryCode: 'RW' } });
    const att = await prisma.attempt.create({
      data: { mockTestId: test.id, countryCode: 'RW', guestToken: 'guest-token-verify', status: 'SUBMITTED', durationSeconds: 1800, deadlineAt: new Date(), submittedAt: new Date() },
    });
    const email = nextEmail();
    const a = request.agent(app);
    await signUpRaw(a, email, { guestTokens: ['guest-token-verify'] }); // accepted, but only verifying claims
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: att.id } })).userId).toBeNull();
    const res = await verifyRaw(a, email, undefined, { guestTokens: ['guest-token-verify'] });
    expect(res.body.claimedAttempts).toBe(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: att.id } })).userId).toBe(user.id);
  });

  it('a suspended unverified account cannot verify into a session', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await signUpRaw(a, email);
    await prisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });
    const r = await verifyRaw(a, email);
    expect([r.status, r.body.error]).toEqual([403, 'account_suspended']);
    expect(r.headers['set-cookie']).toBeUndefined();
  });

  it('validates the code format', async () => {
    const r = await request(app).post('/api/auth/verify-email').send({ email: nextEmail(), code: '12' });
    expect([r.status, r.body.error]).toEqual([400, 'validation_error']);
  });
});

describe('verify-email/resend', () => {
  const resend = (email: string) => request(app).post('/api/auth/verify-email/resend').send({ email });

  it('the same 200 whether the address has an unverified account, a verified one, or none; only the first gets an email', async () => {
    const unverified = nextEmail();
    await signUpRaw(request.agent(app), unverified);
    const verified = nextEmail();
    await signUp(verified);
    const unknown = nextEmail();
    mail.clear();
    advance(60);
    const [a, b, c] = [await resend(unverified), await resend(verified), await resend(unknown)];
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    const strip = (r: request.Response) => ({ ...r.body, requestId: undefined });
    expect(strip(a)).toEqual({ ok: true, cooldownSeconds: 45, expiresInSeconds: 600 });
    expect(strip(b)).toEqual(strip(a));
    expect(strip(c)).toEqual(strip(a));
    expect(mail.lastTo(unverified)).toBeDefined();
    expect(mail.lastTo(verified)).toBeUndefined();
    expect(mail.lastTo(unknown)).toBeUndefined();
    // a verified account is not signed in by anything the resend left behind
    expect((await request(app).post('/api/auth/verify-email').send({ email: verified, code: '123456' })).body.error).toBe('invalid_code');
  });

  it('the 45 s wait is enforced identically for known and unknown addresses (no discovery)', async () => {
    const known = nextEmail();
    const unknown = nextEmail();
    await signUpRaw(request.agent(app), known);
    advance(60);
    expect((await resend(known)).status).toBe(200);
    expect((await resend(unknown)).status).toBe(200);
    const k = await resend(known);
    const u = await resend(unknown);
    expect([k.status, k.body.error]).toEqual([429, 'otp_cooldown']);
    expect([u.status, u.body.error]).toEqual([429, 'otp_cooldown']);
    expect(Number(k.headers['retry-after'])).toBeGreaterThan(0);
    advance(46);
    expect((await resend(known)).status).toBe(200);
    expect((await resend(unknown.toUpperCase())).status).toBe(200);
  });

  it('caps at 5 codes an hour per address, the same for any address', async () => {
    const known = nextEmail();
    const unknown = nextEmail();
    await signUpRaw(request.agent(app), known); // 1st code for `known`
    for (let i = 0; i < 4; i++) {
      advance(46);
      expect((await resend(known)).status).toBe(200);
      expect((await resend(unknown)).status).toBe(200);
    }
    advance(46);
    expect((await resend(unknown)).status).toBe(200); // the 5th for unknown
    advance(46);
    const k = await resend(known);
    const u = await resend(unknown);
    expect([k.status, k.body.error]).toEqual([429, 'otp_hourly_limit']);
    expect([u.status, u.body.error]).toEqual([429, 'otp_hourly_limit']);
    advance(3600);
    expect((await resend(known)).status).toBe(200);
  });

  it('is per address, not global, and rejects a malformed address', async () => {
    const one = nextEmail();
    expect((await resend(one)).status).toBe(200);
    expect((await resend(nextEmail())).status).toBe(200);
    expect((await resend('nope')).status).toBe(400);
  });
});

describe('sign-in', () => {
  it('signs a verified person in: 200 { user, claimedAttempts }, a session, no email sent', async () => {
    const email = nextEmail();
    await signUp(email);
    mail.clear();
    advance(60);
    const a = request.agent(app);
    const res = await signInRaw(a, email);
    expect(res.status).toBe(200);
    expect(res.body.claimedAttempts).toBe(0);
    expect(res.body.user).toMatchObject({ email, countryCode: 'RW', emailVerified: true, roles: [] });
    expect(res.body.user).not.toHaveProperty('phone');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
    expect((await a.get('/api/me')).status).toBe(200);
    expect(mail.sent).toHaveLength(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).lastSeenAt).toEqual(clock);
  });

  it('treats the address case-insensitively', async () => {
    const { email } = await makeUser();
    expect((await signInRaw(request.agent(app), `  ${email.toUpperCase()} `)).status).toBe(200);
  });

  it('invalid_credentials is identical for an unknown email, a wrong password and an account with no password (Google-only)', async () => {
    const known = await makeUser();
    const googleOnly = await makeUser({ passwordHash: null, googleId: 'g-sub-only-1' });
    const wrongPw = await signInRaw(request.agent(app), known.email, 'not the password');
    const unknown = await signInRaw(request.agent(app), nextEmail());
    const noPassword = await signInRaw(request.agent(app), googleOnly.email);
    for (const r of [wrongPw, unknown, noPassword]) {
      expect([r.status, r.body.error]).toEqual([401, 'invalid_credentials']);
      expect(r.headers['set-cookie']).toBeUndefined();
    }
    const strip = (r: request.Response) => ({ ...r.body, requestId: undefined });
    expect(strip(unknown)).toEqual(strip(wrongPw));
    expect(strip(noPassword)).toEqual(strip(wrongPw));
    expect(mail.sent).toHaveLength(0);
  });

  it('an account made before passwords existed (no password, verified) must use Forgot password', async () => {
    const old = await makeUser({ passwordHash: null });
    expect((await signInRaw(request.agent(app), old.email)).body.error).toBe('invalid_credentials');
    await forgot(old.email);
    expect((await reset(mail.lastResetToken(old.email)!, 'my first password')).status).toBe(200);
    expect((await signInRaw(request.agent(app), old.email, 'my first password')).status).toBe(200);
  });

  it('correct password but unverified: 403 email_not_verified, and NO code is sent automatically', async () => {
    const email = nextEmail();
    const a = request.agent(app);
    await signUpRaw(a, email);
    mail.clear();
    advance(60);
    const r = await signInRaw(a, email);
    expect([r.status, r.body.error]).toEqual([403, 'email_not_verified']);
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(mail.sent).toHaveLength(0);
    // a wrong password for the same account does not say it is unverified
    expect((await signInRaw(a, email, 'not the password')).body.error).toBe('invalid_credentials');
    // "Resend verification" works, the code verifies, then sign-in works
    expect((await a.post('/api/auth/verify-email/resend').send({ email })).status).toBe(200);
    expect((await verifyRaw(a, email)).status).toBe(200);
    expect((await signInRaw(request.agent(app), email)).status).toBe(200);
  });

  it('blocks suspended users (403 account_suspended with the right password) and kills their sessions', async () => {
    const email = nextEmail();
    const { agent } = await signUp(email);
    await prisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });
    expect((await agent.get('/api/me')).status).toBe(401);
    const r = await signInRaw(request.agent(app), email);
    expect([r.status, r.body.error]).toEqual([403, 'account_suspended']);
    expect((await signInRaw(request.agent(app), email, 'not the password')).body.error).toBe('invalid_credentials');
  });

  it('claims guest attempts at sign-in too', async () => {
    const { email, user } = await makeUser();
    const test = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'secondary-mathematics-teacher-s1-s3-mock-1', countryCode: 'RW' } });
    const att = await prisma.attempt.create({
      data: { mockTestId: test.id, countryCode: 'RW', guestToken: 'guest-token-signin', status: 'SUBMITTED', durationSeconds: 1800, deadlineAt: new Date(), submittedAt: new Date() },
    });
    const res = await signInRaw(request.agent(app), email, PW, { guestTokens: ['guest-token-signin'] });
    expect(res.body.claimedAttempts).toBe(1);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: att.id } })).userId).toBe(user.id);
  });

  it('validates the body', async () => {
    const a = request.agent(app);
    expect((await a.post('/api/auth/sign-in').send({ email: 'not-an-email', password: PW })).status).toBe(400);
    expect((await a.post('/api/auth/sign-in').send({ email: nextEmail() })).status).toBe(400);
    expect((await a.post('/api/auth/sign-in').send({ email: nextEmail(), password: '' })).status).toBe(400);
    // a short password is not a validation error: it is just wrong (sign-in says nothing about the password rules)
    expect((await a.post('/api/auth/sign-in').send({ email: nextEmail(), password: 'short' })).status).toBe(401);
  });

  describe('remember me', () => {
    it('remember:true is a 30-day persistent cookie with a 30-day server expiry', async () => {
      const { email } = await makeUser();
      const a = request.agent(app);
      const res = await signInRaw(a, email, PW, { remember: true });
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/Max-Age=2592000/i);
      expect(cookie).toMatch(/Expires=/i);
      const s = await prisma.session.findFirstOrThrow({ where: { user: { email } }, orderBy: { createdAt: 'desc' } });
      expect(s.expiresAt.getTime() - s.createdAt.getTime()).toBe(30 * 86_400_000);
      advance(25 * 3600);
      expect((await a.get('/api/me')).status).toBe(200);
      advance(6 * 86_400);
      expect((await a.get('/api/me')).status).toBe(200);
      advance(24 * 86_400);
      expect((await a.get('/api/me')).status).toBe(401);
    });

    it('remember false or absent is a browser-session cookie (no Max-Age, no Expires) and a 24-hour server expiry', async () => {
      const { email } = await makeUser();
      for (const extra of [{}, { remember: false }]) {
        const a = request.agent(app);
        const res = await signInRaw(a, email, PW, extra);
        const cookie = String(res.headers['set-cookie']);
        expect(cookie).toMatch(/jp_session=/);
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).not.toMatch(/Max-Age/i);
        expect(cookie).not.toMatch(/Expires/i);
        const s = await prisma.session.findFirstOrThrow({ where: { user: { email } }, orderBy: { createdAt: 'desc' } });
        expect(s.expiresAt.getTime() - s.createdAt.getTime()).toBe(24 * 3_600_000);
        advance(23 * 3600);
        expect((await a.get('/api/me')).status).toBe(200);
        advance(2 * 3600);
        expect((await a.get('/api/me')).status).toBe(401);
      }
    });
  });

  describe('lockout', () => {
    it('five wrong passwords in a row lock the account for 15 minutes; the lock is checked BEFORE the password', async () => {
      const { email } = await makeUser();
      const a = request.agent(app);
      for (let i = 0; i < 4; i++) expect((await signInRaw(a, email, `wrong password ${i}`)).body.error).toBe('invalid_credentials');
      const fifth = await signInRaw(a, email, 'wrong password 5');
      expect([fifth.status, fifth.body.error, fifth.body.retryAfterSeconds]).toEqual([429, 'too_many_attempts', 900]);
      expect(Number(fifth.headers['retry-after'])).toBe(900);

      // even the right password is refused while locked, and says how long to wait
      advance(60);
      const locked = await signInRaw(a, email);
      expect([locked.status, locked.body.error, locked.body.retryAfterSeconds]).toEqual([429, 'too_many_attempts', 840]);
      expect(locked.headers['set-cookie']).toBeUndefined();
      // trying while locked does not extend the lock
      advance(839);
      expect((await signInRaw(a, email)).body.retryAfterSeconds).toBe(1);
      advance(2);
      expect((await signInRaw(a, email)).status).toBe(200);
    });

    it('the counter resets on success: 4 wrong, the right one, 4 wrong again does not lock', async () => {
      const { email } = await makeUser();
      const a = request.agent(app);
      for (let i = 0; i < 4; i++) await signInRaw(a, email, 'wrong password');
      expect((await signInRaw(a, email)).status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).failedSignIns).toBe(0);
      for (let i = 0; i < 4; i++) expect((await signInRaw(a, email, 'wrong password')).status).toBe(401);
      expect((await signInRaw(a, email)).status).toBe(200);
    });

    it('after a lock expires the counter starts again from zero', async () => {
      const { email } = await makeUser();
      const a = request.agent(app);
      for (let i = 0; i < 5; i++) await signInRaw(a, email, 'wrong password');
      advance(901);
      expect((await signInRaw(a, email, 'wrong password')).status).toBe(401); // not an instant re-lock
      expect((await signInRaw(a, email)).status).toBe(200);
    });

    it('a successful password reset clears the lock', async () => {
      const { email } = await makeUser();
      const a = request.agent(app);
      for (let i = 0; i < 5; i++) await signInRaw(a, email, 'wrong password');
      expect((await signInRaw(a, email)).status).toBe(429);
      await forgot(email);
      expect((await reset(mail.lastResetToken(email)!, 'a fresh password')).status).toBe(200);
      expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ failedSignIns: 0, signInLockedUntil: null });
      expect((await signInRaw(a, email, 'a fresh password')).status).toBe(200);
    });

    it('an account with no password locks the same way (so the lock reveals nothing extra); unknown addresses just keep getting 401', async () => {
      const googleOnly = await makeUser({ passwordHash: null, googleId: 'g-sub-lock-1' });
      const a = request.agent(app);
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await signInRaw(a, googleOnly.email, `guess ${i}`)).status);
      expect(codes).toEqual([401, 401, 401, 401, 429, 429]);
      const unknown = nextEmail();
      for (let i = 0; i < 7; i++) expect((await signInRaw(a, unknown, `guess ${i}`)).status).toBe(401);
    });

    it('a lock on one account does not touch another', async () => {
      const one = await makeUser();
      const two = await makeUser();
      const a = request.agent(app);
      for (let i = 0; i < 5; i++) await signInRaw(a, one.email, 'wrong password');
      expect((await signInRaw(a, two.email)).status).toBe(200);
    });
  });

  it('sign-out ends the session', async () => {
    const { agent } = await signUp(nextEmail());
    expect((await agent.post('/api/auth/sign-out')).status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('sessions made at verification expire after 30 days and a forged cookie is rejected', async () => {
    const { agent } = await signUp(nextEmail());
    expect((await agent.get('/api/me')).status).toBe(200);
    advance(31 * 86_400);
    expect((await agent.get('/api/me')).status).toBe(401);
    const forged = await request(app).get('/api/me').set('Cookie', 'jp_session=not-a-real-token');
    expect(forged.status).toBe(401);
  });

  it('stores only a hash of the session token, and no old sign-in routes exist', async () => {
    const { res } = await signUp(nextEmail());
    const token = /jp_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
    const sessions = await prisma.session.findMany();
    expect(sessions.some((s) => s.tokenHash === token)).toBe(false);
    const old = await request(app).post('/api/auth/otp/request').send({ purpose: 'sign_in', email: nextEmail() });
    expect(old.status).toBe(404);
  });
});

describe('forgot password and reset', () => {
  it('forgot-password is always 200 { ok: true }; only an existing account is emailed', async () => {
    const { email } = await makeUser();
    const known = await forgot(email);
    const unknown = await forgot(nextEmail());
    const bad = await request(app).post('/api/auth/forgot-password').send({ email: 'nope' });
    expect([known.status, unknown.status]).toEqual([200, 200]);
    expect(known.body).toEqual({ ok: true });
    expect(unknown.body).toEqual({ ok: true });
    expect(bad.status).toBe(400);
    expect(mail.sent).toHaveLength(1);
    const sent = mail.lastTo(email)!;
    expect(sent.subject).toBe('Reset your JobPrep password');
    const token = mail.lastResetToken(email)!;
    expect(token).toMatch(/^[\w-]{43}$/); // 32 random bytes, base64url
    expect(sent.text).toContain(`http://localhost:5173/reset-password?token=${token}`);
    expect(sent.text).toContain('60 minutes');
    expect(sent.text).not.toContain(PW);
  });

  it('works for an unverified account too (and a reset then verifies the address); suspended accounts get nothing', async () => {
    const email = nextEmail();
    await signUpRaw(request.agent(app), email);
    mail.clear();
    await forgot(email);
    expect(mail.lastResetToken(email)).toBeTruthy();
    const susp = await makeUser({ status: 'SUSPENDED' });
    await forgot(susp.email);
    expect(mail.lastTo(susp.email)).toBeUndefined();
  });

  it('is case-insensitive', async () => {
    const { email } = await makeUser();
    await forgot(`  ${email.toUpperCase()} `);
    expect(mail.lastResetToken(email)).toBeTruthy();
  });

  it('stores only a hash of the token', async () => {
    const { email, user } = await makeUser();
    await forgot(email);
    const token = mail.lastResetToken(email)!;
    const rows = await prisma.passwordReset.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toContain(token);
    expect(rows[0]!.expiresAt.getTime() - clock.getTime()).toBe(3600_000);
  });

  it('answers the same when capped, and silently sends nothing: 45 s wait and 5 an hour per address', async () => {
    const { email } = await makeUser();
    expect((await forgot(email)).body).toEqual({ ok: true });
    expect((await forgot(email)).body).toEqual({ ok: true }); // inside the 45 s wait
    expect(mail.sent).toHaveLength(1);
    for (let i = 0; i < 4; i++) {
      advance(46);
      await forgot(email);
    }
    expect(mail.sent).toHaveLength(5);
    advance(46);
    expect((await forgot(email)).body).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(5); // hourly cap reached
    advance(3600);
    await forgot(email);
    expect(mail.sent).toHaveLength(6);
  });

  it('GET /reset-password/check: { email } for a good token, 400 invalid_or_expired_token otherwise', async () => {
    const { email } = await makeUser();
    await forgot(email);
    const token = mail.lastResetToken(email)!;
    const ok = await request(app).get('/api/auth/reset-password/check').query({ token });
    expect([ok.status, ok.body.email]).toEqual([200, email]);
    for (const t of ['nope', token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')]) {
      const bad = await request(app).get('/api/auth/reset-password/check').query({ token: t });
      expect([bad.status, bad.body.error]).toEqual([400, 'invalid_or_expired_token']);
    }
    expect((await request(app).get('/api/auth/reset-password/check')).status).toBe(400);
    advance(3601);
    expect((await request(app).get('/api/auth/reset-password/check').query({ token })).body.error).toBe('invalid_or_expired_token');
  });

  it('sets the password, does NOT sign in, ends every session, verifies the email; the token works once', async () => {
    const email = nextEmail();
    const { agent } = await signUp(email);
    const other = request.agent(app);
    advance(60);
    await signInRaw(other, email);
    expect((await agent.get('/api/me')).status).toBe(200);
    await forgot(email);
    const token = mail.lastResetToken(email)!;

    const res = await reset(token, 'the new password');
    expect([res.status, res.body]).toEqual([200, { ok: true }]);
    expect(res.headers['set-cookie']).toBeUndefined(); // not signed in
    expect((await agent.get('/api/me')).status).toBe(401);
    expect((await other.get('/api/me')).status).toBe(401);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);

    expect((await signInRaw(request.agent(app), email, PW)).body.error).toBe('invalid_credentials');
    expect((await signInRaw(request.agent(app), email, 'the new password')).status).toBe(200);

    const again = await reset(token, 'yet another password');
    expect([again.status, again.body.error]).toEqual([400, 'invalid_or_expired_token']);
    expect((await signInRaw(request.agent(app), email, 'yet another password')).status).toBe(401);
    expect((await request(app).get('/api/auth/reset-password/check').query({ token })).status).toBe(400);
  });

  it('marks an unverified email as verified', async () => {
    const email = nextEmail();
    await signUpRaw(request.agent(app), email);
    advance(60);
    await forgot(email);
    expect((await reset(mail.lastResetToken(email)!, 'the reset password')).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();
    expect((await signInRaw(request.agent(app), email, 'the reset password')).status).toBe(200);
  });

  it('a token expires after an hour', async () => {
    const { email } = await makeUser();
    await forgot(email);
    const token = mail.lastResetToken(email)!;
    advance(3599);
    expect((await request(app).get('/api/auth/reset-password/check').query({ token })).status).toBe(200);
    advance(2);
    const r = await reset(token);
    expect([r.status, r.body.error]).toEqual([400, 'invalid_or_expired_token']);
    expect((await signInRaw(request.agent(app), email, 'brand new password')).status).toBe(401);
  });

  it('a newer link replaces the older one', async () => {
    const { email } = await makeUser();
    await forgot(email);
    const first = mail.lastResetToken(email)!;
    advance(46);
    await forgot(email);
    const second = mail.lastResetToken(email)!;
    expect(second).not.toBe(first);
    expect((await reset(first)).body.error).toBe('invalid_or_expired_token');
    expect((await reset(second)).status).toBe(200);
  });

  it('enforces the password rules and keeps the token usable after a refusal', async () => {
    const { email } = await makeUser();
    await forgot(email);
    const token = mail.lastResetToken(email)!;
    expect((await reset(token, 'short')).body.error).toBe('validation_error');
    expect((await reset(token, 'x'.repeat(129))).body.error).toBe('validation_error');
    expect((await reset(token, 'long enough now')).status).toBe(200);
  });

  it('unknown or malformed tokens are 400 invalid_or_expired_token (or validation_error when absent)', async () => {
    const r = await reset('this-is-not-a-real-token-at-all-0123456789');
    expect([r.status, r.body.error]).toEqual([400, 'invalid_or_expired_token']);
    expect((await request(app).post('/api/auth/reset-password').send({ password: 'long enough now' })).status).toBe(400);
  });
});

describe('Continue with Google', () => {
  const CID = 'test-client-id.apps.googleusercontent.com';
  const gConfig = () => testConfig({ GOOGLE_CLIENT_ID: CID, GOOGLE_CLIENT_SECRET: 'test-client-secret' });
  const idToken = (claims: Record<string, unknown>) => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.${Buffer.from('signature').toString('base64url')}`;
  };
  const goodClaims = (over: Record<string, unknown> = {}) => ({
    iss: 'https://accounts.google.com', aud: CID, exp: Math.floor(clock.getTime() / 1000) + 3600,
    email: 'google.person@example.com', email_verified: true, sub: 'google-sub-1', name: 'Gwen Google', ...over,
  });

  /** An app wired to a fake Google token endpoint; `calls` records what we sent it. */
  function googleApp(respond: () => { ok?: boolean; status?: number; body: unknown }) {
    const calls: { url: string; method?: string; headers?: Record<string, string>; body?: string }[] = [];
    const fetchMock = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
      calls.push({ url, ...init });
      const r = respond();
      return { ok: r.ok ?? true, status: r.status ?? 200, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
    };
    return { calls, app: createApp({ prisma, config: gConfig(), email: mail, now: () => clock, fetch: fetchMock }) };
  }
  const withClaims = (claims: Record<string, unknown>) => googleApp(() => ({ body: { id_token: idToken(claims), access_token: 'x' } }));

  const start = (a: request.Agent, query: Record<string, string> = {}) => a.get('/api/auth/google/start').query(query).redirects(0);
  const stateOf = (res: request.Response) => new URL(res.headers.location!).searchParams.get('state')!;
  const callback = (a: request.Agent, state: string | null, code: string | undefined = 'auth-code-1') =>
    a.get('/api/auth/google/callback').query({ ...(code ? { code } : {}), ...(state ? { state } : {}) }).redirects(0);
  const FAIL = 'http://localhost:5173/sign-in?error=google_failed';

  async function fullFlow(g: ReturnType<typeof googleApp>, query: Record<string, string> = {}) {
    const a = request.agent(g.app);
    const s = await start(a, query);
    expect(s.status).toBe(302);
    return { a, res: await callback(a, stateOf(s)) };
  }

  it('"Sign in" with an unknown Google account creates nothing and sends the person to Sign up with a notice', async () => {
    const g = withClaims(goodClaims({ email: 'nobody.yet@example.com', sub: 'google-sub-new' }));
    const { a, res } = await fullFlow(g, { next: '/dashboard', intent: 'sign_in' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/sign-up?notice=google_no_account&next=%2Fdashboard');
    expect(String(res.headers['set-cookie'] ?? '')).not.toMatch(/jp_session=[^;]/);
    expect(await prisma.user.findUnique({ where: { email: 'nobody.yet@example.com' } })).toBeNull();
    expect((await a.get('/api/me')).status).toBe(401);
  });

  it('"Sign in" with a known Google account signs in as before', async () => {
    await makeUser({ email: 'known.google@example.com', googleId: 'google-sub-known' });
    const { res } = await fullFlow(withClaims(goodClaims({ email: 'known.google@example.com', sub: 'google-sub-known' })), { intent: 'sign_in' });
    expect(res.headers.location).toBe('http://localhost:5173/auth/callback?next=%2F');
  });

  it('"Create an account" with an existing address signs in to it and says the account already existed', async () => {
    await makeUser({ email: 'already.here@example.com' });
    const { a, res } = await fullFlow(withClaims(goodClaims({ email: 'already.here@example.com', sub: 'google-sub-here' })), { intent: 'sign_up' });
    expect(res.headers.location).toBe('http://localhost:5173/auth/callback?next=%2F&notice=account_exists');
    expect((await a.get('/api/me')).body.user.email).toBe('already.here@example.com');
    expect(await prisma.user.count({ where: { email: 'already.here@example.com' } })).toBe(1);
  });

  it('"Create an account" with a new Google account creates it with no notice', async () => {
    const { res } = await fullFlow(withClaims(goodClaims({ email: 'brand.new@example.com', sub: 'google-sub-brand' })), { intent: 'sign_up' });
    expect(res.headers.location).toBe('http://localhost:5173/auth/callback?next=%2F');
    expect(await prisma.user.findUnique({ where: { email: 'brand.new@example.com' } })).not.toBeNull();
  });

  it('start is 404 when Google is not configured', async () => {
    const r = await request(app).get('/api/auth/google/start').redirects(0);
    expect([r.status, r.body.error]).toEqual([404, 'google_not_configured']);
    expect((await request(app).get('/api/auth/google/callback').query({ code: 'x', state: 'y' }).redirects(0)).status).toBe(404);
  });

  it('start redirects to Google with our redirect URI and a signed state, and sets the nonce cookie', async () => {
    const g = googleApp(() => ({ body: {} }));
    const r = await start(request.agent(g.app), { next: '/dashboard', countryCode: 'rw' });
    expect(r.status).toBe(302);
    const url = new URL(r.headers.location!);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CID);
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4000/api/auth/google/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')!.split('.')).toHaveLength(2);
    expect(String(r.headers.location)).not.toContain('test-client-secret');
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(/jp_google_state=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=600/i);
    expect(g.calls).toHaveLength(0);
  });

  it('exchanges the code at Google and signs a NEW person in: verified, no password, 30-day cookie, redirect to /auth/callback', async () => {
    const g = withClaims(goodClaims());
    const { a, res } = await fullFlow(g, { next: '/dashboard' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/auth/callback?next=%2Fdashboard');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/jp_session=/);
    expect(cookie).toMatch(/Max-Age=2592000/i);

    expect(g.calls).toHaveLength(1);
    expect(g.calls[0]!.url).toBe('https://oauth2.googleapis.com/token');
    expect(g.calls[0]!.method).toBe('POST');
    const form = new URLSearchParams(g.calls[0]!.body);
    expect(Object.fromEntries(form)).toMatchObject({
      code: 'auth-code-1', client_id: CID, client_secret: 'test-client-secret', grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:4000/api/auth/google/callback',
    });

    const me = await a.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: 'google.person@example.com', name: 'Gwen Google', countryCode: 'RW', emailVerified: true, onboarding: { done: false, nextStep: 'country' } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'google.person@example.com' } });
    expect(user).toMatchObject({ googleId: 'google-sub-1', passwordHash: null });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect((await signInRaw(request.agent(app), user.email, PW)).body.error).toBe('invalid_credentials'); // no password to guess
  });

  it('a second Google sign-in finds the same person by Google id (even if the email claim changed)', async () => {
    const first = await fullFlow(withClaims(goodClaims({ email: 'repeat.google@example.com', sub: 'google-sub-repeat' })));
    expect(first.res.headers.location).toContain('/auth/callback');
    const second = await fullFlow(withClaims(goodClaims({ email: 'renamed.google@example.com', sub: 'google-sub-repeat' })));
    expect(second.res.headers.location).toContain('/auth/callback');
    expect(await prisma.user.count({ where: { googleId: 'google-sub-repeat' } })).toBe(1);
    expect(await prisma.user.count({ where: { email: 'renamed.google@example.com' } })).toBe(0);
  });

  it('links to an existing VERIFIED account with the same email (and keeps its password)', async () => {
    const { email, user } = await makeUser();
    const { a, res } = await fullFlow(withClaims(goodClaims({ email: email.toUpperCase(), sub: 'google-sub-link', name: 'Ignored Name' })));
    expect(res.headers.location).toContain('/auth/callback');
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ googleId: 'google-sub-link', name: 'Made User' });
    expect((await a.get('/api/me')).body.user.id).toBe(user.id);
    expect((await signInRaw(request.agent(app), email)).status).toBe(200); // the password still works
  });

  it('linking to an UNVERIFIED account verifies it and drops the password somebody set before proving the address', async () => {
    const email = nextEmail();
    await signUpRaw(request.agent(app), email, { password: 'set by whoever typed it' });
    const { res } = await fullFlow(withClaims(goodClaims({ email, sub: 'google-sub-unverified' })));
    expect(res.headers.location).toContain('/auth/callback');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.googleId).toBe('google-sub-unverified');
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.passwordHash).toBeNull();
  });

  it('refuses an address that is already tied to a DIFFERENT Google account', async () => {
    const { email } = await makeUser({ googleId: 'google-sub-owner' });
    const { res } = await fullFlow(withClaims(goodClaims({ email, sub: 'google-sub-intruder' })));
    expect(res.headers.location).toBe(FAIL);
    expect(String(res.headers['set-cookie'])).not.toMatch(/jp_session=[^;]+;/);
  });

  it('the country in the state is used for a new account when it is live, else Rwanda', async () => {
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      await fullFlow(withClaims(goodClaims({ email: 'g.ke@example.com', sub: 'google-sub-ke' })), { countryCode: 'KE' });
      expect((await prisma.user.findUniqueOrThrow({ where: { email: 'g.ke@example.com' } })).countryCode).toBe('KE');
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
    await fullFlow(withClaims(goodClaims({ email: 'g.ke2@example.com', sub: 'google-sub-ke2' })), { countryCode: 'KE' });
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'g.ke2@example.com' } })).countryCode).toBe('RW');
    await fullFlow(withClaims(goodClaims({ email: 'g.zz@example.com', sub: 'google-sub-zz' })), { countryCode: 'ZZ' });
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'g.zz@example.com' } })).countryCode).toBe('RW');
  });

  it('only same-site `next` paths survive; anything else becomes "/"', async () => {
    for (const [next, expected] of [
      ['/exams/accountant?x=1', '/exams/accountant?x=1'],
      ['//evil.example.com', '/'],
      ['https://evil.example.com/x', '/'],
      ['/\\evil.example.com', '/'],
      ['javascript:alert(1)', '/'],
      ['', '/'],
    ] as const) {
      const g = withClaims(goodClaims({ email: 'g.next@example.com', sub: 'google-sub-next' }));
      const { res } = await fullFlow(g, next ? { next } : {});
      expect(res.headers.location, next).toBe(`http://localhost:5173/auth/callback?next=${encodeURIComponent(expected)}`);
    }
  });

  it('a tampered state is refused: bad signature, altered payload, garbage, missing', async () => {
    const g = withClaims(goodClaims());
    const a = request.agent(g.app);
    const state = stateOf(await start(a, { next: '/dashboard' }));
    const [body, mac] = state.split('.') as [string, string];
    const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), next: '/admin' })).toString('base64url');
    for (const bad of [`${altered}.${mac}`, `${body}.${mac.slice(0, -2)}xx`, `${body}.`, 'garbage', `${body}.${mac}.extra`, null]) {
      const r = await callback(a, bad);
      expect(r.status, String(bad)).toBe(302);
      expect(r.headers.location, String(bad)).toBe(FAIL);
    }
    expect(g.calls).toHaveLength(0); // Google was never called
    expect(String((await a.get('/api/me')).status)).toBe('401');
  });

  it('the state must match the nonce cookie of the SAME browser (cross-browser replay, missing cookie, wrong cookie)', async () => {
    const g = withClaims(goodClaims());
    const victim = request.agent(g.app);
    const state = stateOf(await start(victim));
    // another browser with no cookie
    expect((await callback(request.agent(g.app), state)).headers.location).toBe(FAIL);
    // another browser with a different nonce from its own start
    const attacker = request.agent(g.app);
    await start(attacker);
    expect((await callback(attacker, state)).headers.location).toBe(FAIL);
    expect(g.calls).toHaveLength(0);
    // the real browser still works
    expect((await callback(victim, state)).headers.location).toContain('/auth/callback');
  });

  it('the state expires after 10 minutes', async () => {
    const g = withClaims(goodClaims());
    const a = request.agent(g.app);
    const state = stateOf(await start(a));
    advance(601);
    expect((await callback(a, state)).headers.location).toBe(FAIL);
    expect(g.calls).toHaveLength(0);
  });

  it('a Google error, a missing code, a failed token exchange or an unreadable answer all go to /sign-in?error=google_failed', async () => {
    const cases: [string, ReturnType<typeof googleApp>, ((a: request.Agent, s: string) => Promise<request.Response>)?][] = [
      ['token endpoint says 400', googleApp(() => ({ ok: false, status: 400, body: { error: 'invalid_grant' } }))],
      ['token endpoint 500', googleApp(() => ({ ok: false, status: 500, body: 'boom' }))],
      ['not json', googleApp(() => ({ body: 'not json at all' }))],
      ['no id_token', googleApp(() => ({ body: { access_token: 'x' } }))],
      ['id_token not a jwt', googleApp(() => ({ body: { id_token: 'abc' } }))],
      ['user denied', googleApp(() => ({ body: {} })), (a, s) => a.get('/api/auth/google/callback').query({ error: 'access_denied', state: s }).redirects(0)],
      ['no code', googleApp(() => ({ body: {} })), (a, s) => callback(a, s, '')],
    ];
    for (const [name, g, run] of cases) {
      const a = request.agent(g.app);
      const s = stateOf(await start(a));
      const r = await (run ? run(a, s) : callback(a, s));
      expect([name, r.status, r.headers.location]).toEqual([name, 302, FAIL]);
      expect(String(r.headers['set-cookie'] ?? '')).not.toMatch(/jp_session=[^;]+;/);
    }
  });

  it('checks the id_token: unverified Google email, wrong audience, wrong issuer, expired, missing claims', async () => {
    const claimCases: [string, Record<string, unknown>][] = [
      ['email not verified', { email_verified: false }],
      ['email_verified missing', { email_verified: undefined }],
      ['wrong audience', { aud: 'someone-elses-client-id' }],
      ['wrong issuer', { iss: 'https://evil.example.com' }],
      ['expired', { exp: Math.floor(clock.getTime() / 1000) - 1 }],
      ['no exp', { exp: undefined }],
      ['no email', { email: undefined }],
      ['no sub', { sub: undefined }],
    ];
    for (const [name, over] of claimCases) {
      const g = withClaims(goodClaims({ email: 'g.checks@example.com', sub: 'google-sub-checks', ...over }));
      const { a, res } = await fullFlow(g);
      expect([name, res.headers.location]).toEqual([name, FAIL]);
      expect((await a.get('/api/me')).status).toBe(401);
    }
    expect(await prisma.user.count({ where: { email: 'g.checks@example.com' } })).toBe(0);
    // the bare issuer form and an audience list are accepted
    const ok = withClaims(goodClaims({ iss: 'accounts.google.com', aud: [CID, 'other'], email: 'g.ok@example.com', sub: 'google-sub-ok', email_verified: 'true' }));
    expect((await fullFlow(ok)).res.headers.location).toContain('/auth/callback');
  });

  it('a suspended person is refused', async () => {
    const { email } = await makeUser({ status: 'SUSPENDED', googleId: 'google-sub-suspended' });
    const { res } = await fullFlow(withClaims(goodClaims({ email, sub: 'google-sub-suspended' })));
    expect(res.headers.location).toBe(FAIL);
  });

  it('the state cookie is cleared after use, so a callback cannot be replayed', async () => {
    const g = withClaims(goodClaims({ email: 'g.replay@example.com', sub: 'google-sub-replay' }));
    const a = request.agent(g.app);
    const state = stateOf(await start(a));
    expect((await callback(a, state)).headers.location).toContain('/auth/callback');
    expect((await callback(a, state)).headers.location).toBe(FAIL);
    expect(g.calls).toHaveLength(1);
  });
});

describe('setup (onboarding)', () => {
  const patch = (a: request.Agent, body: Record<string, unknown>) => a.patch('/api/me/onboarding').send(body);
  const category = (countryCode: string, slug: string) => prisma.category.findFirstOrThrow({ where: { countryCode, slug } });

  it('needs a session', async () => {
    expect((await request(app).patch('/api/me/onboarding').send({ countryCode: 'RW' })).status).toBe(401);
  });

  it('walks country -> category -> goal -> done, and nextStep always says what comes next', async () => {
    const { agent } = await signUp(nextEmail());
    const step = async () => (await agent.get('/api/me')).body.user.onboarding;
    expect(await step()).toEqual({ done: false, nextStep: 'country' });

    const country = await patch(agent, { countryCode: 'rw' });
    expect(country.status).toBe(200);
    expect(country.body.user).toMatchObject({ countryCode: 'RW', goalCategoryId: null, onboarding: { done: false, nextStep: 'category' } });

    const teaching = await category('RW', 'teaching-positions');
    const goal = await patch(agent, { goalCategoryId: teaching.id });
    expect(goal.body.user).toMatchObject({ goalCategoryId: teaching.id, onboarding: { done: false, nextStep: 'goal' } });

    const detail = await patch(agent, { level: 'Secondary (S1–S3)', subject: 'Mathematics', examDate: '2026-12-15' });
    expect(detail.body.user).toMatchObject({ level: 'Secondary (S1–S3)', subject: 'Mathematics', examDate: '2026-12-15', onboarding: { done: true, nextStep: null } });

    const fin = await patch(agent, { finish: true });
    expect(fin.status).toBe(200);
    expect(fin.body.user.onboarding).toEqual({ done: true, nextStep: null });
    const row = await prisma.user.findFirstOrThrow({ where: { id: fin.body.user.id } });
    expect(row.onboardedAt).toEqual(clock);
    expect(row.countryConfirmedAt).toEqual(clock);
    expect((await agent.get('/api/me')).body.user.examDate).toBe('2026-12-15');
  });

  it('one request may carry several steps, and "finish" with the details in the same call works', async () => {
    const { agent } = await signUp(nextEmail());
    const teaching = await category('RW', 'teaching-positions');
    const res = await patch(agent, { countryCode: 'RW', goalCategoryId: teaching.id, level: 'TVET', subject: 'ICT', finish: true });
    expect(res.body.user).toMatchObject({ countryCode: 'RW', goalCategoryId: teaching.id, level: 'TVET', subject: 'ICT', onboarding: { done: true, nextStep: null } });
  });

  it('country must be a LIVE country: not-live and unknown ones are 400 country_not_available and change nothing', async () => {
    const { agent } = await signUp(nextEmail());
    for (const code of ['KE', 'UG', 'ZZ']) {
      const r = await patch(agent, { countryCode: code });
      expect([r.status, r.body.error], code).toEqual([400, 'country_not_available']);
    }
    expect((await agent.get('/api/me')).body.user).toMatchObject({ countryCode: 'RW', onboarding: { nextStep: 'country' } });
    expect((await patch(agent, { countryCode: 'R' })).status).toBe(400);
  });

  it('the job goal must belong to the person\'s country (400 invalid_goal); it can be cleared with null', async () => {
    const { agent } = await signUp(nextEmail());
    await patch(agent, { countryCode: 'RW' });
    const ke = await category('KE', 'teaching-positions');
    const bad = await patch(agent, { goalCategoryId: ke.id });
    expect([bad.status, bad.body.error]).toEqual([400, 'invalid_goal']);
    expect((await patch(agent, { goalCategoryId: 'nope' })).body.error).toBe('invalid_goal');
    const rw = await category('RW', 'procurement');
    expect((await patch(agent, { goalCategoryId: rw.id })).body.user.goalCategoryId).toBe(rw.id);
    const cleared = await patch(agent, { goalCategoryId: null });
    expect(cleared.body.user).toMatchObject({ goalCategoryId: null, onboarding: { nextStep: 'category' } });
  });

  it('skip finishes setup WITHOUT level, subject or exam date; finish/skip before a country and goal are chosen is 409', async () => {
    const { agent } = await signUp(nextEmail());
    expect((await patch(agent, { finish: true })).body.error).toBe('onboarding_incomplete');
    await patch(agent, { countryCode: 'RW' });
    expect((await patch(agent, { skip: true })).body.error).toBe('onboarding_incomplete');
    const teaching = await category('RW', 'teaching-positions');
    const res = await patch(agent, { goalCategoryId: teaching.id, level: 'Primary', subject: 'English', examDate: '2027-01-01', skip: true });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ level: null, subject: null, examDate: null, goalCategoryId: teaching.id, onboarding: { done: true, nextStep: null } });
    expect((await prisma.user.findFirstOrThrow({ where: { id: res.body.user.id } })).onboardedAt).not.toBeNull();
  });

  it('validates level, subject and exam date; null clears them', async () => {
    const { agent } = await signUp(nextEmail());
    for (const body of [{ level: 'x'.repeat(81) }, { subject: 'x'.repeat(201) }, { level: '' }, { examDate: '2026-02-30' }, { examDate: '15/12/2026' }, { examDate: 'tomorrow' }, { finish: 'yes' }]) {
      const r = await patch(agent, body);
      expect([r.status, r.body.error], JSON.stringify(body)).toEqual([400, 'validation_error']);
    }
    expect((await patch(agent, { level: 'x'.repeat(80) })).status).toBe(200);
    // longer than a single subject, short enough for several joined by ", " (the setup page lets more than one be picked)
    expect((await patch(agent, { subject: 'Mathematics, Chemistry, Biology' })).status).toBe(200);
    await patch(agent, { subject: 'Biology', examDate: '2026-12-01' });
    const cleared = await patch(agent, { level: null, subject: null, examDate: null });
    expect(cleared.body.user).toMatchObject({ level: null, subject: null, examDate: null });
    // the date is a plain calendar date: no time zone drift
    expect((await patch(agent, { examDate: '2026-12-31' })).body.user.examDate).toBe('2026-12-31');
  });

  it('changing country CLEARS the job goal, level and subject (and confirms the country); choosing the same country clears nothing', async () => {
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const { agent } = await signUp(nextEmail());
      const teaching = await category('RW', 'teaching-positions');
      await patch(agent, { countryCode: 'RW', goalCategoryId: teaching.id, level: 'Primary', subject: 'English', examDate: '2026-12-15', finish: true });

      const same = await patch(agent, { countryCode: 'RW' });
      expect(same.body.user).toMatchObject({ countryCode: 'RW', goalCategoryId: teaching.id, level: 'Primary', subject: 'English' });

      const changed = await patch(agent, { countryCode: 'KE' });
      expect(changed.status).toBe(200);
      expect(changed.body.user).toMatchObject({
        countryCode: 'KE', goalCategoryId: null, level: null, subject: null, language: 'en',
        onboarding: { done: false, nextStep: 'category' }, // "you'll choose one for Kenya next"
      });
      // Rwanda's category no longer fits; Kenya's does
      expect((await patch(agent, { goalCategoryId: teaching.id })).body.error).toBe('invalid_goal');
      const keTeaching = await category('KE', 'teaching-positions');
      // setup runs again for the new country: category (done above), then level and subject
      expect((await patch(agent, { goalCategoryId: keTeaching.id })).body.user.onboarding).toEqual({ done: false, nextStep: 'goal' });
      expect((await patch(agent, { skip: true })).body.user.onboarding).toEqual({ done: true, nextStep: null });
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });

  it('"Switch my account to Kenya" (POST /api/me/country) shares the same rules', async () => {
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const { agent } = await signUp(nextEmail());
      const teaching = await category('RW', 'teaching-positions');
      await patch(agent, { countryCode: 'RW', goalCategoryId: teaching.id, level: 'TVET', subject: 'ICT', finish: true });
      const res = await agent.post('/api/me/country').send({ countryCode: 'KE', confirm: true });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ countryCode: 'KE', goalCategoryId: null, level: null, subject: null, onboarding: { done: false, nextStep: 'category' } });
      const back = await agent.post('/api/me/country').send({ countryCode: 'RW', confirm: true });
      expect(back.body.user).toMatchObject({ countryCode: 'RW', goalCategoryId: null });
      expect((await prisma.user.findFirstOrThrow({ where: { id: res.body.user.id } })).countryConfirmedAt).not.toBeNull();
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });

  it('existing accounts are not forced through setup: a person with onboardedAt and no goal is not asked for one', async () => {
    const { email } = await makeUser();
    const res = await signInRaw(request.agent(app), email);
    expect(res.body.user).toMatchObject({ goalCategoryId: null, onboarding: { done: true, nextStep: null } });
  });

  it('the seeded admins are done', async () => {
    const res = await signInRaw(request.agent(app), 'system.admin@jobprep.test', 'Password123!');
    expect(res.body.user.onboarding).toEqual({ done: true, nextStep: null });
    expect(res.body.user.emailVerified).toBe(true);
  });

  it('the user object carries exactly the documented fields', async () => {
    const { agent } = await signUp(nextEmail());
    const me = (await agent.get('/api/me')).body.user;
    expect(Object.keys(me).sort()).toEqual([
      'countryCode', 'email', 'emailVerified', 'examDate', 'goalCategoryId', 'id', 'language', 'level', 'name', 'onboarding', 'preferredExamId', 'roles', 'subject',
    ]);
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
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW', code: 'FULL_ACCESS' } });
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
    expect([first.status, again.status]).toEqual([201, 200]); // a repeat is "already on the list", not an error
    expect([first.body.alreadyOnList, again.body.alreadyOnList]).toEqual([false, true]);
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
  it('exposes the verification code and reset token only when test endpoints are enabled', async () => {
    const email = nextEmail();
    await signUpRaw(request.agent(app), email);
    const res = await request(app).get('/api/test/otp').query({ email: email.toUpperCase() });
    expect(res.body).toEqual({ email, code: mail.lastCode(email) });
    expect(res.body.code).toMatch(/^\d{6}$/);
    expect((await request(app).get('/api/test/otp').query({ email: nextEmail() })).status).toBe(404);

    await forgot(email);
    const tok = await request(app).get('/api/test/reset-token').query({ email: email.toUpperCase() });
    expect(tok.body).toEqual({ email, token: mail.lastResetToken(email) });
    expect(tok.body.token).toMatch(/^[\w-]{43}$/);
    expect((await request(app).get('/api/test/reset-token').query({ email: nextEmail() })).status).toBe(404);
    // the code endpoint still returns the verification code, not a number from a reset link
    expect((await request(app).get('/api/test/otp').query({ email })).body.code).toBe(res.body.code);

    const off = createApp({ prisma, config: testConfig({ ENABLE_TEST_ENDPOINTS: 'false' }), email: mail });
    expect((await request(off).get('/api/test/otp').query({ email })).status).toBe(404);
    expect((await request(off).get('/api/test/reset-token').query({ email })).status).toBe(404);
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
    const res = await request(app).post('/api/auth/sign-in').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_json');
  });
});
