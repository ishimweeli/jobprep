import { expect, test, type Page } from '@playwright/test';
import { API, isPhone, randomEmail, readOtp, watchErrors } from './web-helpers';

async function toDetailsStep(page: Page) {
  await page.goto('/sign-up');
  await expect(page.getByRole('heading', { level: 1, name: 'Which country is your exam in?' })).toBeVisible();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Rwanda' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your email address' })).toBeVisible();
}

async function fillDetails(page: Page, name: string, email: string) {
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email address').fill(email);
}

test.describe('Web: sign-up (country, email, code, job goal)', () => {
  test('full flow: sign up, verify the code, pick a job goal, land on that category', async ({ page }, info) => {
    const w = watchErrors(page);
    const email = randomEmail('signup');

    await toDetailsStep(page);
    await expect(page.getByText('+250')).toHaveCount(0); // no dial-code chip any more
    await fillDetails(page, 'Aline Uwase', `  ${email.toUpperCase()} `); // trimmed and lower-cased
    await page.getByRole('button', { name: 'Send code' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Enter the code' })).toBeVisible();
    await expect(page.getByText('Step 3 of 4')).toBeVisible();
    await expect(page.getByText(`We sent a code to ${email}`)).toBeVisible();
    // The resend button honours the API cooldown (45 s) and is disabled while it runs.
    await expect(page.getByRole('button', { name: /^Resend in 0:4\d$/ })).toBeDisabled();

    const code = await readOtp(page.request, email);
    await page.getByLabel('Digit 1').click();
    await page.keyboard.type(code);
    await page.getByRole('button', { name: 'Verify' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'What are you preparing for?' })).toBeVisible();
    await expect(page.getByText('Job categories in Rwanda. You can change this anytime.')).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(6);
    await page.getByText('Accounting & finance', { exact: true }).click();
    await page.getByRole('button', { name: 'Finish and see my Rwanda tests' }).click();

    await expect(page).toHaveURL(/\/rw\/tests\?category=accounting-finance$/);
    const me = await (await page.request.get(`${API}/api/me`)).json();
    expect(me.user).toMatchObject({ name: 'Aline Uwase', email, countryCode: 'RW' });
    expect(me.user).not.toHaveProperty('phone');
    expect(me.user.goalCategoryId).toBeTruthy();

    // Signed in: the header shows the account avatar instead of "Sign in".
    await page.goto('/rw');
    await expect(page.getByRole('button', { name: /account menu for Aline Uwase/i }).or(page.getByRole('link', { name: 'Account: Aline Uwase' }))).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);

    // Account settings (name, email, exam country) is the phone artboard; the Account tab lists it.
    if (isPhone(info)) {
      await page.goto('/account/settings');
      await expect(page.getByText('Aline Uwase')).toBeVisible();
      await expect(page.getByText(email)).toBeVisible();
      await expect(page.getByRole('link', { name: /Exam country: Rwanda/ })).toBeVisible();
    }

    // End the session through the API and check guests are sent to sign-in (coming back to the page afterwards).
    expect((await page.request.post(`${API}/api/auth/sign-out`)).status()).toBe(204);
    await page.evaluate(() => localStorage.removeItem('jobprep.session'));
    await page.goto('/account');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount$/);
    w.expectClean();
  });

  test('guest tokens in localStorage are sent with sign-up', async ({ page }) => {
    const email = randomEmail('guest');
    await page.addInitScript(() => localStorage.setItem('jobprep.guestTokens', JSON.stringify(['guest-token-0001'])));
    let body: Record<string, unknown> | null = null;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/auth/sign-up')) body = r.postDataJSON();
    });
    await toDetailsStep(page);
    await fillDetails(page, 'Guest Claimer', email);
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('Digit 1').click();
    await page.keyboard.type(await readOtp(page.request, email));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'What are you preparing for?' })).toBeVisible();
    expect(body).toMatchObject({ guestTokens: ['guest-token-0001'], countryCode: 'RW', name: 'Guest Claimer' });
  });

  test('wrong code shows friendly copy and clears the boxes', async ({ page }) => {
    const email = randomEmail('wrong');
    await toDetailsStep(page);
    await fillDetails(page, 'Wrong Code', email);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Enter the code' })).toBeVisible();
    const real = await readOtp(page.request, email);
    const wrong = real === '000000' ? '111111' : '000000';
    await page.getByLabel('Digit 1').click();
    await page.keyboard.type(wrong);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('alert')).toContainText('not right or has expired');
    await expect(page.getByLabel('Digit 1')).toHaveValue('');
  });

  test('validation: name and email are checked before a code is requested', async ({ page }) => {
    await toDetailsStep(page);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('Enter your full name (at least 2 letters).')).toBeVisible();
    await expect(page.getByText('Enter a valid email address, like name@example.com.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Your email address' })).toBeVisible();
  });

  test('an existing account is told so (no sign-in screen is designed)', async ({ page }) => {
    const email = randomEmail('exists');
    expect((await page.request.post(`${API}/api/auth/otp/request`, { data: { purpose: 'sign_up', countryCode: 'RW', email } })).status()).toBe(200);
    const code = await readOtp(page.request, email);
    expect((await page.request.post(`${API}/api/auth/sign-up`, { data: { countryCode: 'RW', email, name: 'Already Here', code } })).status()).toBe(201);
    await page.request.post(`${API}/api/auth/sign-out`);

    await toDetailsStep(page);
    await fillDetails(page, 'Already Here', email);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toContainText('already has an account');
  });

  test('rate-limit errors from the API are explained', async ({ page }) => {
    await page.route('**/api/auth/otp/request', (r) =>
      r.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { error: 'otp_cooldown', retryAfterSeconds: 30 } }),
    );
    await toDetailsStep(page);
    await fillDetails(page, 'Too Fast', randomEmail('fast'));
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toContainText('Please wait 0:30');

    await page.unroute('**/api/auth/otp/request');
    await page.route('**/api/auth/otp/request', (r) => r.fulfill({ status: 429, json: { error: 'otp_hourly_limit', retryAfterSeconds: 3600 } }));
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toContainText('too many codes');
  });

  test('back arrow returns to the previous step', async ({ page }) => {
    await toDetailsStep(page);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Which country is your exam in?' })).toBeVisible();
  });

  test('"Already have an account? Sign in" leads to the sign-in screen', async ({ page }) => {
    await toDetailsStep(page);
    await expect(page.getByText('Already have an account?')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true }).last()).toHaveAttribute('href', '/sign-in');
  });
});
