import { expect, test, type Page } from '@playwright/test';
import { ADMINS, BASE, expectAccessible, expectNoHorizontalScroll, isPhone, mainNav, readOtp, rememberSession, signInAs, signUpAsCandidate, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

/**
 * There is no admin sign-in screen: people with a role use the normal candidate sign-in (email + emailed code) and
 * land back on the admin page they were going to. Visits to /admin without a session, or without a role, are handled here.
 */

/** Asks for a code. A code was probably asked for a moment ago (a wait per email): wait it out, as a person would. */
async function askForCode(page: Page, email: string) {
  if (!page.url().includes('/sign-in')) await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Send code' }).click();
    const code = page.getByRole('heading', { level: 1, name: 'Enter your code' });
    const wait = page.getByRole('alert').filter({ hasText: 'Please wait a moment' });
    await expect(code.or(wait)).toBeVisible();
    if (await code.isVisible()) return;
    const m = /(\d+):(\d{2})/.exec((await wait.textContent()) ?? '');
    await page.waitForTimeout(((m ? Number(m[1]) * 60 + Number(m[2]) : 45) + 1) * 1000);
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Enter your code' })).toBeVisible();
}

const typeCode = (page: Page, code: string) => page.getByLabel('Digit 1').fill(code);

async function signInThroughTheScreen(page: Page, request: Parameters<typeof readOtp>[0], email: string) {
  await askForCode(page, email);
  await typeCode(page, await readOtp(request, email));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
}

/** Opens the candidate's account menu (desktop) or Account tab (phone) and returns the locator that holds its entries. */
async function openAccountEntries(page: Page, phone: boolean) {
  if (phone) {
    await page.goto('/account');
    return page.getByRole('navigation', { name: 'Account', exact: true });
  }
  await page.goto('/rw/progress');
  await page.getByRole('button', { name: /account menu for/ }).click();
  return page.getByRole('menu', { name: 'Account' });
}

test.describe('Admin area and the normal sign-in', () => {
  test('signed out: /admin goes to the normal sign-in and comes back to the Overview after the code (system admin)', async ({ page, request }) => {
    const w = watchErrors(page);
    await page.context().clearCookies();
    await page.goto('/admin');
    await expect(page).toHaveURL(`${BASE}/sign-in?next=${encodeURIComponent('/admin')}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    // the candidate sign-in as it is: no admin sign-in screen, no admin chrome
    await expect(page.getByText('Enter the email address you signed up with. We’ll email you a 6-digit code — there is no password.')).toBeVisible();
    await expect(page.getByText('ADMIN', { exact: true })).toHaveCount(0);
    await expect(mainNav(page)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page, 'sign-in reached from /admin');

    await signInThroughTheScreen(page, request, ADMINS.system);
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await rememberSession(page, 'system');
    w.expectClean();
  });

  test('signed out on a deep link: sign-in, then straight back to that admin page (support, with the query kept)', async ({ page, request }) => {
    await page.context().clearCookies();
    await page.goto('/admin/users?filter=expired');
    await expect(page).toHaveURL(`${BASE}/sign-in?next=${encodeURIComponent('/admin/users?filter=expired')}`);
    await signInThroughTheScreen(page, request, ADMINS.support);
    await expect(page).toHaveURL(`${BASE}/admin/users?filter=expired`);
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    await rememberSession(page, 'support');
  });

  test('content editor types the address in capitals, signs in, and gets the editor navigation', async ({ page, request }) => {
    await page.context().clearCookies();
    await page.goto('/admin');
    await expect(page).toHaveURL(`${BASE}/sign-in?next=${encodeURIComponent('/admin')}`);
    await askForCode(page, ADMINS.editor.toUpperCase());
    await expect(page.getByText(ADMINS.editor, { exact: true })).toBeVisible(); // lower-cased before use
    await typeCode(page, await readOtp(request, ADMINS.editor));
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(mainNav(page).getByRole('link')).toHaveCount(2);
    await rememberSession(page, 'editor');
  });

  test('a signed-in candidate with no role: no Admin entry in the account menu, and /admin says there is no access', async ({ page }, info) => {
    const w = watchErrors(page);
    await signUpAsCandidate(page);
    const entries = await openAccountEntries(page, isPhone(info));
    await expect(entries.getByText('Account settings')).toBeVisible();
    await expect(entries.getByText('Admin', { exact: true })).toHaveCount(0);

    await page.goto('/admin');
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(page.getByRole('heading', { level: 1, name: 'You don’t have access to the admin area' })).toBeVisible();
    await expect(mainNav(page)).toHaveCount(0); // no admin chrome
    await expect(page.getByRole('link', { name: 'Go to the home page' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page, 'admin no-access page');
    // a deep link behaves the same, and nothing was sent anywhere else
    await page.goto('/admin/payments');
    await expect(page.getByRole('heading', { level: 1, name: 'You don’t have access to the admin area' })).toBeVisible();
    w.expectClean();
  });

  test('a person with a role gets an Admin entry in the account menu that opens /admin (multi-role account)', async ({ page, playwright }, info) => {
    await signInAs(page, playwright, 'multi');
    const entries = await openAccountEntries(page, isPhone(info));
    const admin = entries.getByRole(isPhone(info) ? 'link' : 'menuitem', { name: 'Admin', exact: true });
    await expect(admin).toBeVisible();
    await admin.click();
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    // the admin chrome replaces the candidate chrome
    await expect(mainNav(page)).toBeVisible();
    await expect(page.getByRole('button', { name: /account menu for/ })).toHaveCount(0);
  });

  test('a session more than 12 hours old (the API says admin_session_stale): sign in again, with the notice, and return to the page', async ({ page, playwright, request }) => {
    await signInAs(page, playwright, 'support');
    // The 12-hour clock is awkward in e2e: the API's answer is stubbed for the admin principal only.
    await page.route('**/api/admin/me', (r) => r.fulfill({ status: 401, json: { error: 'admin_session_stale' } }));
    await page.goto('/admin/users');
    await expect(page).toHaveURL(`${BASE}/sign-in?next=${encodeURIComponent('/admin/users')}&reason=admin_stale`);
    // still signed in as far as the browser knows, yet the sign-in screen stays and explains why
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Please sign in again to use the admin area' })).toBeVisible();
    await expectAccessible(page, 'sign-in again notice');

    await page.unroute('**/api/admin/me');
    await signInThroughTheScreen(page, request, ADMINS.support);
    await expect(page).toHaveURL(`${BASE}/admin/users`);
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    await rememberSession(page, 'support');
  });

  test('an invalid address is an inline message on the normal sign-in', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('not-an-email');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address, like name@example.com.');
  });
});
