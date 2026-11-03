import { expect, test, type Page } from '@playwright/test';
import { ADMIN_PASSWORD, ADMINS, BASE, expectAccessible, expectNoHorizontalScroll, isPhone, mainNav, rememberSession, signInAs, signUpAsCandidate, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

/**
 * There is no admin sign-in screen: people with a role use the normal candidate sign-in (email + password) and
 * land back on the admin page they were going to. Visits to /admin without a session, or without a role, are handled here.
 */

async function signInThroughTheScreen(page: Page, email: string, password = ADMIN_PASSWORD) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
  test('signed out: /admin goes to the normal sign-in and comes back to the Overview after the password (system admin)', async ({ page }) => {
    const w = watchErrors(page);
    await page.context().clearCookies();
    await page.goto('/admin');
    await expect(page).toHaveURL(`${BASE}/sign-in?next=${encodeURIComponent('/admin')}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    // the candidate sign-in as it is: no admin sign-in screen, no admin chrome
    await expect(page.getByText('Welcome back. Your practice is waiting.')).toBeVisible();
    await expect(page.getByText('ADMIN', { exact: true })).toHaveCount(0);
    await expect(mainNav(page)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page, 'sign-in reached from /admin');

    await signInThroughTheScreen(page, ADMINS.system);
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await rememberSession(page, 'system');
    w.expectClean();
  });

  test('signed out on a deep link: sign-in, then straight back to that admin page (support, with the query kept)', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/users?filter=expired');
    await expect(page).toHaveURL(`${BASE}/sign-in?next=${encodeURIComponent('/admin/users?filter=expired')}`);
    await signInThroughTheScreen(page, ADMINS.support);
    await expect(page).toHaveURL(`${BASE}/admin/users?filter=expired`);
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    await rememberSession(page, 'support');
  });

  test('content editor types the address in capitals, signs in, and gets the editor navigation', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin');
    await expect(page).toHaveURL(`${BASE}/sign-in?next=${encodeURIComponent('/admin')}`);
    await signInThroughTheScreen(page, ` ${ADMINS.editor.toUpperCase()} `);
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(mainNav(page).getByRole('link')).toHaveCount(2);
    await rememberSession(page, 'editor');
  });

  test('a wrong password for an admin is the normal "Email or password is incorrect" and nothing opens', async ({ page }) => {
    const w = watchErrors(page);
    await page.context().clearCookies();
    await page.goto('/admin');
    await signInThroughTheScreen(page, ADMINS.support, 'Not-the-password-1');
    await expect(page.getByRole('alert').filter({ hasText: 'Email or password is incorrect' })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    await expect(mainNav(page)).toHaveCount(0);
    w.expectClean();
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

  test('a session more than 12 hours old (the API says admin_session_stale): sign in again, with the notice, and return to the page', async ({ page, playwright }) => {
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
    await signInThroughTheScreen(page, ADMINS.support);
    await expect(page).toHaveURL(`${BASE}/admin/users`);
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    await rememberSession(page, 'support');
  });

  test('an invalid address is an inline message on the normal sign-in', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('not-an-email');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter a valid email address, like name@example.com.')).toBeVisible();
  });
});
