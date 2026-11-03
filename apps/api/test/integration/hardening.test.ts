import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { ConsoleEmailProvider } from '../../src/services/email';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const limited = createApp({ prisma, config: testConfig({ RATE_LIMIT_ENABLED: 'true' }), email: mail });
const unlimited = createApp({ prisma, config: testConfig({ RATE_LIMIT_ENABLED: 'false' }), email: mail });

beforeAll(() => resetAndSeed(prisma));
afterAll(() => prisma.$disconnect());

/** Each call looks like a different client IP, so one test's traffic never counts against another's. */
let ipSeq = 1;
const ip = () => `10.9.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}`;
let emailSeq = 700000;
const email = () => `rate${emailSeq++}@example.com`;

describe('per-IP rate limits', () => {
  it('login-code requests: 10 a minute per IP, then 429 with Retry-After', async () => {
    const client = ip();
    const results: number[] = [];
    let last: request.Response | null = null;
    for (let i = 0; i < 12; i++) {
      last = await request(limited).post('/api/auth/otp/request').set('X-Forwarded-For', client).send({ purpose: 'sign_up', countryCode: 'RW', email: email() });
      results.push(last.status);
    }
    expect(results.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(results.slice(10)).toEqual([429, 429]);
    expect(last!.body.error).toBe('rate_limited');
    expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
    // another IP is unaffected
    const other = await request(limited).post('/api/auth/otp/request').set('X-Forwarded-For', ip()).send({ purpose: 'sign_up', countryCode: 'RW', email: email() });
    expect(other.status).toBe(200);
  });

  it('guessing codes at sign-in is limited too (20 a minute per IP)', async () => {
    const client = ip();
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      statuses.push((await request(limited).post('/api/auth/sign-in').set('X-Forwarded-For', client).send({ email: email(), code: '123456' })).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 400)).toBe(true); // invalid code
    expect(statuses.slice(20)).toEqual([429, 429]);
  });

  it('creating payments is limited (10 a minute), so a stuck client cannot spam payers with prompts', async () => {
    const client = ip();
    const p = email();
    const msisdn = '+250788710001';
    // Sign up from this IP too (uses one login-code request and one verify).
    const agent = request.agent(limited);
    await agent.post('/api/auth/otp/request').set('X-Forwarded-For', client).send({ purpose: 'sign_up', countryCode: 'RW', email: p });
    await agent.post('/api/auth/sign-up').set('X-Forwarded-For', client).send({ countryCode: 'RW', email: p, name: 'Rate Test', code: mail.lastCode(p) });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await agent.post('/api/payments').set('X-Forwarded-For', client).send({ provider: 'AIRTEL_MONEY', msisdn })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201 || s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // and only one real request was ever sent to the payer (double-taps reuse the pending one)
    const user = await prisma.user.findUniqueOrThrow({ where: { email: p } });
    expect(await prisma.payment.count({ where: { userId: user.id } })).toBe(1);
  });

  it('"Request this exam" and the waiting list are limited to 10 an hour per IP', async () => {
    const client = ip();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await request(limited).post('/api/countries/RW/exam-requests').set('X-Forwarded-For', client).send({ query: `Exam number ${i}` })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // the counter is shared by both endpoints
    expect((await request(limited).post('/api/countries/KE/waiting-list').set('X-Forwarded-For', client).send({ email: 'waiting@example.com' })).status).toBe(429);
  });

  it('starting attempts is limited (30 a minute per IP)', async () => {
    const client = ip();
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) {
      statuses.push((await request(limited).post('/api/countries/RW/mock-tests/secondary-mathematics-teacher-s1-s3-mock-1/attempts').set('X-Forwarded-For', client).send({})).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(30)).toEqual([429, 429]);
  });

  it('normal browsing is not limited', async () => {
    const client = ip();
    for (let i = 0; i < 60; i++) {
      expect((await request(limited).get('/api/countries/RW/landing').set('X-Forwarded-For', client)).status).toBe(200);
    }
  });

  it('is off when disabled (development default)', async () => {
    const client = ip();
    for (let i = 0; i < 14; i++) {
      const r = await request(unlimited).post('/api/auth/otp/request').set('X-Forwarded-For', client).send({ purpose: 'sign_up', countryCode: 'RW', email: email() });
      expect(r.status).toBe(200);
    }
  });

  it('the per-address limits still protect one email address even from many IPs', async () => {
    const p = email();
    const first = await request(unlimited).post('/api/auth/otp/request').set('X-Forwarded-For', ip()).send({ purpose: 'sign_up', countryCode: 'RW', email: p });
    const second = await request(unlimited).post('/api/auth/otp/request').set('X-Forwarded-For', ip()).send({ purpose: 'sign_up', countryCode: 'RW', email: p });
    expect([first.status, second.status]).toEqual([200, 429]);
    expect(second.body.error).toBe('otp_cooldown');
    await signedInAgent(unlimited, mail, email()); // helper still works with limits off
  });
});

describe('rate limits default', () => {
  const env = { DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'x'.repeat(20) };
  it('are off in development and on in production, and can be forced either way', () => {
    expect(loadConfig({ ...env, NODE_ENV: 'development' }).RATE_LIMIT_ENABLED).toBe(false);
    expect(loadConfig({ ...env, NODE_ENV: 'development', RATE_LIMIT_ENABLED: 'true' }).RATE_LIMIT_ENABLED).toBe(true);
    expect(loadConfig({ ...env, NODE_ENV: 'test' }).RATE_LIMIT_ENABLED).toBe(false);
  });
});

describe('production configuration is checked at start-up', () => {
  const safe = {
    DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'r4nd0m-'.repeat(6), NODE_ENV: 'production', PAYMENT_PROVIDER_MODE: 'live',
    EMAIL_PROVIDER: 'smtp', MAIL_HOST: 'smtp.example.test', MAIL_USERNAME: 'noreply@jobprep.test', MAIL_PASSWORD: 'mail-secret', MAIL_FROM_ADDRESS: 'noreply@jobprep.test',
    PUBLIC_API_URL: 'https://api.jobprep.test', WEB_ORIGIN: 'https://jobprep.test',
    PAWAPAY_API_TOKEN: 'pawapay-test-token', PAWAPAY_CALLBACK_SECRET: 'a'.repeat(20),
  };

  it('accepts a safe configuration, with rate limits on and test endpoints forced off', () => {
    const c = loadConfig({ ...safe, ENABLE_TEST_ENDPOINTS: 'true' });
    expect(c.RATE_LIMIT_ENABLED).toBe(true);
    expect(c.ENABLE_TEST_ENDPOINTS).toBe(false);
  });

  it.each([
    ['a short session secret', { SESSION_SECRET: 'short-secret-short-secret-123' }, /SESSION_SECRET/],
    ['a placeholder session secret', { SESSION_SECRET: 'change-me-to-a-long-random-string-please' }, /SESSION_SECRET/],
    ['an http API URL', { PUBLIC_API_URL: 'http://api.jobprep.test' }, /PUBLIC_API_URL/],
    ['an http web origin', { WEB_ORIGIN: 'http://jobprep.test' }, /WEB_ORIGIN/],
    ['a missing pawaPay callback secret', { PAWAPAY_CALLBACK_SECRET: '' }, /PAWAPAY_CALLBACK_SECRET/],
    ['a short pawaPay callback secret', { PAWAPAY_CALLBACK_SECRET: 'tooshort' }, /PAWAPAY_CALLBACK_SECRET/],
    ['a missing pawaPay API token', { PAWAPAY_API_TOKEN: '' }, /PAWAPAY_API_TOKEN/],
    ['the fake payment provider', { PAYMENT_PROVIDER_MODE: 'fake' }, /fake/],
    ['the console email provider', { EMAIL_PROVIDER: 'console' }, /EMAIL_PROVIDER=console/],
    ['a missing SMTP host', { MAIL_HOST: '' }, /MAIL_HOST/],
    ['a missing SMTP username', { MAIL_USERNAME: '' }, /MAIL_USERNAME/],
    ['a missing SMTP password', { MAIL_PASSWORD: '' }, /MAIL_PASSWORD/],
    ['a missing From address', { MAIL_FROM_ADDRESS: '' }, /MAIL_FROM_ADDRESS/],
  ])('refuses %s', (_name, override, message) => {
    expect(() => loadConfig({ ...safe, ...override })).toThrow(message);
  });

  it('lists every problem at once so they can be fixed in one go', () => {
    // 20 characters passes the base 16-character rule but fails the production 32-character rule
    const bad = { ...safe, SESSION_SECRET: 'a'.repeat(20), PUBLIC_API_URL: 'http://x.test', PAWAPAY_CALLBACK_SECRET: '' };
    expect(() => loadConfig(bad))
      .toThrow(/SESSION_SECRET.*PUBLIC_API_URL.*PAWAPAY_CALLBACK_SECRET/s);
  });

  it('the mail settings are only checked when the smtp provider is chosen, and have sensible defaults', () => {
    const c = loadConfig({ DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'x'.repeat(20), NODE_ENV: 'development' });
    expect(c).toMatchObject({ EMAIL_PROVIDER: 'console', MAIL_PORT: 465, MAIL_STARTTLS: false, MAIL_FROM_NAME: 'JobPrep' });
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'x'.repeat(20), NODE_ENV: 'development', EMAIL_PROVIDER: 'smtp' })).not.toThrow(); // dev may leave it blank
    expect(() => loadConfig({ ...safe, EMAIL_PROVIDER: 'carrier-pigeon' })).toThrow();
  });

  it('lists every missing mail setting at once', () => {
    expect(() => loadConfig({ ...safe, MAIL_HOST: '', MAIL_USERNAME: '', MAIL_PASSWORD: '', MAIL_FROM_ADDRESS: '' }))
      .toThrow(/MAIL_HOST.*MAIL_USERNAME.*MAIL_PASSWORD.*MAIL_FROM_ADDRESS/s);
  });

  it('the same values are fine outside production', () => {
    expect(() => loadConfig({ ...safe, NODE_ENV: 'development', PAYMENT_PROVIDER_MODE: 'fake', EMAIL_PROVIDER: 'console', SESSION_SECRET: 'x'.repeat(20), PUBLIC_API_URL: 'http://localhost:4000' })).not.toThrow();
  });
});
