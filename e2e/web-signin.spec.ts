import { expect, test } from '@playwright/test';
import { ACCOUNTANT_SLUG, buyAccessViaApi } from './web-exam-helpers';
import { isPhone, signUpViaApi, watchErrors, expectNoHorizontalScroll } from './web-helpers';
import { cleanUser, me, openAccount, requestSignInCode, signInWithCode, signOutControl, startRunningAttempt, typeCode } from './web-p3-helpers';

/** Errors the browser logs by itself for an expected 4xx answer are not app errors. */
const expected4xx = (e: string) => /status of 4\d\d/.test(e);

test.describe('Web: sign in (C12) and sign out (C13)', () => {
  test('sign up via the API, sign out from the menu, sign in through the UI, land on the dashboard', async ({ page }, info) => {
    const w = watchErrors(page);
    const u = await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw');
    await openAccount(page, info);
    await signOutControl(page, info).click(); // no test running: signs out at once
    await expect(page.getByRole('status').filter({ hasText: 'You’re signed out.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in again' })).toBeVisible();

    await page.getByRole('link', { name: 'Sign in again' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Enter the phone number you signed up with. We’ll text you a 6-digit code — there is no password.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await signInWithCode(page, u.national);
    await expect(page).toHaveURL(/\/rw\/progress$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Aline' })).toBeVisible();
    // the header is the signed-in one
    if (!isPhone(info)) await expect(page.getByRole('button', { name: /account menu for Aline Uwase/i })).toBeVisible();
    expect(w.errors.filter((e) => !expected4xx(e))).toEqual([]);
  });

  test('a wrong code says how many tries are left; a right one still works afterwards', async ({ page }) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    await page.context().clearCookies();
    await page.addInitScript(() => localStorage.removeItem('jobprep.session'));
    await page.goto('/sign-in');
    await requestSignInCode(page, u.national);
    await expect(page.getByText(/It works for 5 minutes\./)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Resend code in 0:/ })).toBeDisabled();

    await typeCode(page, '000000');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('That code is not right');
    await expect(alert).toContainText('Check the SMS and try again. 4 tries left.');
    await typeCode(page, '000000');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(alert).toContainText('3 tries left.');
  });

  test('five wrong codes kill the code: "Request a new code", Verify locked, no timed lockout', async ({ page }) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    await page.context().clearCookies();
    await page.addInitScript(() => localStorage.removeItem('jobprep.session'));
    await page.goto('/sign-in');
    await requestSignInCode(page, u.national);
    for (let i = 0; i < 5; i++) {
      await typeCode(page, '000000');
      await page.getByRole('button', { name: 'Verify and sign in' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    }
    await expect(page.getByRole('alert')).toContainText('Too many tries');
    await expect(page.getByRole('alert')).toContainText('Request a new code.');
    await expect(page.getByRole('alert')).not.toContainText('15 minutes');
    await expect(page.getByRole('button', { name: 'Verify and sign in' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: /^Resend code in 0:/ })).toBeVisible(); // the normal resend countdown
  });

  test('an invalid number is an inline message', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Phone number').fill('78812');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('Enter a 9-digit Rwanda number, like 788 123 456.')).toBeVisible();
  });

  test('an unknown number gets the same screen as a known one (no account discovery) and never a "no account" message', async ({ page }) => {
    await page.goto('/sign-in');
    await requestSignInCode(page, `789${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`);
    await expect(page.getByText(/has a JobPrep account, a code is on its way by SMS/)).toBeVisible();
    await expect(page.getByText(/no account|not registered/i)).toHaveCount(0);
    await typeCode(page, '123456');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible(); // invalid or expired, but never "this number has no account"
    await expect(page.getByRole('alert')).not.toContainText(/no account/i);
  });

  test('"?next=" brings a signed-in user back to the page they wanted; off-site targets are ignored', async ({ page }) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    await page.context().clearCookies();
    await page.addInitScript(() => localStorage.removeItem('jobprep.session'));
    await page.goto('/sign-in?next=%2Frw%2Fpricing');
    await signInWithCode(page, u.national);
    await expect(page).toHaveURL(/\/rw\/pricing$/);
  });

  test('the header and sign-up lead to sign-in', async ({ page }, info) => {
    await page.goto('/rw/pricing');
    if (isPhone(info)) {
      await page.goto('/rw');
      await page.getByRole('link', { name: 'Sign in' }).first().click();
    } else {
      await page.getByRole('link', { name: 'Sign in' }).click();
    }
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/sign-up');
    await page.getByRole('button', { name: /Continue with Rwanda/ }).click();
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByRole('link', { name: 'Create a free account' }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test('signing out with a test in progress asks first; Stay signed in keeps the session', async ({ page }, info) => {
    const w = watchErrors(page);
    const u = await signUpViaApi(page, 'Aline Uwase');
    await buyAccessViaApi(page.request, u.phone);
    await startRunningAttempt(page, ACCOUNTANT_SLUG);
    await page.goto('/rw');
    await openAccount(page, info);
    await signOutControl(page, info).click();
    const dialog = page.getByRole('dialog', { name: 'Sign out?' });
    await expect(dialog).toBeVisible();
    if (isPhone(info)) await expect(dialog).toContainText('You have a mock test in progress. Your answers are saved, but the timer keeps running.');
    else await expect(dialog).toContainText(/You have a mock test in progress \(Accountant \(Public Institution\) — Mock 1, \d\d:\d\d left\)\. Your answers are saved, but the timer keeps running while you are signed out\./);

    await dialog.getByRole('button', { name: 'Stay signed in' }).click();
    await expect(dialog).toBeHidden();
    expect((await page.request.get('/api/me')).status()).toBe(200); // still signed in

    await openAccount(page, info);
    await signOutControl(page, info).click();
    await page.getByRole('dialog', { name: 'Sign out?' }).getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'You’re signed out.' })).toBeVisible();
    expect((await page.request.get('/api/me')).status()).toBe(401);
    expect(w.errors.filter((e) => !expected4xx(e))).toEqual([]);
  });

  test.afterEach(async ({ page }) => {
    const info = await me(page).catch(() => null);
    if (info) await cleanUser(info.id);
  });
});
