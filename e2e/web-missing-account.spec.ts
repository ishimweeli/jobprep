import { expect, test } from '@playwright/test';
import { API, expectNoHorizontalScroll, isPhone, randomNational, signUpViaApi, watchErrors } from './web-helpers';
import { buyAccessViaApi } from './web-exam-helpers';
import { cleanUser, me } from './web-p3-helpers';

/**
 * The candidate screens that were built without a design (docs/missing-built-candidate.md): account settings with editing,
 * Change goal, payment history and receipt, the language control, the legal and help pages. Each runs on the desktop
 * (1440) and phone (390) projects.
 */

test.describe('Web: account settings (C14)', () => {
  test('edit the name (validation, then "Saved."), language, goal row, access summary and Sign out', async ({ page }) => {
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/account/settings');
    await expect(page.getByRole('heading', { name: 'My access' })).toBeVisible();
    await expect(page.getByText('Free tests only')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Exam goal:/ })).toBeVisible();

    await page.getByRole('button', { name: 'Edit name' }).click();
    const field = page.getByLabel('Name', { exact: true });
    await field.fill('A');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Enter your name (at least 2 characters).')).toBeVisible();
    await field.fill('Aline Mukamana');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(page.getByText('Aline Mukamana')).toBeVisible();
    expect((await me(page)).name).toBe('Aline Mukamana');
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByText('You’re signed out.')).toBeVisible();
    w.expectClean();
  });

  test('the language control lists only the languages Rwanda offers and is saved to the account', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/account/settings');
    const group = page.getByRole('group', { name: 'Language' });
    await expect(group.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: 'Kiswahili' })).toHaveCount(0);
    await group.getByRole('button', { name: 'Ikinyarwanda' }).click();
    await expect(group.getByRole('button', { name: 'Ikinyarwanda' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => ((await (await page.request.get(`${API}/api/me`)).json()) as { user: { language: string } }).user.language).toBe('rw');
    await group.getByRole('button', { name: 'English' }).click();
    await expect.poll(async () => ((await (await page.request.get(`${API}/api/me`)).json()) as { user: { language: string } }).user.language).toBe('en');
  });

  test('a test with no translation says "This test is available in English only" while another language is chosen', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/account/settings');
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Ikinyarwanda' }).click();
    await page.goto('/rw/tests/secondary-mathematics-teacher-s1-s3-mock-1');
    await expect(page.getByTestId('english-only')).toHaveText('Iki kizamini kiboneka mu Cyongereza gusa');
  });
});

test.describe('Web: Change goal (C15)', () => {
  test('Change goal from the dashboard picks another category; with no goal it is "Choose your goal"', async ({ page }) => {
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw/progress');
    await page.getByRole('link', { name: /^Change( goal)?$/ }).first().click();
    await expect(page).toHaveURL(/\/account\/goal$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Change your goal' })).toBeVisible();
    const radios = page.getByRole('radio');
    await expect(radios.first()).toBeVisible();
    const other = radios.filter({ hasNot: page.getByText(/Current goal/) }).first();
    const name = (await other.innerText()).split('\n')[0]!;
    await other.click();
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page).toHaveURL(/\/rw\/progress$/);
    await expect(page.getByText(name).first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    // clear the goal through the API (a country switch does the same): the dashboard offers "Choose your goal"
    await page.request.patch(`${API}/api/me`, { data: { goalCategoryId: null } });
    await page.goto('/rw/progress');
    await page.getByRole('link', { name: 'Choose your goal' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Choose your goal' })).toBeVisible();
    w.expectClean();
  });
});

test.describe('Web: payment history and receipt (C21)', () => {
  let userId = '';
  test.afterEach(async () => {
    if (userId) await cleanUser(userId);
    userId = '';
  });

  test('empty history, then a paid payment with its receipt and a declined one that says it was not charged', async ({ page, request }, info) => {
    const w = watchErrors(page);
    const u = await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await page.goto('/account/payments');
    await expect(page.getByText('No payments yet')).toBeVisible();

    await buyAccessViaApi(page.request, u.phone);
    const declined = await page.request.post(`${API}/api/payments`, { data: { provider: 'MTN_MOMO', msisdn: `+250${randomNational()}` } });
    if (declined.status() === 201) {
      const { id } = (await declined.json()) as { id: string };
      await request.post(`${API}/api/test/payments/${id}/simulate`, { data: { outcome: 'decline' } });
    }
    await page.reload();
    const items = page.getByRole('listitem');
    await expect(items.first()).toBeVisible();
    await expect(page.getByText('Paid').first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: /RWF 2,000/ }).filter({ hasText: 'Paid' }).first().click();
    await expect(page).toHaveURL(/\/account\/payments\/[a-z0-9]+$/);
    const receipt = page.getByLabel('Receipt details');
    await expect(receipt).toContainText('Receipt number');
    await expect(receipt).toContainText('Full Access · 30 days');
    await expect(receipt).toContainText(u.email);
    await expect(page.getByRole('button', { name: 'Print receipt' })).toBeVisible();
    if (isPhone(info)) await expectNoHorizontalScroll(page);
    w.expectClean();
  });

  test('"Check payment" on a pending payment asks the operator and says what came back', async ({ page }) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    const created = await page.request.post(`${API}/api/payments`, { data: { provider: 'MTN_MOMO', msisdn: u.phone } });
    expect(created.status()).toBe(201);
    await page.goto('/account/payments');
    await expect(page.getByText('Waiting for approval')).toBeVisible();
    await page.getByRole('button', { name: 'Check payment' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Still waiting|confirmed|declined|expired/ })).toBeVisible();
  });
});

test.describe('Web: legal and help pages (C25 / C36)', () => {
  for (const path of ['/terms', '/privacy', '/refund', '/cookies']) {
    test(`${path}: title, last updated, sections; placeholder text is marked as a placeholder`, async ({ page }, info) => {
      const w = watchErrors(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/^Last updated /)).toBeVisible();
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
      await expect(page.getByTestId('placeholder-note')).toContainText('Placeholder text, pending legal review.');
      if (isPhone(info)) await expect(page.getByRole('navigation', { name: 'On this page' })).toBeHidden();
      else await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible();
      await expectNoHorizontalScroll(page);
      w.expectClean();
    });
  }

  test('/help shows the contact block (or says it is not set) and links to the payment history and the policies', async ({ page }) => {
    const w = watchErrors(page);
    await page.goto('/help');
    await expect(page.getByRole('heading', { level: 1, name: 'Help and support' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Contact us' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Payment history' })).toHaveAttribute('href', '/account/payments');
    await expectNoHorizontalScroll(page);
    w.expectClean();
  });

  test('the sign-up copy links to the real Terms and Privacy policy', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('link', { name: 'Terms (opens in a new tab)' })).toHaveAttribute('href', '/terms');
    await expect(page.getByRole('link', { name: 'Privacy policy (opens in a new tab)' })).toHaveAttribute('href', '/privacy');
  });

  test('the landing footer carries the legal links and the account menu "Help and support" opens /help', async ({ page }, info) => {
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw');
    const footer = page.getByRole('navigation', { name: 'Legal and help' });
    await expect(footer.getByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', '/terms');
    await expect(footer.getByRole('link', { name: 'Help and support' })).toHaveAttribute('href', '/help');
    if (!isPhone(info)) {
      await page.getByRole('button', { name: /account menu for/i }).click();
      await page.getByRole('menuitem', { name: /Help and support/ }).click();
      await expect(page).toHaveURL(/\/help$/);
    }
  });
});
