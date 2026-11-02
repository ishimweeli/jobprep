import { expect, test, type Page } from '@playwright/test';
import { ADMINS, BASE, expectAccessible, expectNoHorizontalScroll, mainNav, readOtp, rememberSession, watchErrors, type Role } from './admin-helpers';

test.use({ baseURL: BASE });

const national = (role: Role) => ADMINS[role].replace('+250', '');

/** Asks for a code. A code was probably asked for a moment ago (45 s wait per phone): wait it out, as a person would. */
async function askForCode(page: Page, phone: string) {
  if (!page.url().endsWith('/sign-in')) await page.goto('/sign-in');
  await page.getByLabel('Phone number').fill(phone);
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

test.describe('Admin sign-in (the candidate sign-in, admin endpoints)', () => {
  test('system admin: phone, then the 6-digit code, then the Overview; the code lifetime comes from the API', async ({ page, request }) => {
    const w = watchErrors(page);
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Enter the phone number you signed up with. We’ll text you a 6-digit code — there is no password.')).toBeVisible();
    await expect(page.getByText('ADMIN', { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page, 'admin sign-in, phone step');

    await askForCode(page, national('system'));
    // "It works for N minutes" is the API's expiresInSeconds (300 s here), never the artboard's 10.
    await expect(page.getByText(/It works for 5 minutes\./)).toBeVisible();
    await expect(page.getByText('+250 788 000 001')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Resend code in 0:/ })).toBeDisabled();
    await expectAccessible(page, 'admin sign-in, code step');

    await typeCode(page, await readOtp(request, ADMINS.system));
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL(`${BASE}/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await rememberSession(page, 'system');
    w.expectClean();
  });

  test('content editor signs in and lands on the Overview with the editor navigation', async ({ page, request }) => {
    await page.context().clearCookies();
    await askForCode(page, national('editor'));
    await typeCode(page, await readOtp(request, ADMINS.editor));
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL(`${BASE}/`);
    await expect(mainNav(page).getByRole('link')).toHaveCount(2);
    await rememberSession(page, 'editor');
  });

  test('support: a wrong code says how many tries are left, the right one still works', async ({ page, request }) => {
    await page.context().clearCookies();
    await askForCode(page, national('support'));
    await typeCode(page, '000000');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('That code is not right');
    await expect(alert).toContainText('Check the SMS and try again. 4 tries left.');
    await typeCode(page, '000000');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(alert).toContainText('3 tries left.');
    await typeCode(page, await readOtp(request, ADMINS.support));
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL(`${BASE}/`);
    await rememberSession(page, 'support');
  });

  test('a number that is not an admin gets the same answer and no code exists for it', async ({ page, request }) => {
    await page.context().clearCookies();
    const stranger = String(788000000 + 100000 + Math.floor(Math.random() * 800000)); // not an admin
    await askForCode(page, stranger);
    await expect(page.getByText(/has a JobPrep account, a code is on its way by SMS/)).toBeVisible();
    const probe = await request.get(`${BASE}/api/test/otp`, { params: { phone: `+250${stranger}` } });
    expect(probe.status()).toBe(404);
  });

  test('an invalid number is an inline message; a signed-out visit to a page goes to sign-in and keeps where it was going', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await page.getByLabel('Phone number').fill('78812');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a 9-digit Rwanda number, like 788 123 456.');
    await page.goto('/users?filter=expired');
    await expect(page).toHaveURL(`${BASE}/sign-in?next=${encodeURIComponent('/users?filter=expired')}`);
  });
});
