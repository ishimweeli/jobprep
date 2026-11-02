import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { ConsoleSmsProvider } from '../../src/services/sms';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const sms = new ConsoleSmsProvider(() => {});
const limited = createApp({ prisma, config: testConfig({ RATE_LIMIT_ENABLED: 'true' }), sms });
const unlimited = createApp({ prisma, config: testConfig({ RATE_LIMIT_ENABLED: 'false' }), sms });

beforeAll(() => resetAndSeed(prisma));
afterAll(() => prisma.$disconnect());

/** Each call looks like a different client IP, so one test's traffic never counts against another's. */
let ipSeq = 1;
const ip = () => `10.9.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}`;
let phoneSeq = 700000;
const phone = () => `+250788${phoneSeq++}`;

describe('per-IP rate limits', () => {
  it('login-code requests: 10 a minute per IP, then 429 with Retry-After', async () => {
    const client = ip();
    const results: number[] = [];
    let last: request.Response | null = null;
    for (let i = 0; i < 12; i++) {
      last = await request(limited).post('/api/auth/otp/request').set('X-Forwarded-For', client).send({ purpose: 'sign_up', countryCode: 'RW', phone: phone() });
      results.push(last.status);
    }
    expect(results.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(results.slice(10)).toEqual([429, 429]);
    expect(last!.body.error).toBe('rate_limited');
    expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
    // another IP is unaffected
    const other = await request(limited).post('/api/auth/otp/request').set('X-Forwarded-For', ip()).send({ purpose: 'sign_up', countryCode: 'RW', phone: phone() });
    expect(other.status).toBe(200);
  });

  it('guessing codes at sign-in is limited too (20 a minute per IP)', async () => {
    const client = ip();
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      statuses.push((await request(limited).post('/api/auth/sign-in').set('X-Forwarded-For', client).send({ phone: phone(), code: '123456' })).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 400)).toBe(true); // invalid code
    expect(statuses.slice(20)).toEqual([429, 429]);
  });

  it('creating payments is limited (10 a minute), so a stuck client cannot spam payers with prompts', async () => {
    const client = ip();
    const p = phone();
    // Sign up from this IP too (uses one login-code request and one verify).
    const agent = request.agent(limited);
    await agent.post('/api/auth/otp/request').set('X-Forwarded-For', client).send({ purpose: 'sign_up', countryCode: 'RW', phone: p });
    await agent.post('/api/auth/sign-up').set('X-Forwarded-For', client).send({ countryCode: 'RW', phone: p, name: 'Rate Test', code: sms.lastCode(p) });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await agent.post('/api/payments').set('X-Forwarded-For', client).send({ provider: 'AIRTEL_MONEY', msisdn: p })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201 || s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // and only one real request was ever sent to the payer (double-taps reuse the pending one)
    const user = await prisma.user.findUniqueOrThrow({ where: { phone: p } });
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
    expect((await request(limited).post('/api/countries/KE/waiting-list').set('X-Forwarded-For', client).send({ phone: '0712345678' })).status).toBe(429);
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
      const r = await request(unlimited).post('/api/auth/otp/request').set('X-Forwarded-For', client).send({ purpose: 'sign_up', countryCode: 'RW', phone: phone() });
      expect(r.status).toBe(200);
    }
  });

  it('the per-phone limits still protect one number even from many IPs', async () => {
    const p = phone();
    const first = await request(unlimited).post('/api/auth/otp/request').set('X-Forwarded-For', ip()).send({ purpose: 'sign_up', countryCode: 'RW', phone: p });
    const second = await request(unlimited).post('/api/auth/otp/request').set('X-Forwarded-For', ip()).send({ purpose: 'sign_up', countryCode: 'RW', phone: p });
    expect([first.status, second.status]).toEqual([200, 429]);
    expect(second.body.error).toBe('otp_cooldown');
    await signedInAgent(unlimited, sms, phone()); // helper still works with limits off
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
    DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'r4nd0m-'.repeat(6), NODE_ENV: 'production', PAYMENT_PROVIDER_MODE: 'live', SMS_PROVIDER: 'live',
    PUBLIC_API_URL: 'https://api.jobprep.test', WEB_ORIGIN: 'https://jobprep.test',
    MTN_MOMO_CALLBACK_SECRET: 'a'.repeat(20), AIRTEL_CALLBACK_SECRET: 'b'.repeat(20), MPESA_CALLBACK_SECRET: 'c'.repeat(20),
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
    ['a missing MTN callback secret', { MTN_MOMO_CALLBACK_SECRET: '' }, /MTN_MOMO_CALLBACK_SECRET/],
    ['a missing Airtel callback secret', { AIRTEL_CALLBACK_SECRET: 'tooshort' }, /AIRTEL_CALLBACK_SECRET/],
    ['a missing M-Pesa callback secret', { MPESA_CALLBACK_SECRET: '' }, /MPESA_CALLBACK_SECRET/],
    ['the fake payment provider', { PAYMENT_PROVIDER_MODE: 'fake' }, /fake/],
    ['the console SMS provider', { SMS_PROVIDER: 'console' }, /console/],
  ])('refuses %s', (_name, override, message) => {
    expect(() => loadConfig({ ...safe, ...override })).toThrow(message);
  });

  it('lists every problem at once so they can be fixed in one go', () => {
    // 20 characters passes the base 16-character rule but fails the production 32-character rule
    const bad = { ...safe, SESSION_SECRET: 'a'.repeat(20), PUBLIC_API_URL: 'http://x.test', MPESA_CALLBACK_SECRET: '' };
    expect(() => loadConfig(bad))
      .toThrow(/SESSION_SECRET.*PUBLIC_API_URL.*MPESA_CALLBACK_SECRET/s);
  });

  it('the same values are fine outside production', () => {
    expect(() => loadConfig({ ...safe, NODE_ENV: 'development', PAYMENT_PROVIDER_MODE: 'fake', SMS_PROVIDER: 'console', SESSION_SECRET: 'x'.repeat(20), PUBLIC_API_URL: 'http://localhost:4000' })).not.toThrow();
  });
});
