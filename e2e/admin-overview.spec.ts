import { expect, test } from '@playwright/test';
import { BASE, adminApi, expectNoHorizontalScroll, isPhone, signInAs, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

const num = (t: string | null) => Number((t ?? '').replace(/[^0-9]/g, ''));

/** The dev database keeps moving (other specs sign people up), so a live number is compared with a floor, not equality. */
async function expectAtLeast(page: import('@playwright/test').Page, label: string, floor: number) {
  await expect.poll(async () => num(await page.locator('dt', { hasText: label }).locator('xpath=..').locator('dd').first().textContent())).toBeGreaterThanOrEqual(floor);
}

test.describe('Overview', () => {
  test('shows the numbers the API sends: KPIs, needs attention, chart, most-taken tests, latest payments', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    const api = await adminApi(playwright);
    const o = await (await api.get('/api/admin/overview')).json();
    await signInAs(page, playwright, 'system');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

    const kpi = (label: string) => page.locator('dt', { hasText: label }).locator('xpath=..');
    await expectAtLeast(page, 'Registered users', o.kpis.registeredUsers);
    await expect(kpi('Registered users')).toContainText(/\+[\d,]+ today/);
    await expectAtLeast(page, isPhone(info) ? 'Full Access active' : 'Full Access active now', o.kpis.fullAccessActive);
    await expect(kpi('Revenue this month')).toContainText(/RWF [\d,]+|\d+ payments? · /); // a freshly seeded database has no revenue yet
    await expectAtLeast(page, isPhone(info) ? 'Tests taken today' : 'Mock tests taken today', o.kpis.testsStartedToday);

    await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
    if (o.needsAttention.examRequests[0]) await expect(page.getByText(`“${o.needsAttention.examRequests[0].label}” requested`)).toBeVisible();
    // the design's "support requests" row has no data and is not drawn
    await expect(page.getByText(/support requests/i)).toHaveCount(0);

    const chart = page.getByRole('img', { name: /^Daily sign-ups ranged from \d[\d,]* to \d[\d,]* and payments from \d[\d,]* to \d[\d,]* over the last 14 days, (rising|falling) towards the end|staying level\.$/ });
    await expect(chart).toBeVisible();
    await expect(page.getByText('Sign-ups', { exact: true }).first()).toBeVisible(); // legend: colour is not the only cue

    if (o.topMockTests[0]) await expect(page.getByText(o.topMockTests[0].title).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Latest payments' })).toBeVisible();
    await expect(page.getByRole('link', { name: isPhone(info) ? 'All' : 'All payments' })).toHaveAttribute('href', '/admin/payments');
    await expectNoHorizontalScroll(page);
    w.expectClean();
    await api.dispose();
  });

  test('desktop: the country select drives ?country=, the search opens Users, "+ New mock test" opens the new-test form', async ({ page, playwright }, info) => {
    test.skip(isPhone(info), 'the phone Overview has no country select, search or new-test button');
    await signInAs(page, playwright, 'system');
    await page.goto('/admin');
    const select = page.getByRole('combobox', { name: 'Country' });
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toContainText(['All countries', 'Rwanda', 'Kenya (preparing)']);
    await select.selectOption('RW');
    await expect(page).toHaveURL(`${BASE}/admin?country=RW`);
    const rw = await (await page.request.get(`${BASE}/api/admin/overview?country=RW`)).json();
    await expectAtLeast(page, 'Registered users', rw.kpis.registeredUsers);
    await select.selectOption('');
    await expect(page).toHaveURL(`${BASE}/admin`);

    // formerly inert: a link to the new mock test form (A9)
    await expect(page.getByRole('link', { name: '+ New mock test' })).toHaveAttribute('href', '/admin/exams/new');

    await page.getByRole('searchbox', { name: 'Search users, emails or exams' }).fill('Aline');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${BASE}/admin/users?q=Aline`);
  });

  test('a content editor (Rwanda only) gets only Rwanda in the country select', async ({ page, playwright }, info) => {
    test.skip(isPhone(info), 'desktop only');
    await signInAs(page, playwright, 'editor');
    await page.goto('/admin');
    const select = page.getByRole('combobox', { name: 'Country' });
    await expect(select.locator('option')).toHaveText(['Rwanda']);
    await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  });
});
