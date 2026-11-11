import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { ConsoleEmailProvider } from '../../src/services/email';
import { ErrorAlerter, routeOf } from '../../src/services/error-alerts';

const quiet = () => {};
const make = (email = new ConsoleEmailProvider(quiet), windowMs = 60_000) =>
  ({ email, alerts: new ErrorAlerter({ email, to: 'owner@example.com', site: 'https://jobprep.example', windowMs, log: quiet }) });
const boom = (n = 1) => ({ where: 'POST /api/payments', status: 500, code: 'internal_error', message: `boom ${n}`, requestId: 'AB12CD34', userId: 'u1' });

afterEach(() => vi.useRealTimers());

describe('ErrorAlerter', () => {
  it('emails the first error at once, with what broke, where, for whom and the reference', async () => {
    const { email, alerts } = make();
    await alerts.record({ ...boom(), stack: 'Error: boom 1\n    at pay (src/services/payments.ts:42:7)' });
    expect(email.sent).toHaveLength(1);
    const m = email.sent[0]!;
    expect(m.to).toBe('owner@example.com');
    expect(m.subject).toBe('JobPrep ERROR: POST /api/payments (500)');
    expect(m.text).toContain('Error: boom 1');
    expect(m.text).toContain('Reference: AB12CD34');
    expect(m.text).toContain('User id: u1');
    expect(m.text).toContain('src/services/payments.ts:42');
  });

  it('collects the next errors into one grouped summary instead of one email each', async () => {
    vi.useFakeTimers();
    const { email, alerts } = make();
    await alerts.record(boom(1));
    for (let i = 0; i < 50; i++) await alerts.record(boom(2));
    await alerts.record({ where: 'GET /api/me', status: 502, code: 'provider_unavailable', message: 'down' });
    expect(email.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(email.sent).toHaveLength(2);
    const s = email.sent[1]!;
    expect(s.subject).toBe('JobPrep ERRORS: 51 more in the last 1 minutes');
    expect(s.text).toContain('50 x POST /api/payments');
    expect(s.text).toContain('GET /api/me  ->  HTTP 502 (provider_unavailable)');
  });

  it('after a quiet window the next error is emailed at once again', async () => {
    vi.useFakeTimers();
    const { email, alerts } = make();
    await alerts.record(boom(1));
    await vi.advanceTimersByTimeAsync(60_000); // nothing more: no summary
    expect(email.sent).toHaveLength(1);
    await alerts.record(boom(3));
    expect(email.sent).toHaveLength(2);
    expect(email.sent[1]!.subject).toMatch(/^JobPrep ERROR:/);
  });

  it('flush sends what is collected (used before a crash exit)', async () => {
    const { email, alerts } = make();
    await alerts.record(boom(1));
    await alerts.record(boom(2));
    await alerts.flush();
    expect(email.sent.map((m) => m.subject)).toEqual(['JobPrep ERROR: POST /api/payments (500)', 'JobPrep ERRORS: 1 more in the last 1 minutes']);
  });

  it('a failing email provider never throws into the request', async () => {
    const alerts = new ErrorAlerter({ email: { send: () => Promise.reject(new Error('smtp down')) }, to: 'x@example.com', site: 's', log: quiet });
    await expect(alerts.record(boom())).resolves.toBeUndefined();
  });

  it('routeOf drops the query string and turns ids into :id', () => {
    expect(routeOf('post', '/api/attempts/cm9x2k3l40000abcdefghijk/answers?token=secret')).toBe('POST /api/attempts/:id/answers');
    expect(routeOf('GET', '/api/countries/rw/jobs?q=teacher')).toBe('GET /api/countries/rw/jobs');
  });
});

describe('the API emails when a request fails', () => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://x/y_test', SESSION_SECRET: 'test-secret-test-secret' });
  // A database that throws on every call: any endpoint that touches it fails with a 500.
  const broken = new Proxy({}, { get: () => new Proxy(() => {}, { get: () => () => Promise.reject(new Error('database exploded')), apply: () => Promise.reject(new Error('database exploded')) }) }) as unknown as PrismaClient;

  it('a 500 emails the owner; the user still gets the normal error with its reference', async () => {
    const { email, alerts } = make();
    const app = createApp({ prisma: broken, config, alerts });
    const res = await request(app).get('/api/countries?x=1');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
    await vi.waitFor(() => expect(email.sent).toHaveLength(1));
    expect(email.sent[0]!.subject).toBe('JobPrep ERROR: GET /api/countries (500)');
    expect(email.sent[0]!.text).toContain('database exploded');
    expect(email.sent[0]!.text).toContain(`Reference: ${res.body.requestId}`);
  });

  it('a 4xx (the user did something wrong) sends nothing', async () => {
    const { email, alerts } = make();
    const app = createApp({ prisma: broken, config, alerts });
    expect((await request(app).get('/api/nothing-here')).status).toBe(404);
    expect(email.sent).toHaveLength(0);
  });
});

describe('ERROR_ALERT_TO', () => {
  const base = { DATABASE_URL: 'postgresql://x/y', SESSION_SECRET: 'test-secret-test-secret' };
  it('is off outside production unless set', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'development' }).ERROR_ALERT_TO).toBe('');
    expect(loadConfig({ ...base, NODE_ENV: 'development', ERROR_ALERT_TO: 'a@b.c' }).ERROR_ALERT_TO).toBe('a@b.c');
    expect(loadConfig({ ...base, NODE_ENV: 'development', ERROR_ALERT_TO: 'off' }).ERROR_ALERT_TO).toBe('');
  });
});
