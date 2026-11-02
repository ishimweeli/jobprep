import { expect, test } from '@playwright/test';
import { API, expectNoHorizontalScroll, isPhone, watchErrors } from './web-helpers';

test.describe('Web: landing (data-driven from /api/countries/rw/landing)', () => {
  test('renders the headline, categories, featured tests, steps, recently added, pricing and disclaimer from the API', async ({ page, request }) => {
    const w = watchErrors(page);
    const landing = await (await request.get(`${API}/api/countries/rw/landing`)).json();
    await page.goto('/rw');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Practice Smarter\.\s*Pass with Confidence\./);
    await expect(page.getByLabel('Which job exam are you preparing for?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find Mock Tests' })).toBeVisible();

    // Popular chips come from the API (visible copy: one of the two layouts).
    for (const p of landing.popularSearches) {
      await expect(page.getByRole('link', { name: p, exact: true }).first()).toBeVisible();
    }

    // Six category cards, Teaching first and highlighted.
    const cats = page.getByRole('region', { name: 'Browse by job category' }).locator('a[href*="category="]');
    await expect(cats).toHaveCount(landing.categories.length);
    await expect(cats.first()).toContainText('Teaching positions');
    await expect(cats.first()).toContainText(/most practised/i);

    // Featured teacher tests + View test.
    await expect(page.getByRole('region', { name: /mock tests/i }).getByRole('link', { name: /^View test/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How JobPrep works' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recently added' })).toBeVisible();

    // Price and disclaimer are never hardcoded: they match the API.
    const pricing = page.getByRole('region', { name: /pricing/i });
    await expect(pricing).toContainText(landing.plan.priceLabel);
    await expect(pricing).toContainText(`${landing.plan.durationDays} days`);
    await expect(page.getByTestId('disclaimer')).toHaveText(landing.country.disclaimer);

    await expectNoHorizontalScroll(page);
    w.expectClean();
  });

  test('search goes to the catalog with the query', async ({ page }) => {
    await page.goto('/rw');
    await page.getByLabel('Which job exam are you preparing for?').fill('Accountant');
    await page.getByRole('button', { name: 'Find Mock Tests' }).click();
    await expect(page).toHaveURL(/\/rw\/tests\?q=Accountant$/);
    await expect(page.getByRole('searchbox')).toHaveValue('Accountant');
    await expect(page.getByRole('article').first()).toContainText('Accountant');
  });

  test('a popular-search chip opens the catalog for that search', async ({ page, request }) => {
    const landing = await (await request.get(`${API}/api/countries/rw/landing`)).json();
    const first = landing.popularSearches[0] as string;
    await page.goto('/rw');
    await page.getByRole('link', { name: first, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/rw/tests\\?q=${encodeURIComponent(first).replace(/[()]/g, '\\$&')}`));
  });

  test('category card and View test link navigate', async ({ page }) => {
    await page.goto('/rw');
    await page.getByRole('region', { name: 'Browse by job category' }).getByRole('link', { name: /Procurement/ }).click();
    await expect(page).toHaveURL(/\/rw\/tests\?category=procurement/);
  });

  test('"/" redirects to the remembered country and Sign in leads to the sign-up screen', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/rw$/);
    await page.getByRole('link', { name: 'Sign in' }).first().click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByRole('heading', { name: 'Which country is your exam in?' })).toBeVisible();
  });

  test('desktop header nav, phone header chip and menu button (as drawn)', async ({ page }, info) => {
    await page.goto('/rw');
    if (isPhone(info)) {
      await expect(page.getByRole('link', { name: /Country: .*Change country/ })).toContainText('RWF');
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    } else {
      const nav = page.getByRole('navigation', { name: 'Main' });
      await expect(nav.getByRole('link', { name: 'Mock tests' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Teaching exams' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Pricing' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'My progress' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Country: .*Change country/ })).toContainText('Rwanda · RWF');
      await expect(page.getByRole('link', { name: 'Try a free test' })).toBeVisible();
    }
  });

  test('no horizontal scroll at 360px wide', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone check');
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ['/rw', '/rw/tests', '/rw/pricing', '/rw/tests/secondary-mathematics-teacher-s1-s3-mock-1', '/sign-up', '/choose-country']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }
  });

  test('API down: landing shows the designed error state and recovers on Try again', async ({ page }) => {
    await page.route('**/api/countries/rw/landing', (r) => r.abort());
    await page.goto('/rw');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('We could not load the mock tests');
    await page.unroute('**/api/countries/rw/landing');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Browse by job category' })).toBeVisible();
  });
});
