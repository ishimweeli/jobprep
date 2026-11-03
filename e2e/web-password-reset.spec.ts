import { expect, test } from '@playwright/test';
import { API, createVerifiedAccount, expectNoHorizontalScroll, randomEmail, readResetToken, skipSetup, TEST_PASSWORD, watchErrors } from './web-helpers';
import { signInWithPassword } from './web-p3-helpers';

test.describe('Web: forgot and reset password (ForgotPassword.dc, ResetPassword.dc)', () => {
  test('forgot password, reset link from the test endpoint, new password, sign in with it (and not with the old one)', async ({ page }) => {
    const w = watchErrors(page);
    const { email } = await createVerifiedAccount(page.request, { name: 'Reset Person' });
    await skipSetup(page.request);
    await page.request.post(`${API}/api/auth/sign-out`);

    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible();
    await expect(page.getByText('Enter your email and we’ll send you a link.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Check your email' })).toContainText('If an account exists for that address, a reset link is on its way. It works for 1 hour.');
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    const token = await readResetToken(page.request, email);
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeVisible();
    await expect(page.getByText(`For ${email}`)).toBeVisible();
    const rules = page.getByRole('list', { name: 'Password rules' });
    await expect(rules).toContainText('At least 8 characters (not yet)');
    await page.getByLabel('New password', { exact: true }).fill('Brand-new-pass-1');
    await expect(rules).toContainText('At least 8 characters (done)');
    await expect(rules).toContainText('Both passwords match (not yet)');
    await page.getByLabel('Confirm new password').fill('Brand-new-pass-1');
    await expect(rules).toContainText('Both passwords match (done)');
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Save new password' }).click();

    // saving does not sign in: the sign-in screen opens
    await expect(page).toHaveURL(/\/sign-in$/);
    expect((await page.request.get(`${API}/api/me`)).status()).toBe(401);
    await signInWithPassword(page, email, TEST_PASSWORD);
    await expect(page.getByText('Email or password is incorrect')).toBeVisible();
    await signInWithPassword(page, email, 'Brand-new-pass-1');
    await expect(page).toHaveURL(/\/rw\/progress$/);
    expect(w.errors.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]); // the wrong old password is an expected 401
  });

  test('an unknown address gets the same "Check your email" answer', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(randomEmail('nobody'));
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Check your email' })).toBeVisible();
    await expect(page.getByText(/no account|not registered/i)).toHaveCount(0);
  });

  test('the reset form checks both rules before saving', async ({ page }) => {
    const { email } = await createVerifiedAccount(page.request, { name: 'Rules Person' });
    await page.request.post(`${API}/api/auth/sign-out`);
    expect((await page.request.post(`${API}/api/auth/forgot-password`, { data: { email } })).status()).toBe(200);
    const token = await readResetToken(page.request, email);
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await page.getByLabel('New password', { exact: true }).fill('short');
    await page.getByLabel('Confirm new password').fill('different');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    await expect(page.getByRole('list', { name: 'Password rules' })).toContainText('At least 8 characters (not yet)');
  });

  test('a dead reset link shows the error state with a way to ask again (no artboard)', async ({ page }) => {
    await page.goto('/reset-password?token=not-a-real-token');
    await expect(page.getByText('This reset link is not valid')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Send a new reset link' })).toHaveAttribute('href', '/forgot-password');
    await expect(page.getByLabel('New password')).toHaveCount(0);
    await page.goto('/reset-password');
    await expect(page.getByText('This reset link is not valid')).toBeVisible();
  });

  test('a link can be used once', async ({ page }) => {
    const { email } = await createVerifiedAccount(page.request, { name: 'Once Person' });
    await page.request.post(`${API}/api/auth/sign-out`);
    await page.request.post(`${API}/api/auth/forgot-password`, { data: { email } });
    const token = await readResetToken(page.request, email);
    expect((await page.request.post(`${API}/api/auth/reset-password`, { data: { token, password: 'Brand-new-pass-1' } })).status()).toBe(200);
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await expect(page.getByText('This reset link is not valid')).toBeVisible();
  });
});
