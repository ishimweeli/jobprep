import { expect, test } from '@playwright/test';
import { ACCOUNTANT_SLUG, buyAccessViaApi } from './web-exam-helpers';
import { API, createVerifiedAccount, expectNoHorizontalScroll, isPhone, randomEmail, readOtp, signUpViaApi, TEST_PASSWORD, typeCode, watchErrors } from './web-helpers';
import { cleanUser, me, openAccount, signInWithPassword, signOutControl, startRunningAttempt } from './web-p3-helpers';

/** Errors the browser logs by itself for an expected 4xx answer are not app errors. */
const expected4xx = (e: string) => /status of 4\d\d/.test(e);

/** A browser with no session (the API cookie and the "signed in" hint are gone). */
async function signedOut(page: import('@playwright/test').Page) {
  await page.context().clearCookies();
  await page.addInitScript(() => localStorage.removeItem('jobprep.session'));
}

test.describe('Web: sign in (SignIn.dc) and sign out', () => {
  test('sign up via the API, sign out from the menu, sign in with the password, land on the dashboard', async ({ page }, info) => {
    const w = watchErrors(page);
    const u = await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw');
    await openAccount(page, info);
    await signOutControl(page, info).click(); // no test running: signs out at once
    await expect(page.getByRole('status').filter({ hasText: 'You’re signed out.' })).toBeVisible();

    await page.getByRole('link', { name: 'Sign in again' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Welcome back. Your practice is waiting.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
    await expect(page.getByLabel('Remember me')).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Resend verification' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await signInWithPassword(page, u.email, u.password);
    await expect(page).toHaveURL(/\/rw\/progress$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Aline' })).toBeVisible();
    if (!isPhone(info)) await expect(page.getByRole('button', { name: /account menu for Aline Uwase/i })).toBeVisible();
    expect(w.errors.filter((e) => !expected4xx(e))).toEqual([]);
  });

  test('Continue with Google is always drawn: without Google set up it says so and stays, with it set up it leaves for the API', async ({ page }) => {
    await page.route('**/api/auth/providers', (r) => r.fulfill({ json: { google: false } }));
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('or sign in with email')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByText('Google sign-in isn’t available yet. Use your email instead.')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.unroute('**/api/auth/providers');
    await page.route('**/api/auth/providers', (r) => r.fulfill({ json: { google: true } }));
    let started = '';
    await page.route('**/api/auth/google/start**', (r) => {
      started = r.request().url();
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google (stub)</p>' });
    });
    await page.goto('/sign-in?next=%2Frw%2Fpricing');
    await expect(page.getByText('or sign in with email')).toBeVisible();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect.poll(() => started).toContain('/api/auth/google/start?next=%2Frw%2Fpricing');
  });

  test('a failed Google round trip (?error=google_failed) shows a plain message', async ({ page }) => {
    await page.goto('/sign-in?error=google_failed');
    await expect(page.getByText('Google sign-in did not work')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Please try again, or sign in with your email and password.');
  });

  test('a wrong password and an unknown email give the same message (no account discovery)', async ({ page }) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    await signedOut(page);
    await page.goto('/sign-in');
    await signInWithPassword(page, u.email, 'Wrong-password-1');
    const box = page.getByRole('alert').filter({ hasText: 'Email or password is incorrect' });
    await expect(box).toBeVisible();
    await expect(box).toContainText('Check them and try again, or reset your password.');
    await expect(page.getByLabel('Email address')).toHaveValue(u.email);

    await signInWithPassword(page, randomEmail('nobody'), TEST_PASSWORD);
    await expect(box).toBeVisible();
    await expect(page.getByText(/no account|not registered/i)).toHaveCount(0);
  });

  test('an unverified account: "Please verify your email first", Resend verification opens Check your email, the code finishes sign-in', async ({ page, request }) => {
    const email = randomEmail('unverified');
    expect((await request.post(`${API}/api/auth/sign-up`, { data: { name: 'Not Yet', email, password: TEST_PASSWORD, countryCode: 'RW' } })).status()).toBe(201);
    await page.goto('/sign-in?next=%2Frw%2Ftests');
    await signInWithPassword(page, email);
    const box = page.getByRole('alert').filter({ hasText: 'Please verify your email first' });
    await expect(box).toBeVisible();
    await expect(box).toContainText('Tap “Resend verification” to get a new one.');

    await page.getByRole('button', { name: 'Resend verification' }).click();
    await expect(page).toHaveURL(new RegExp(`/verify-email\\?email=${encodeURIComponent(email).replace(/\./g, '\\.')}&next=%2Frw%2Ftests$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(`We sent a 6-digit code to ${email}.`)).toBeVisible();
    await typeCode(page, await readOtp(page.request, email));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    // a brand-new account still has setup to do; it keeps the way back
    await expect(page).toHaveURL(/\/setup\/country\?next=%2Frw%2Ftests$/);
  });

  test('five wrong passwords lock sign-in: "Too many tries" with the wait, even for the right password', async ({ page }) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    await signedOut(page);
    await page.goto('/sign-in');
    const tooMany = page.getByRole('alert').filter({ hasText: 'Too many tries' });
    for (let i = 0; i < 6 && !(await tooMany.isVisible()); i++) {
      await signInWithPassword(page, u.email, `Wrong-password-${i}`);
      await expect(page.getByRole('alert').first()).toBeVisible();
    }
    await expect(tooMany).toBeVisible();
    await expect(tooMany).toContainText(/For your security, wait \d+ minutes?, or reset your password\./);
    await signInWithPassword(page, u.email, u.password);
    await expect(tooMany).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('an invalid email and an empty password are inline messages', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('aline@');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter a valid email address, like name@example.com.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
  });

  test('"?next=" brings a signed-in user back to the page they wanted; off-site targets are ignored', async ({ page }) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    await signedOut(page);
    await page.goto('/sign-in?next=%2Frw%2Fpricing');
    await signInWithPassword(page, u.email, u.password);
    await expect(page).toHaveURL(/\/rw\/pricing$/);
    await signedOut(page);
    await page.request.post(`${API}/api/auth/sign-out`);
    await page.goto('/sign-in?next=%2F%2Fevil.test');
    await signInWithPassword(page, u.email, u.password);
    await expect(page).toHaveURL(/\/rw\/progress$/);
  });

  test('a signed-in person opening /sign-in is sent on; a new account goes to setup', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/rw\/progress$/);
  });

  test('sign-in is reached from the header, links to Forgot password, and to sign-up and back', async ({ page }, info) => {
    await page.goto('/rw/pricing');
    if (isPhone(info)) {
      await page.goto('/rw');
      await page.getByRole('link', { name: 'Sign in' }).first().click();
    } else {
      await page.getByRole('link', { name: 'Sign in' }).click();
    }
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test('/auth/callback (where Google returns): loads the session and goes to next, or to setup for a new account', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/auth/callback?next=%2Frw%2Fpricing');
    await expect(page).toHaveURL(/\/rw\/pricing$/);

    await signedOut(page);
    await page.request.post(`${API}/api/auth/sign-out`);
    await createVerifiedAccount(page.request, { name: 'Fresh Account' }); // no setup yet
    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/\/setup\/country$/);
  });

  test('/auth/callback without a session goes back to sign-in with the Google message', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/auth/callback?next=%2Frw%2Ftests');
    await expect(page).toHaveURL(/\/sign-in\?error=google_failed&next=%2Frw%2Ftests$/);
    await expect(page.getByText('Google sign-in did not work')).toBeVisible();
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
