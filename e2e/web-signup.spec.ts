import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTANT_SLUG } from './web-exam-helpers';
import { API, createVerifiedAccount, expectNoHorizontalScroll, isPhone, randomEmail, readOtp, TEST_PASSWORD, typeCode, watchErrors } from './web-helpers';

/** Fill the sign-up card and press Create account. */
async function submitSignUp(page: Page, name: string, email: string, password = TEST_PASSWORD) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

test.describe('Web: sign-up (create account, check your email, setup 1/3 to 3/3)', () => {
  test('full flow: create account, verify the code, three setup steps, land on the dashboard', async ({ page }, info) => {
    const w = watchErrors(page);
    const email = randomEmail('signup');

    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
    await expect(page.getByText('Free to start. Free sample tests need no account at all.')).toBeVisible();
    await expect(page.getByText('Use 8 or more characters.')).toBeVisible();
    await expect(page.getByText('By continuing you agree to the Terms and Privacy policy.')).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0); // not from a paid test
    await expectNoHorizontalScroll(page);
    await submitSignUp(page, 'Aline Uwase', `  ${email.toUpperCase()} `); // trimmed and lower-cased

    await expect(page).toHaveURL(new RegExp(`/verify-email\\?email=${encodeURIComponent(email).replace(/\./g, '\\.')}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(`We sent a 6-digit code to ${email}.`)).toBeVisible();
    await expect(page.getByText('Check your spam folder if you don’t see it.')).toBeVisible();
    // "Send a new code" honours the API cooldown and is disabled while it runs.
    await expect(page.getByRole('button', { name: /^Send a new code in 0:/ })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Use a different email' })).toHaveAttribute('href', '/sign-up');
    await expectNoHorizontalScroll(page);
    // no session yet: the account exists but is not signed in
    expect((await page.request.get(`${API}/api/me`)).status()).toBe(401);

    await typeCode(page, await readOtp(page.request, email));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();

    // Setup 1/3
    await expect(page).toHaveURL(/\/setup\/country$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Where are you sitting your exam?' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Step 1 of 3' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Rwanda/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: /Uganda/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('radio', { name: /Uganda/ })).toContainText('Coming soon');
    await expect(page.getByText('Not listed?')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Setup 2/3
    await expect(page).toHaveURL(/\/setup\/category$/);
    await expect(page.getByRole('heading', { level: 1, name: 'What job are you preparing for?' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Step 2 of 3' })).toBeVisible();
    await expect(page.getByText('Job categories in Rwanda. We’ll show these mock tests first — you can change this anytime.')).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(6);
    await page.getByRole('radio', { name: /Accounting & finance/ }).click();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Setup 3/3
    await expect(page).toHaveURL(/\/setup\/goal$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Which position?' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Step 3 of 3' })).toBeVisible();
    await page.getByRole('button', { name: 'Secondary (S4–S6)' }).click();
    await page.getByRole('button', { name: 'Mathematics' }).click();
    await page.getByLabel('Exam date (optional)').fill('14 Dec 2030');
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Finish setup' }).click();

    await expect(page).toHaveURL(/\/rw\/progress$/);
    const me = await (await page.request.get(`${API}/api/me`)).json();
    expect(me.user).toMatchObject({ name: 'Aline Uwase', email, countryCode: 'RW', emailVerified: true, level: 'Secondary (S4–S6)', subject: 'Mathematics', examDate: '2030-12-14' });
    expect(me.user.goalCategoryId).toBeTruthy();
    expect(me.user.onboarding).toEqual({ done: true, nextStep: null });

    // Signed in: the header shows the account avatar instead of "Sign in".
    await page.goto('/rw');
    await expect(page.getByRole('button', { name: /account menu for Aline Uwase/i }).or(page.getByRole('link', { name: 'Account: Aline Uwase' }))).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);

    // Account settings (name, email) is the phone artboard; the Account tab lists it.
    if (isPhone(info)) {
      await page.goto('/account/settings');
      await expect(page.getByText('Aline Uwase')).toBeVisible();
      await expect(page.getByText(email)).toBeVisible();
    }

    // End the session through the API and check guests are sent to sign-in (coming back to the page afterwards).
    expect((await page.request.post(`${API}/api/auth/sign-out`)).status()).toBe(204);
    await page.evaluate(() => localStorage.removeItem('jobprep.session'));
    await page.goto('/account');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount$/);
    w.expectClean();
  });

  test('"Skip for now" on the last step finishes setup without choices', async ({ page }) => {
    const email = randomEmail('skip');
    await page.goto('/sign-up');
    await submitSignUp(page, 'Skip Person', email);
    await typeCode(page, await readOtp(page.request, email));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(/\/rw\/progress$/);
    const me = await (await page.request.get(`${API}/api/me`)).json();
    expect(me.user.onboarding).toEqual({ done: true, nextStep: null });
  });

  test('Back moves one setup step back; the choices are kept', async ({ page }) => {
    await createVerifiedAccount(page.request, { name: 'Back Person' });
    await page.addInitScript(() => localStorage.setItem('jobprep.session', '1'));
    await page.goto('/setup/goal'); // an earlier step is still open: goes there
    await expect(page).toHaveURL(/\/setup\/country$/);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/setup\/goal$/);
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/category$/);
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/country$/);
  });

  test('the fromPaid variant: sign-up names the test, setup says "Next: payment", and Finish continues to payment', async ({ page }) => {
    const w = watchErrors(page);
    const email = randomEmail('paid');
    const next = `/rw/checkout?test=${ACCOUNTANT_SLUG}`;
    await page.goto(`/sign-up?next=${encodeURIComponent(next)}`);
    await expect(page.getByRole('note')).toContainText(
      'After you create your account and finish setup, you’ll go straight to payment for Accountant (Public Institution) — Mock 1.',
    );
    await submitSignUp(page, 'Aline Uwase', email);
    await expect(page).toHaveURL(new RegExp(`/verify-email\\?email=.*&next=${encodeURIComponent(next)}$`));
    await typeCode(page, await readOtp(page.request, email));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/setup/country\\?next=${encodeURIComponent(next)}$`));
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/setup\/goal\?next=/);
    await expect(page.getByRole('note')).toContainText('Next: payment for Accountant (Public Institution) — Mock 1. You can change these choices later.');
    await expect(page.getByRole('button', { name: 'Finish setup' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Finish and continue to payment' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/checkout\\?test=${ACCOUNTANT_SLUG}$`));
    await expect(page.getByRole('button', { name: /^Pay RWF 2,000$/ })).toBeVisible();
    w.expectClean();
  });

  test('guest tokens in localStorage are sent with sign-up and with the code', async ({ page }) => {
    const email = randomEmail('guest');
    await page.addInitScript(() => localStorage.setItem('jobprep.guestTokens', JSON.stringify(['guest-token-0001'])));
    const bodies: Record<string, Record<string, unknown>> = {};
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/auth\/(sign-up|verify-email)$/.test(r.url())) bodies[r.url().split('/').pop()!] = r.postDataJSON();
    });
    await page.goto('/sign-up');
    await submitSignUp(page, 'Guest Claimer', email);
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    await typeCode(page, await readOtp(page.request, email));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/country$/);
    expect(bodies['sign-up']).toMatchObject({ guestTokens: ['guest-token-0001'], name: 'Guest Claimer', email });
    expect(bodies['verify-email']).toMatchObject({ guestTokens: ['guest-token-0001'], email });
  });

  test('a wrong code shows the tries left and clears the boxes; the right one still works', async ({ page }) => {
    const email = randomEmail('wrong');
    await page.goto('/sign-up');
    await submitSignUp(page, 'Wrong Code', email);
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    const real = await readOtp(page.request, email);
    const wrong = real === '000000' ? '111111' : '000000';
    await typeCode(page, wrong);
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('That code is not right');
    await expect(alert).toContainText('4 tries left.');
    await expect(page.getByLabel('Digit 1')).toHaveValue('');
    await typeCode(page, real);
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/country$/);
  });

  test('five wrong codes kill the code: "Too many tries", Verify locked until a new code is sent', async ({ page }) => {
    const email = randomEmail('dead');
    await page.goto('/sign-up');
    await submitSignUp(page, 'Dead Code', email);
    const real = await readOtp(page.request, email);
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await typeCode(page, wrong);
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    }
    await expect(page.getByRole('alert')).toContainText('Too many tries');
    await expect(page.getByRole('alert')).toContainText('Request a new code.');
    await expect(page.getByRole('button', { name: 'Verify', exact: true })).toHaveAttribute('aria-disabled', 'true');
  });

  test('validation: name, email and password are checked before anything is sent', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter your name (at least 2 letters).')).toBeVisible();
    await expect(page.getByText('Enter a valid email address, like name@example.com.')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Use 8 or more characters.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  });

  test('an existing account is told so', async ({ page }) => {
    const { email } = await createVerifiedAccount(page.request, { name: 'Already Here' });
    await page.request.post(`${API}/api/auth/sign-out`);
    await page.goto('/sign-up');
    await submitSignUp(page, 'Already Here', email);
    await expect(page.getByRole('alert')).toContainText('already has an account');
  });

  test('Continue with Google and the "or" divider are always drawn; without Google set up pressing it says so', async ({ page }) => {
    await page.route('**/api/auth/providers', (r) => r.fulfill({ json: { google: false } }));
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
    await expect(page.getByText('or', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByText('Google sign-in isn’t available yet. Use your email instead.')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test('rate-limit errors on "Send a new code" are explained and restart the countdown', async ({ page }) => {
    const email = randomEmail('limit');
    await page.goto('/sign-up');
    await submitSignUp(page, 'Too Fast', email);
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    await page.route('**/api/auth/verify-email/resend', (r) =>
      r.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { error: 'otp_cooldown', retryAfterSeconds: 30 } }),
    );
    // wait out the real cooldown by going through the (stubbed) answer: the button is enabled once the API's wait is over
    // a fresh visit (a different URL, so no history state): the resend button is enabled
    await page.goto(`/verify-email?email=${encodeURIComponent(email)}&next=%2Frw`);
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect(page.getByRole('alert')).toContainText('You can ask for another code in 0:30.');
    await expect(page.getByRole('button', { name: /^Send a new code in 0:/ })).toBeDisabled();
  });

  test('"Already have an account? Sign in" leads to the sign-in screen; Use a different email and Back lead back', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByText('Already have an account?')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in');
    await page.goto('/verify-email?email=someone%40example.test');
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
  });
});
