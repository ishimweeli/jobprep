import { describe, expect, it } from 'vitest';
import { decide, formatAlert, REMIND_MS, runCheck, runChecks, type CheckResult, type State } from '../../prisma/monitor/uptime';

const BASE = 'https://jobprep.example';
const now = new Date('2026-11-09T10:00:00Z');
const noSleep = async () => {};
const res = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

/** A fake site: each path answers from `routes` (a Response, or a function that may throw). */
function site(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(url);
    const path = new URL(url).pathname;
    const handler = routes[path];
    if (!handler) return res(404, 'not found');
    return handler();
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}
const healthy = {
  '/rw': () => res(200, '<html><body><div id="root"></div></body></html>'),
  '/api/health': () => res(200, { status: 'ok', db: 'up' }),
  '/api/countries/rw/jobs': () => res(200, { total: 3, results: [{ jobName: 'Primary Teacher' }] }),
};
const check = (over: Partial<CheckResult>): CheckResult => ({ name: 'search', ok: false, detail: 'HTTP 500', ms: 10, url: `${BASE}/x`, tries: 3, ...over });

describe('probing the site', () => {
  it('passes when the page, the health check and the search all answer well', async () => {
    const { fetchFn, calls } = site(healthy);
    const results = await runChecks(BASE, 'teacher', { fetchFn, sleep: noSleep });
    expect(results.map((r) => [r.name, r.ok])).toEqual([['site', true], ['api', true], ['search', true]]);
    expect(calls.find((c) => c.includes('/jobs'))).toContain('q=teacher');
    expect(results.every((r) => r.tries === 1)).toBe(true);
  });

  it('fails the website when the app is missing from the page or the server errors', async () => {
    const empty = await runCheck('site', BASE, 'x', { fetchFn: site({ '/rw': () => res(200, '<html>maintenance</html>') }).fetchFn, sleep: noSleep });
    expect(empty).toMatchObject({ ok: false, detail: 'the page loaded but the app is missing from it' });
    const down = await runCheck('site', BASE, 'x', { fetchFn: site({ '/rw': () => res(502, 'bad gateway') }).fetchFn, sleep: noSleep });
    expect(down).toMatchObject({ ok: false, detail: 'HTTP 502', tries: 3 });
  });

  it('says when the database is down, and when the API does not answer at all', async () => {
    const db = await runCheck('api', BASE, 'x', { fetchFn: site({ '/api/health': () => res(503, { status: 'degraded', db: 'down' }) }).fetchFn, sleep: noSleep });
    expect(db.detail).toBe('HTTP 503 (the database is down)');
    const gone = await runCheck('api', BASE, 'x', { fetchFn: (async () => { throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }); }) as unknown as typeof fetch, sleep: noSleep });
    expect(gone).toMatchObject({ ok: false, detail: 'could not connect: ECONNREFUSED' });
    const slow = await runCheck('api', BASE, 'x', { fetchFn: (async () => { throw new DOMException('timed out', 'TimeoutError'); }) as unknown as typeof fetch, sleep: noSleep, tries: 1 });
    expect(slow.detail).toBe('no answer within 15 seconds');
  });

  it('fails search when it errors or finds nothing for a word that always has jobs', async () => {
    const none = await runCheck('search', BASE, 'teacher', { fetchFn: site({ '/api/countries/rw/jobs': () => res(200, { total: 0, results: [] }) }).fetchFn, sleep: noSleep });
    expect(none).toMatchObject({ ok: false, detail: 'searching for "teacher" found no jobs' });
    const broken = await runCheck('search', BASE, 'teacher', { fetchFn: site({ '/api/countries/rw/jobs': () => res(500, { error: 'internal_error' }) }).fetchFn, sleep: noSleep });
    expect(broken.detail).toBe('HTTP 500');
  });

  it('retries, so a blip during a deploy is not an outage', async () => {
    let n = 0;
    const slept: number[] = [];
    const { fetchFn } = site({ '/api/health': () => (++n < 3 ? res(502, 'bad gateway') : res(200, { status: 'ok', db: 'up' })) });
    const r = await runCheck('api', BASE, 'x', { fetchFn, sleep: async (ms) => { slept.push(ms); }, gapMs: 20_000 });
    expect(r).toMatchObject({ ok: true, tries: 3 });
    expect(slept).toEqual([20_000, 20_000]);
  });
});

describe('deciding what to email', () => {
  const ok = (name: CheckResult['name']) => check({ name, ok: true, detail: 'ok (50 ms)' });

  it('says nothing while everything works', () => {
    const d = decide({}, [ok('site'), ok('api'), ok('search')], now);
    expect(d).toMatchObject({ down: [], reminders: [], recovered: [], next: {} });
    expect(formatAlert(d, [ok('site')], BASE, now)).toBeNull();
  });

  it('emails once when something breaks, and not again on the next runs', () => {
    const first = decide({}, [ok('site'), ok('api'), check({})], now);
    expect(first.down.map((r) => r.name)).toEqual(['search']);
    const later = new Date(now.getTime() + 10 * 60_000);
    const second = decide(first.next, [ok('site'), ok('api'), check({})], later);
    expect(second.down).toEqual([]);
    expect(second.reminders).toEqual([]);
    expect(second.next).toEqual(first.next); // still remembered as reported at the first time
  });

  it('reminds after three hours, then waits another three', () => {
    const first = decide({}, [check({})], now);
    const at3h = new Date(now.getTime() + REMIND_MS);
    const reminder = decide(first.next, [check({})], at3h);
    expect(reminder.reminders.map((r) => r.name)).toEqual(['search']);
    expect(reminder.next.search).toEqual({ since: now.toISOString(), lastAlertAt: at3h.toISOString() });
    expect(decide(reminder.next, [check({})], new Date(at3h.getTime() + 60 * 60_000)).reminders).toEqual([]);
  });

  it('tells you when it works again, and forgets it', () => {
    const prev: State = { search: { since: '2026-11-09T09:00:00Z', lastAlertAt: '2026-11-09T09:00:00Z' } };
    const d = decide(prev, [ok('site'), ok('api'), ok('search')], now);
    expect(d.recovered).toEqual([{ name: 'search', since: '2026-11-09T09:00:00Z' }]);
    expect(d.next).toEqual({});
    const mail = formatAlert(d, [ok('site'), ok('api'), ok('search')], BASE, now)!;
    expect(mail.subject).toBe('JobPrep recovered: search working again');
    expect(mail.text).toContain('Search: was down for about 60 minutes');
  });
});

describe('the alert email', () => {
  it('names what failed, why, how often it was tried and where to look', () => {
    const failing = check({ name: 'search', detail: 'searching for "teacher" found no jobs', url: `${BASE}/api/countries/rw/jobs?q=teacher` });
    const all = [check({ name: 'site', ok: true, detail: 'ok (80 ms)' }), check({ name: 'api', ok: true, detail: 'ok (30 ms)' }), failing];
    const mail = formatAlert(decide({}, all, now), all, BASE, now)!;
    expect(mail.subject).toBe('JobPrep ALERT: search not working');
    expect(mail.text).toContain('Something is wrong. Open the site and look now.');
    expect(mail.text).toContain('PROBLEM: Search');
    expect(mail.text).toContain('searching for "teacher" found no jobs');
    expect(mail.text).toContain('Tried 3 times');
    expect(mail.text).toContain('OK   The website: ok (80 ms)');
    expect(mail.text).toContain('FAIL Search');
    expect(mail.text).toContain('12:00 Kigali time');
    expect(mail.text).toContain('docker logs jobprep-1');
  });

  it('names several problems at once, and a reminder says it is still failing', () => {
    const all = [check({ name: 'site', detail: 'HTTP 502' }), check({ name: 'api', detail: 'HTTP 502' }), check({ name: 'search', detail: 'HTTP 502' })];
    expect(formatAlert(decide({}, all, now), all, BASE, now)!.subject).toBe('JobPrep ALERT: the app is down');
    const two = [check({ name: 'site', detail: 'HTTP 502' }), check({ name: 'api', detail: 'HTTP 502' }), { ...check({ name: 'search' }), ok: true, detail: 'ok' }];
    expect(formatAlert(decide({}, two, now), two, BASE, now)!.subject).toBe('JobPrep ALERT: the website and the api and database not working');
    const prev: State = { site: { since: '2026-11-09T05:00:00Z', lastAlertAt: '2026-11-09T05:00:00Z' } };
    const one = [check({ name: 'site', detail: 'HTTP 502' })];
    const mail = formatAlert(decide(prev, one, now), one, BASE, now)!;
    expect(mail.subject).toBe('JobPrep ALERT: the website still not working');
    expect(mail.text).toContain('Still not fixed.');
  });

  it('a test email is sent even when everything works', () => {
    const all = [check({ name: 'site', ok: true, detail: 'ok (80 ms)' })];
    const mail = formatAlert(decide({}, all, now), all, BASE, now, true)!;
    expect(mail.subject).toBe('JobPrep monitor test: everything works');
    expect(mail.text).toContain('If you can read this, alerts reach you.');
  });
});
