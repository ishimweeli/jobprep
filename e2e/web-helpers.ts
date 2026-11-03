import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://localhost:4000';

export const isPhone = (info: TestInfo) => info.project.name === 'phone-390';

/** Random valid Rwanda mobile (national digits 789xxxxxx): the Mobile Money payer number, not an identity. */
export const randomNational = () => `789${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;

/** A fresh Mobile Money payer number in E.164 form. */
export const randomMsisdn = () => `+250${randomNational()}`;

/** Type a payer number into the checkout field (accounts have no phone number to prefill it from). */
export async function fillPayerNumber(page: Page, national = randomNational()) {
  await page.getByLabel('Mobile Money number').fill(`0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`);
  return `+250${national}`;
}

/** A unique email per call so reruns against the dev DB never collide. */
export const randomEmail = (tag = 'web') => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** The 6-digit code emailed at sign-up (test endpoint; needs ENABLE_TEST_ENDPOINTS=true). */
export async function readOtp(request: APIRequestContext, email: string): Promise<string> {
  // The sign-up request may still be in flight when a spec asks: poll for a moment.
  let res = await request.get(`${API}/api/test/otp`, { params: { email } });
  for (let i = 0; i < 20 && !res.ok(); i++) {
    await new Promise((r) => setTimeout(r, 250));
    res = await request.get(`${API}/api/test/otp`, { params: { email } });
  }
  expect(res.ok(), 'GET /api/test/otp (needs ENABLE_TEST_ENDPOINTS=true)').toBeTruthy();
  return ((await res.json()) as { code: string }).code;
}

/** Collects console errors and uncaught page errors; call `expectClean()` at the end of a test. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return {
    errors,
    expectClean: () => expect(errors, errors.join('\n')).toEqual([]),
  };
}

export async function expectNoHorizontalScroll(page: Page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, `page is ${sw}px wide in a ${iw}px viewport`).toBeLessThanOrEqual(iw);
}

/** A password every helper-made account uses (long enough, not a real secret). */
export const TEST_PASSWORD = 'Password123!';

export async function readResetToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.get(`${API}/api/test/reset-token`, { params: { email } });
  expect(res.ok(), 'GET /api/test/reset-token (needs ENABLE_TEST_ENDPOINTS=true)').toBeTruthy();
  return ((await res.json()) as { token: string }).token;
}

/** Sign up through the API (no session yet), read the emailed code from the test endpoint and verify it: the cookie jar is now signed in. */
export async function createVerifiedAccount(request: APIRequestContext, opts: { email?: string; name?: string; password?: string; countryCode?: string } = {}) {
  const email = opts.email ?? randomEmail();
  const password = opts.password ?? TEST_PASSWORD;
  const name = opts.name ?? 'E2E Candidate';
  const r1 = await request.post(`${API}/api/auth/sign-up`, { data: { name, email, password, countryCode: opts.countryCode ?? 'RW' } });
  expect(r1.status(), 'sign-up').toBe(201);
  const code = await readOtp(request, email);
  const r2 = await request.post(`${API}/api/auth/verify-email`, { data: { email, code } });
  expect(r2.status(), 'verify-email').toBe(200);
  return { email, password, name };
}

/**
 * Finish setup the quickest way the API allows (the country and a job category are required; level, subject and exam date
 * are what "Skip for now" skips), so specs land on the page they test, not on setup.
 */
export async function skipSetup(request: APIRequestContext, countryCode = 'RW') {
  const cats = await request.get(`${API}/api/countries/${countryCode}/categories`);
  expect(cats.status(), 'categories').toBe(200);
  const goalCategoryId = ((await cats.json()) as { categories: { id: string }[] }).categories[0]!.id;
  const set = await request.patch(`${API}/api/me/onboarding`, { data: { countryCode, goalCategoryId } });
  expect(set.status(), 'PATCH /api/me/onboarding {country, goal}').toBe(200);
  const r = await request.patch(`${API}/api/me/onboarding`, { data: { skip: true } });
  expect(r.status(), 'PATCH /api/me/onboarding {skip}').toBe(200);
}

/** Create an account through the API in the page's cookie jar, skip setup, and mark this browser as signed in. */
export async function signUpViaApi(page: Page, name = 'E2E Candidate') {
  const req = page.request;
  const { email, password } = await createVerifiedAccount(req, { name });
  await skipSetup(req);
  await page.addInitScript(() => localStorage.setItem('jobprep.session', '1'));
  // `phone` is a fresh Mobile Money payer number for the specs that pay; the account itself has only the email.
  const national = randomNational();
  return { email, password, phone: `+250${national}`, national, name };
}

/** Type the six digits of the emailed code into the boxes of "Check your email". */
export async function typeCode(page: Page, code: string) {
  await page.getByLabel('Digit 1').click();
  await page.keyboard.type(code);
}

/** Through the real screens: /sign-up -> Check your email -> Verify. Ends on the first setup step (or where `next` leads). */
export async function signUpThroughUi(page: Page, opts: { email?: string; name?: string; password?: string; path?: string } = {}) {
  const email = opts.email ?? randomEmail('ui');
  const password = opts.password ?? TEST_PASSWORD;
  const name = opts.name ?? 'Aline Uwase';
  await page.goto(opts.path ?? '/sign-up');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
  await typeCode(page, await readOtp(page.request, email));
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  return { email, password, name };
}

/** Walk the three setup screens with the first choice on each, then stop on whatever page follows. */
export async function finishSetupThroughUi(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Where are you sitting your exam?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'What job are you preparing for?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Which position?' })).toBeVisible();
  await page.getByRole('button', { name: /^Finish/ }).click();
}

/** The signed-in session cookie is shared by `page.request` and the page; the API is proxied same-origin by Vite. */
export const PAID_SLUG = 'secondary-mathematics-teacher-s4-s6-mock-1';
export const FREE_SLUG = 'secondary-mathematics-teacher-s1-s3-mock-1';
