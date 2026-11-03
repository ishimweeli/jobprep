import { expect, test } from '@playwright/test';
import { isPhone, signUpViaApi, watchErrors } from './web-helpers';

// The account screen and the "Switch to Kenya?" sheet are drawn for phones only (ChangeCountryPhone.dc).
test.describe('Web: account and change country (phone)', () => {
  test.beforeEach(({}, info) => {
    test.skip(!isPhone(info), 'account is a phone-only artboard');
  });

  test('shows name, email and exam country; the country row opens the picker', async ({ page }) => {
    const w = watchErrors(page);
    const u = await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/account/settings');
    await expect(page.getByRole('heading', { name: 'Account' }).or(page.getByText('Account', { exact: true })).first()).toBeVisible();
    await expect(page.getByText('Aline Uwase')).toBeVisible();
    await expect(page.getByText(u.email)).toBeVisible();
    await page.getByRole('link', { name: /Exam country: Rwanda/ }).click();
    await expect(page).toHaveURL(/\/choose-country$/);
    // A signed-in user's country is locked: a country that is not live only offers the (inert) notify button.
    await page.getByText('Kenya', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Notify me when Kenya opens' })).toBeVisible();
    w.expectClean();
  });

  test('a signed-in user opening another country URL is redirected to their own country', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/ke/tests');
    await expect(page).toHaveURL(/\/rw\/tests$/);
    await page.goto('/rw/pricing');
    await expect(page).toHaveURL(/\/rw\/pricing$/);
  });

  test('"Switch to Kenya?" previews what changes and only switches after confirming', async ({ page }) => {
    await signUpViaApi(page);
    // Kenya is not live in the seed data: mock the preview and the switch to exercise the live-country sheet.
    await page.route('**/api/me/country-change*', (r) =>
      r.fulfill({
        json: {
          from: { code: 'RW', name: 'Rwanda' },
          to: { code: 'KE', name: 'Kenya', status: 'LIVE', selectable: true, currencyCode: 'KES', paymentMethods: ['M-Pesa', 'Airtel Money'] },
          currentAccess: { endsAt: '2026-11-25T00:00:00.000Z', daysLeft: 23 },
          keepsResults: true,
        },
      }),
    );
    const posts: unknown[] = [];
    await page.route('**/api/me/country', async (r) => {
      posts.push(r.request().postDataJSON());
      await r.fulfill({ json: { user: {} } });
    });

    await page.goto('/account/settings?switch=KE');
    const sheet = page.getByRole('dialog', { name: 'Switch to Kenya?' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('prices in KES and M-Pesa or Airtel Money payments');
    await expect(sheet).toContainText('Your Rwanda Full Access (23 days left) only covers Rwanda tests. It keeps running and is there if you switch back.');
    await expect(sheet).toContainText('Your Rwanda results and progress are kept.');
    expect(posts).toHaveLength(0);

    await sheet.getByRole('button', { name: 'Keep Rwanda' }).click();
    await expect(sheet).toBeHidden();
    expect(posts).toHaveLength(0);

    await page.goto('/account/settings?switch=KE');
    await page.getByRole('button', { name: 'Switch to Kenya' }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({ countryCode: 'KE', confirm: true });
  });

  test('against the real API a country that is not live has no switch sheet', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/account/settings?switch=KE');
    await expect(page.getByText('Exam country')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
