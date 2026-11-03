import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, isPhone, signUpViaApi, watchErrors } from './web-helpers';

/** Kenya is not live in the seed: serve the country list with Kenya live (and its payment methods) to exercise the switch. */
async function kenyaLive(page: Page) {
  await page.route('**/api/countries', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { countries: { code: string; status: string; selectable: boolean }[] };
    for (const c of body.countries) if (c.code === 'KE') Object.assign(c, { status: 'LIVE', selectable: true });
    await route.fulfill({ response: res, json: body });
  });
  await page.route('**/api/countries/ke', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: { ...body, status: 'LIVE', paymentMethods: [{ provider: 'MPESA', label: 'M-Pesa' }, { provider: 'AIRTEL_MONEY', label: 'Airtel Money' }] } });
  });
}

// The account settings screen is drawn for phones only (ChangeCountryPhone.dc earlier); Change exam country has both layouts.
test.describe('Web: account settings (phone)', () => {
  test.beforeEach(({}, info) => {
    test.skip(!isPhone(info), 'account settings is a phone-only artboard');
  });

  test('shows name and email; the country row opens Change exam country', async ({ page }) => {
    const w = watchErrors(page);
    const u = await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/account/settings');
    await expect(page.getByText('Aline Uwase')).toBeVisible();
    await expect(page.getByText(u.email)).toBeVisible();
    await page.getByRole('link', { name: /Exam country: Rwanda/ }).click();
    await expect(page).toHaveURL(/\/account\/country$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Change exam country' })).toBeVisible();
    w.expectClean();
  });
});

test.describe('Web: Change exam country (ChangeCountry.dc)', () => {
  test('the account menu / Account tab row opens it; only Rwanda is live, so there is nothing to switch to', async ({ page }, info) => {
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw/progress');
    if (isPhone(info)) {
      await page.goto('/account');
      await page.getByRole('link', { name: /Exam country/ }).click();
    } else {
      await page.getByRole('button', { name: /account menu for/i }).click();
      await page.getByRole('menuitem', { name: /Exam country/ }).click();
    }
    await expect(page).toHaveURL(/\/account\/country$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Change exam country' })).toBeVisible();
    await expect(page.getByText('Everything you see will switch to the new country: mock tests, prices, payment methods and language.')).toBeVisible();
    await expect(page.getByRole('radio', { name: /Rwanda/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: /Rwanda/ })).toContainText('Current');
    await expect(page.getByRole('radio', { name: /Uganda/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: 'Choose a different country' })).toBeDisabled();
    await expectNoHorizontalScroll(page);
    await page.getByRole('link', { name: 'Keep Rwanda' }).click();
    await expect(page).toHaveURL(/\/rw\/progress$/);
    w.expectClean();
  });

  test('with Kenya live: the explainer, then Switch to Kenya saves the country and continues at setup step 2', async ({ page }) => {
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    await kenyaLive(page);
    // Kenya is not live in the seed, so the API would refuse the switch: answer it here and check what the screen sends.
    const patches: unknown[] = [];
    await page.route('**/api/me/onboarding', async (r) => {
      patches.push(r.request().postDataJSON());
      const me = (await (await page.request.get('/api/me')).json()) as { user: unknown };
      await r.fulfill({ json: { user: me.user } });
    });
    await page.goto('/account/country');
    await expect(page.getByRole('radio', { name: /Kenya/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('If you switch to Kenya')).toBeVisible();
    await expect(page.getByText('You’ll see only Kenya mock tests, prices in KES and M-Pesa or Airtel Money.')).toBeVisible();
    await expect(page.getByText('Your Rwanda results stay in your history. Your job goal is cleared, so you’ll choose one for Kenya next.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Switch to Kenya' }).click();
    await expect(page).toHaveURL(/\/setup\/category$/);
    await expect(page.getByRole('heading', { level: 1, name: 'What job are you preparing for?' })).toBeVisible();
    expect(patches).toEqual([{ countryCode: 'KE' }]);
    w.expectClean();
  });

  test('a signed-in user opening another country URL is redirected to their own country', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/ke/tests');
    await expect(page).toHaveURL(/\/rw\/tests$/);
    await page.goto('/rw/pricing');
    await expect(page).toHaveURL(/\/rw\/pricing$/);
  });

  test('a guest is sent to sign-in and comes back', async ({ page }) => {
    await page.goto('/account/country');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount%2Fcountry$/);
  });
});
