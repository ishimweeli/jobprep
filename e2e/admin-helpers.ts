import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page, type Playwright, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Helpers for the admin app specs. The admin app runs on 5174 and proxies /api to the admin API instance on 4001, so
 * every call (admin and candidate) goes through the same origin as the page.
 */
export const BASE = process.env.ADMIN_URL ?? 'http://localhost:5174';
export const ADMINS = { system: '+250788000001', editor: '+250788000002', support: '+250788000003' } as const;
export type Role = keyof typeof ADMINS;

export const isPhone = (info: TestInfo) => info.project.name === 'phone-390';

export const randomPhone = () => `+250789${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;

export async function readOtp(request: APIRequestContext, phone: string): Promise<string> {
  const res = await request.get(`${BASE}/api/test/otp`, { params: { phone } });
  expect(res.ok(), 'GET /api/test/otp (needs ENABLE_TEST_ENDPOINTS=true)').toBeTruthy();
  return ((await res.json()) as { code: string }).code;
}

/** Errors the browser logs by itself for an expected 4xx answer are not app errors. */
export const expected4xx = (e: string) => /status of 4\d\d/.test(e);

export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !expected4xx(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  return { errors, expectClean: () => expect(errors, errors.join('\n')).toEqual([]) };
}

export async function expectNoHorizontalScroll(page: Page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, `page is ${sw}px wide in a ${iw}px viewport`).toBeLessThanOrEqual(iw);
}

export async function expectAccessible(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `axe on ${what}`).toEqual([]);
}

// ───────────────────────── Admin sessions
// An admin gets a sign-in code per phone with a 45 s wait and at most 5 an hour, so the specs share one session per
// role (12 hours) kept in a temp file, and only sign in again when it is gone or no longer valid.

const cacheFile = (role: Role) => path.join(os.tmpdir(), `jobprep-admin-e2e-${role}.json`);

type Cookie = { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None' };

async function sessionIsValid(playwright: Playwright, cookies: Cookie[]): Promise<boolean> {
  const jp = cookies.find((c) => c.name === 'jp_admin');
  if (!jp || jp.expires * 1000 < Date.now() + 60_000) return false;
  const ctx = await playwright.request.newContext({ extraHTTPHeaders: { cookie: `jp_admin=${jp.value}` } });
  try {
    return (await ctx.get(`${BASE}/api/admin/auth/me`)).ok();
  } finally {
    await ctx.dispose();
  }
}

export async function requestCode(request: APIRequestContext, phone: string) {
  for (let i = 0; i < 3; i++) {
    const r = await request.post(`${BASE}/api/admin/auth/otp/request`, { data: { phone } });
    if (r.status() === 200) return;
    const body = (await r.json()) as { error: string; retryAfterSeconds?: number };
    if (body.error !== 'otp_cooldown') throw new Error(`admin code request failed: ${body.error} (${body.retryAfterSeconds ?? '-'}s)`);
    await new Promise((res) => setTimeout(res, ((body.retryAfterSeconds ?? 45) + 1) * 1000));
  }
  throw new Error('admin code request kept hitting the cooldown');
}

async function signInViaApi(playwright: Playwright, role: Role): Promise<Cookie[]> {
  const ctx = await playwright.request.newContext();
  try {
    await requestCode(ctx, ADMINS[role]);
    const code = await readOtp(ctx, ADMINS[role]);
    const r = await ctx.post(`${BASE}/api/admin/auth/sign-in`, { data: { phone: ADMINS[role], code } });
    expect(r.status(), 'admin sign-in').toBe(200);
    return (await ctx.storageState()).cookies as Cookie[];
  } finally {
    await ctx.dispose();
  }
}

/** Remember a session that was just created through the UI, so later specs do not ask for another code. */
export async function rememberSession(page: Page, role: Role) {
  const cookies = (await page.context().storageState()).cookies.filter((c) => c.name === 'jp_admin');
  if (cookies.length) fs.writeFileSync(cacheFile(role), JSON.stringify(cookies));
}

/** Signs this page's browser in as the role (no UI). */
export async function signInAs(page: Page, playwright: Playwright, role: Role) {
  let cookies: Cookie[] | null = null;
  try {
    cookies = JSON.parse(fs.readFileSync(cacheFile(role), 'utf8')) as Cookie[];
  } catch {
    cookies = null;
  }
  if (!cookies || !(await sessionIsValid(playwright, cookies))) {
    cookies = await signInViaApi(playwright, role);
    fs.writeFileSync(cacheFile(role), JSON.stringify(cookies));
  }
  await page.context().addCookies(cookies);
}

/** A request context that is signed in as the role, for setting data up and putting it back. */
export async function adminApi(playwright: Playwright, role: Role = 'system') {
  let cookies: Cookie[] | null = null;
  try {
    cookies = JSON.parse(fs.readFileSync(cacheFile(role), 'utf8')) as Cookie[];
  } catch {
    cookies = null;
  }
  if (!cookies || !(await sessionIsValid(playwright, cookies))) {
    cookies = await signInViaApi(playwright, role);
    fs.writeFileSync(cacheFile(role), JSON.stringify(cookies));
  }
  const jp = cookies.find((c) => c.name === 'jp_admin')!;
  return playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: `jp_admin=${jp.value}` } });
}

// ───────────────────────── Candidates (the public API, as a guest or a signed-up user)

export const FREE_SAMPLE = { country: 'RW', slug: 'procurement-officer-free-sample' };

export async function signUpCandidate(request: APIRequestContext, name = 'E2E Admin Subject') {
  const phone = randomPhone();
  const r1 = await request.post(`${BASE}/api/auth/otp/request`, { data: { purpose: 'sign_up', countryCode: 'RW', phone } });
  expect(r1.status()).toBe(200);
  const code = await readOtp(request, phone);
  const r2 = await request.post(`${BASE}/api/auth/sign-up`, { data: { countryCode: 'RW', phone, name, code } });
  expect(r2.status()).toBe(201);
  return { phone, name };
}

/** Starts a free sample as a guest and returns what the candidate sees. */
export async function startGuestAttempt(request: APIRequestContext, slug = FREE_SAMPLE.slug) {
  const start = await request.post(`${BASE}/api/countries/RW/mock-tests/${slug}/attempts`, { data: {} });
  expect(start.status()).toBe(201);
  const { attemptId, guestToken } = (await start.json()) as { attemptId: string; guestToken: string };
  const headers = { 'X-Guest-Token': guestToken };
  const state = (await (await request.get(`${BASE}/api/attempts/${attemptId}`, { headers })).json()) as { questions: { id: string; stem: string; options: { key: string; text: string }[] }[] };
  return { attemptId, headers, questions: state.questions };
}

/** A pending MTN payment of a signed-up candidate, settled at the (fake) operator but with no callback delivered. */
export async function createPendingPayment(request: APIRequestContext, phone: string) {
  const created = await request.post(`${BASE}/api/payments`, { data: { provider: 'MTN_MOMO', msisdn: phone } });
  expect(created.status()).toBe(201);
  return (await created.json()) as { id: string };
}

export const simulate = (request: APIRequestContext, id: string, outcome: string, deliver = true) =>
  request.post(`${BASE}/api/test/payments/${id}/simulate`, { data: { outcome, deliver } });

/** The sidebar (desktop) or the bottom bar (phone). */
export const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Admin', exact: true });
