import { expect, test, type Page } from '@playwright/test';
import { API, isPhone, randomNational, readOtp, watchErrors } from './web-helpers';

async function toDetailsStep(page: Page) {
  await page.goto('/sign-up');
  await expect(page.getByRole('heading', { level: 1, name: 'Which country is your exam in?' })).toBeVisible();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Rwanda' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your phone number' })).toBeVisible();
}

async function fillDetails(page: Page, name: string, national: string) {
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Phone number').fill(national);
}

test.describe('Web: sign-up (country, phone, code, job goal)', () => {
  test('full flow: sign up, verify the code, pick a job goal, land on that category', async ({ page }, info) => {
    const w = watchErrors(page);
    const national = randomNational();
    const phone = `+250${national}`;

    await toDetailsStep(page);
    await expect(page.getByText('+250')).toBeVisible();
    await fillDetails(page, 'Aline Uwase', national);
    await page.getByRole('button', { name: 'Send code' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Enter the code' })).toBeVisible();
    await expect(page.getByText('Step 3 of 4')).toBeVisible();
    await expect(page.getByText(/Sent by SMS to \+250 789 \d{3} \d{3}/)).toBeVisible();
    // The resend button honours the API cooldown (45 s) and is disabled while it runs.
    await expect(page.getByRole('button', { name: /^Resend in 0:4\d$/ })).toBeDisabled();

    const code = await readOtp(page.request, phone);
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
    expect(me.user).toMatchObject({ name: 'Aline Uwase', phone, countryCode: 'RW' });
    expect(me.user.goalCategoryId).toBeTruthy();

    // Signed in: the header shows the account avatar instead of "Sign in".
    await page.goto('/rw');
    await expect(page.getByRole('img', { name: 'Account: Aline Uwase' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);

    // The account screen is drawn for phones only.
    if (isPhone(info)) {
      await page.goto('/account');
      await expect(page.getByText('Aline Uwase')).toBeVisible();
      await expect(page.getByText(`+250 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`)).toBeVisible();
      await expect(page.getByRole('link', { name: /Exam country: Rwanda/ })).toBeVisible();
    }

    // No sign-out screen is designed: end the session through the API and check guests are sent to sign-up.
    expect((await page.request.post(`${API}/api/auth/sign-out`)).status()).toBe(204);
    await page.evaluate(() => localStorage.removeItem('jobprep.session'));
    await page.goto('/account');
    await expect(page).toHaveURL(/\/sign-up$/);
    w.expectClean();
  });

  test('guest tokens in localStorage are sent with sign-up', async ({ page }) => {
    const national = randomNational();
    await page.addInitScript(() => localStorage.setItem('jobprep.guestTokens', JSON.stringify(['guest-token-0001'])));
    let body: Record<string, unknown> | null = null;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/auth/sign-up')) body = r.postDataJSON();
    });
    await toDetailsStep(page);
    await fillDetails(page, 'Guest Claimer', national);
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('Digit 1').click();
    await page.keyboard.type(await readOtp(page.request, `+250${national}`));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'What are you preparing for?' })).toBeVisible();
    expect(body).toMatchObject({ guestTokens: ['guest-token-0001'], countryCode: 'RW', name: 'Guest Claimer' });
  });

  test('wrong code shows friendly copy and clears the boxes', async ({ page }) => {
    const national = randomNational();
    await toDetailsStep(page);
    await fillDetails(page, 'Wrong Code', national);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Enter the code' })).toBeVisible();
    const real = await readOtp(page.request, `+250${national}`);
    const wrong = real === '000000' ? '111111' : '000000';
    await page.getByLabel('Digit 1').click();
    await page.keyboard.type(wrong);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('alert')).toContainText('not right or has expired');
    await expect(page.getByLabel('Digit 1')).toHaveValue('');
  });

  test('validation: name and phone are checked before a code is requested', async ({ page }) => {
    await toDetailsStep(page);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('Enter your full name (at least 2 letters).')).toBeVisible();
    await expect(page.getByText(/does not look right/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Your phone number' })).toBeVisible();
  });

  test('an existing account is told so (no sign-in screen is designed)', async ({ page }) => {
    const national = randomNational();
    const phone = `+250${national}`;
    expect((await page.request.post(`${API}/api/auth/otp/request`, { data: { purpose: 'sign_up', countryCode: 'RW', phone } })).status()).toBe(200);
    const code = await readOtp(page.request, phone);
    expect((await page.request.post(`${API}/api/auth/sign-up`, { data: { countryCode: 'RW', phone, name: 'Already Here', code } })).status()).toBe(201);
    await page.request.post(`${API}/api/auth/sign-out`);

    await toDetailsStep(page);
    await fillDetails(page, 'Already Here', national);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toContainText('already has an account');
  });

  test('rate-limit errors from the API are explained', async ({ page }) => {
    await page.route('**/api/auth/otp/request', (r) =>
      r.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { error: 'otp_cooldown', retryAfterSeconds: 30 } }),
    );
    await toDetailsStep(page);
    await fillDetails(page, 'Too Fast', randomNational());
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

  test('"Already have an account? Sign in" is drawn but inert (no sign-in screen is designed)', async ({ page }) => {
    await toDetailsStep(page);
    await expect(page.getByText('Already have an account?')).toBeVisible();
    await expect(page.getByText('Sign in', { exact: true })).toHaveAttribute('aria-disabled', 'true');
  });
});
