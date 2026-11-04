import { expect, test, type Page } from '@playwright/test';
import { API, isPhone, watchErrors } from './web-helpers';

const count = (page: Page) => page.getByTestId('result-count');

/** Desktop: sidebar radio. Phone: open the Filters sheet, pick, close with "Show N results". */
async function pickFilter(page: Page, phone: boolean, option: string) {
  if (phone) {
    await page.getByRole('button', { name: /^Filters/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Filters' });
    await dialog.getByText(option, { exact: true }).click();
    await dialog.getByRole('button', { name: /^Show \d+ results$/ }).click();
    await expect(dialog).toBeHidden();
  } else {
    await page.getByRole('complementary', { name: 'Filters' }).getByText(option, { exact: true }).click();
  }
}

test.describe('Web: exam discovery', () => {
  test('lists the country catalog with category, tag, questions, minutes, language, difficulty and one View test action', async ({ page, request }) => {
    const w = watchErrors(page);
    const api = await (await request.get(`${API}/api/countries/rw/mock-tests`, { params: { pageSize: 50 } })).json();
    await page.goto('/rw/tests');
    await expect(page.getByRole('heading', { level: 1, name: 'Find your mock test' })).toBeVisible();
    await expect(count(page)).toContainText(`${api.total} mock tests`);

    const first = page.getByRole('article').first();
    const t = api.results[0];
    await expect(first.getByRole('heading')).toHaveText(t.title);
    await expect(first).toContainText(t.category.name);
    await expect(first).toContainText(`${t.questionCount} question`);
    await expect(first).toContainText(`${t.durationMinutes} min`);
    await expect(first).toContainText(t.isFree ? 'Free' : 'Full Access');
    await expect(first.getByRole('link', { name: /^View test/ })).toHaveCount(1);
    await expect(page.getByRole('article')).toHaveCount(api.results.length);
    w.expectClean();
  });

  test('search narrows results and is kept in the URL', async ({ page }) => {
    await page.goto('/rw/tests');
    await page.getByRole('searchbox').fill('Accountant');
    await expect(page).toHaveURL(/q=Accountant/);
    await expect(count(page)).toContainText(/\d+ mock tests?/);
    // the list is replaced after the debounce and the request: wait until every card is an Accountant test
    await expect
      .poll(async () => {
        const titles = await page.getByRole('article').getByRole('heading').allTextContents();
        return titles.length > 0 && titles.every((t) => t.toLowerCase().includes('accountant'));
      })
      .toBe(true);
  });

  test('category chips filter and toggle back to All', async ({ page }) => {
    await page.goto('/rw/tests');
    const group = page.getByRole('group', { name: 'Job category' }).filter({ has: page.getByRole('button', { name: 'Procurement' }) });
    await group.getByRole('button', { name: 'Procurement' }).click();
    await expect(page).toHaveURL(/category=procurement/);
    await expect(group.getByRole('button', { name: 'Procurement' })).toHaveAttribute('aria-pressed', 'true');
    for (const label of await page.getByRole('article').locator('span:text-is("Procurement")').allTextContents()) expect(label).toBe('Procurement');
    await group.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page).not.toHaveURL(/category=/);
  });

  test('price and difficulty filters apply and sync to the query string', async ({ page }, info) => {
    const phone = isPhone(info);
    await page.goto('/rw/tests');
    await pickFilter(page, phone, phone ? 'Free' : 'Free only');
    await expect(page).toHaveURL(/price=free/);
    await expect(page.getByRole('article').filter({ hasText: 'Full Access' })).toHaveCount(0);
    await expect(page.getByRole('article').first()).toContainText('Free');

    await pickFilter(page, phone, 'Foundation');
    await expect(page).toHaveURL(/difficulty=FOUNDATION/);
    await expect(page.getByRole('article').filter({ hasNotText: 'Foundation' })).toHaveCount(0);
await expect(page.getByRole('article').first()).toContainText('Foundation');

    // Reload keeps the filters (state lives in the URL).
    await page.reload();
    await expect(page).toHaveURL(/price=free/);
    if (phone) await expect(page.getByRole('button', { name: 'Filters (2)' })).toBeVisible();
    else await expect(page.getByRole('radio', { name: 'Free only' })).toBeChecked();
  });

  test('URL filters are applied on load', async ({ page }, info) => {
    await page.goto('/rw/tests?price=paid&difficulty=CHALLENGING');
    for (const art of await page.getByRole('article').all()) {
      await expect(art).toContainText('Full Access');
      await expect(art).toContainText('Challenging');
    }
    if (isPhone(info)) await expect(page.getByRole('button', { name: 'Filters (2)' })).toBeVisible();
  });

  test('empty state offers Request this exam (button only) and Clear search', async ({ page }) => {
    await page.goto('/rw/tests?q=Veterinary%20officer');
    await expect(page.getByText('No mock tests match “Veterinary officer” yet')).toBeVisible();
    await expect(count(page)).toContainText('0 mock tests');
    // The button opens the request dialog (web-missing-flows.spec.ts covers the form).
    await expect(page.getByRole('button', { name: 'Request this exam' })).toHaveAttribute('aria-haspopup', 'dialog');
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByRole('article').first()).toBeVisible();
  });

  test('loading skeleton, then an error with Try again when the API fails', async ({ page }) => {
    let fail = true;
    await page.route('**/api/countries/rw/mock-tests*', async (route) => {
      if (fail) await route.abort();
      else await route.continue();
    });
    await page.goto('/rw/tests');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('We could not load the mock tests');
    fail = false;
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('article').first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('View test opens the exam details', async ({ page }) => {
    await page.goto('/rw/tests');
    const first = page.getByRole('article').first();
    const title = await first.getByRole('heading').textContent();
    await first.getByRole('link', { name: /^View test/ }).click({ position: { x: 5, y: 5 } });
    await expect(page).toHaveURL(/\/rw\/tests\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title!);
  });
});
