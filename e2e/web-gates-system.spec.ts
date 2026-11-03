import { expect, test } from '@playwright/test';
import { API, expectNoHorizontalScroll, isPhone, randomEmail, signUpViaApi, watchErrors } from './web-helpers';
import { cleanUser, me } from './web-p3-helpers';

const expectedHttp = (e: string) => /status of [45]\d\d/.test(e);

/** Kenya is not live in the seed: serve the country list with Kenya live to exercise the wrong-country page. */
async function kenyaLive(page: import('@playwright/test').Page) {
  await page.route('**/api/countries', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { countries: { code: string; status: string; selectable: boolean }[] };
    for (const c of body.countries) if (c.code === 'KE') Object.assign(c, { status: 'LIVE', selectable: true });
    await route.fulfill({ response: res, json: body });
  });
}

test.describe('Web: country gate (C23)', () => {
  test('a country that is not open: waiting-list form, then "You’re on the list"', async ({ page }) => {
    const w = watchErrors(page);
    const posts: unknown[] = [];
    await page.route('**/api/countries/ug/waiting-list', (route) => {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { ok: true } });
    });
    await page.goto('/ug');
    await expect(page.getByRole('heading', { level: 1, name: 'JobPrep isn’t open in Uganda yet' })).toBeVisible();
    await expect(page.getByText('+256')).toHaveCount(0);
    await expect(page.getByText(/Leave your email address and we’ll send one email when they’re ready — nothing else\./)).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByLabel('Email address').fill('aline@');
    await page.getByRole('button', { name: 'Notify me' }).click();
    await expect(page.getByText('Enter a valid email address, like name@example.com.')).toBeVisible();
    expect(posts).toHaveLength(0);

    await page.getByLabel('Email address').fill('  Aline.Waiting@Example.test ');
    await page.getByRole('button', { name: 'Notify me' }).click();
    await expect(page.getByRole('status')).toContainText('You’re on the list');
    await expect(page.getByText('We’ll send one email to aline.waiting@example.test when Uganda opens. You can ask us to remove your address at any time.')).toBeVisible();
    expect(posts).toEqual([{ email: 'aline.waiting@example.test' }]);
    await page.getByRole('link', { name: 'Choose a different country' }).click();
    await expect(page).toHaveURL(/\/choose-country$/);
    w.expectClean();
  });

  test('the real waiting-list endpoint accepts the email address (201)', async ({ page, request }) => {
    const email = randomEmail('waiting');
    await page.goto('/tz');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('isn’t open in Tanzania yet');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Notify me' }).click();
    await expect(page.getByRole('status')).toContainText('You’re on the list');
    expect((await request.post(`${API}/api/countries/tz/waiting-list`, { data: { email } })).status()).toBe(201); // idempotent
  });

  test('the picker’s "Notify me when X opens" leads to that page', async ({ page }) => {
    await page.goto('/choose-country');
    await page.getByText('Uganda', { exact: true }).click();
    await page.getByRole('link', { name: 'Notify me when Uganda opens' }).click();
    await expect(page).toHaveURL(/\/ug$/);
  });

  test('wrong country: a Rwanda account opening a Kenya test link sees "This test is for Kenya" and can stay or switch', async ({ page }) => {
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    const userId = (await me(page)).id;
    await kenyaLive(page);
    await page.goto('/ke/tests/county-accountant-mock-1');
    await expect(page.getByRole('heading', { level: 1, name: 'This test is for Kenya' })).toBeVisible();
    await expect(page.getByText(/Your account is set to/)).toContainText('Rwanda');
    await expect(page.getByText('Kenya mock test')).toBeVisible();
    await expect(page.getByRole('link', { name: 'See similar tests in Rwanda' })).toHaveAttribute('href', '/rw/tests');
    await expect(page.getByRole('link', { name: 'Switch my account to Kenya' })).toHaveAttribute('href', '/account/country?to=KE');
    await expect(page.getByText(/Switching keeps your Rwanda results\./)).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: 'See similar tests in Rwanda' }).click();
    await expect(page).toHaveURL(/\/rw\/tests$/);
    // other pages of another country still go to the user's own country
    await page.goto('/ke/pricing');
    await expect(page).toHaveURL(/\/rw\/pricing$/);
    w.expectClean();
    await cleanUser(userId);
  });

  test('wrong country: "Switch my account to Kenya" opens Change exam country with Kenya selected', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    await kenyaLive(page);
    await page.goto('/ke/tests/county-accountant-mock-1');
    await page.getByRole('link', { name: 'Switch my account to Kenya' }).click();
    await expect(page).toHaveURL(/\/account\/country\?to=KE$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Change exam country' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Kenya/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: 'Switch to Kenya' })).toBeVisible();
  });

  test('the API’s 403 country_mismatch (a stale country in the URL) never shows a raw error', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw/tests');
    await expect(page.getByRole('heading', { level: 1, name: 'Find your mock test' })).toBeVisible();
    expect((await page.request.get(`${API}/api/countries/KE/mock-tests`)).status()).toBe(404); // not live: country_not_available
  });
});

test.describe('Web: system pages (C26)', () => {
  test('an unknown route is the 404 page, not a redirect', async ({ page }, info) => {
    const w = watchErrors(page);
    await page.goto('/rw/this-page-does-not-exist');
    await expect(page).toHaveURL(/\/rw\/this-page-does-not-exist$/);
    await expect(page.getByText('Error 404')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'We can’t find that page' })).toBeVisible();
    await expect(page.getByText('The link may be old, or the mock test may have been moved. Search for your exam instead.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find mock tests' })).toHaveAttribute('href', '/rw/tests');
    await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/rw');
    await expectNoHorizontalScroll(page);
    await page.goto('/zzz/nothing');
    await expect(page.getByText('Error 404')).toBeVisible();
    await page.goto('/totally/unknown/deep/path');
    await expect(page.getByText('Error 404')).toBeVisible();
    await page.getByRole('link', { name: 'Find mock tests' }).click();
    await expect(page).toHaveURL(/\/rw\/tests$/);
    void info;
    w.expectClean();
  });

  test('a server error shows "Something went wrong on our side" with the request id as the Reference', async ({ page }) => {
    await page.route('**/api/countries/rw/mock-tests*', (route) => route.fulfill({ status: 500, headers: { 'X-Request-Id': '7F3A21C9' }, json: { error: 'internal_error', requestId: '7F3A21C9' } }));
    const w = watchErrors(page);
    await page.goto('/rw/tests');
    await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong on our side' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('This is our fault, not yours. Try again in a moment.')).toBeVisible();
    await expect(page.getByText('If you were taking a test, your answers are saved.')).toBeVisible();
    await expect(page.getByText('Reference: JP-7F3A-21C9 — share this with support if it keeps happening.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the home page' })).toBeVisible();
    // Try again asks again; once the server recovers the list is back
    await page.unroute('**/api/countries/rw/mock-tests*');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Find your mock test' })).toBeVisible();
    expect(w.errors.filter((e) => !expectedHttp(e))).toEqual([]);
  });

  test('a real error body carries a request id the page can show', async ({ request }) => {
    const res = await request.get(`${API}/api/nope`);
    const body = (await res.json()) as { requestId: string };
    expect(body.requestId).toBe(res.headers()['x-request-id']);
  });

  test('maintenance: a 503 replaces the page with "JobPrep is being updated" (no made-up time)', async ({ page }) => {
    await page.route('**/api/countries', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
    await page.goto('/rw/tests');
    await expect(page.getByRole('heading', { level: 1, name: 'JobPrep is being updated' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('We’re making improvements. Your results, answers and access are safe.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('[TIME]');
    await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
    await page.unroute('**/api/countries');
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Find your mock test' })).toBeVisible();
  });

  test('session expired: a cleared cookie while signed in shows "Please sign in again" with a sign-in link', async ({ page }, info) => {
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Aline' })).toBeVisible();
    await page.context().clearCookies(); // the session is gone, the browser still believes it is signed in
    await page.goto('/rw/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Please sign in again' })).toBeVisible();
    await expect(page.getByText('For your security, you were signed out after a long time without activity.')).toBeVisible();
    await expect(page.getByText('Your answers and results are saved.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('link', { name: 'Sign in', exact: true }).last().click();
    await expect(page).toHaveURL(/\/sign-in(\?next=.*)?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    void info;
    expect(w.errors.filter((e) => !expectedHttp(e))).toEqual([]);
  });

  test('session expired mid-visit: a 401 on a call that needs a session shows the prompt too', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw/tests');
    await page.route('**/api/me/dashboard', (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }));
    await page.goto('/rw/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Please sign in again' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL(/\/rw$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Please sign in again' })).toHaveCount(0);
    void isPhone;
  });
});
