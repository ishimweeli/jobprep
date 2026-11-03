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

export async function readOtp(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.get(`${API}/api/test/otp`, { params: { email } });
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

/** Create an account through the API in the page's cookie jar and mark this browser as signed in. */
export async function signUpViaApi(page: Page, name = 'E2E Candidate') {
  const email = randomEmail();
  const req = page.request;
  const r1 = await req.post(`${API}/api/auth/otp/request`, { data: { purpose: 'sign_up', countryCode: 'RW', email } });
  expect(r1.status()).toBe(200);
  const code = await readOtp(req, email);
  const r2 = await req.post(`${API}/api/auth/sign-up`, { data: { countryCode: 'RW', email, name, code } });
  expect(r2.status()).toBe(201);
  await page.addInitScript(() => localStorage.setItem('jobprep.session', '1'));
  // `phone` is a fresh Mobile Money payer number for the specs that pay; the account itself has only the email.
  const national = randomNational();
  return { email, phone: `+250${national}`, national, name };
}

/** The signed-in session cookie is shared by `page.request` and the page; the API is proxied same-origin by Vite. */
export const PAID_SLUG = 'secondary-mathematics-teacher-s4-s6-mock-1';
export const FREE_SLUG = 'secondary-mathematics-teacher-s1-s3-mock-1';
