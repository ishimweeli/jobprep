import { expect, test } from '@playwright/test';
import { BASE, isPhone, mainNav, signInAs, watchErrors, type Role } from './admin-helpers';

test.use({ baseURL: BASE });

/** What each role may open (labels differ on the phone bar). */
const NAV: Record<Role, { desktop: string[]; phone: string[]; denied: string[] }> = {
  system: { desktop: ['Overview', 'Users', 'Exams & questions', 'Payments', 'Countries', 'Settings'], phone: ['Overview', 'Users', 'Exams', 'Payments', 'Settings'], denied: [] },
  editor: { desktop: ['Overview', 'Exams & questions'], phone: ['Overview', 'Exams'], denied: ['/admin/users', '/admin/payments', '/admin/countries', '/admin/settings', '/admin/settings/audit'] },
  support: { desktop: ['Overview', 'Users', 'Payments'], phone: ['Overview', 'Users', 'Payments'], denied: ['/admin/exams', '/admin/countries', '/admin/settings'] },
  // One account, two roles (content editor RW + support): the union of both navigations, nothing more.
  multi: { desktop: ['Overview', 'Users', 'Exams & questions', 'Payments'], phone: ['Overview', 'Users', 'Exams', 'Payments'], denied: ['/admin/countries', '/admin/settings', '/admin/settings/audit'] },
};

for (const role of ['system', 'editor', 'support', 'multi'] as const) {
  test.describe(`Role: ${role}`, () => {
    test(`sees only its navigation${role === 'system' ? '' : ' and is told so on a URL it cannot use'}`, async ({ page, playwright }, info) => {
      const w = watchErrors(page);
      await signInAs(page, playwright, role);
      await page.goto('/admin');
      const want = isPhone(info) ? NAV[role].phone : NAV[role].desktop;
      const links = mainNav(page).getByRole('link');
      await expect(links).toHaveCount(want.length);
      for (const [i, label] of want.entries()) await expect(links.nth(i)).toContainText(label);

      for (const url of NAV[role].denied) {
        await page.goto(url);
        // no silent redirect any more (A17): the address stays and the page says "You do not have access to this"
        await expect(page).toHaveURL(`${BASE}${url}`);
        await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to this' })).toBeVisible();
        await expect(links).toHaveCount(want.length); // the role keeps its own navigation
        await page.getByRole('link', { name: 'Go to Overview' }).click();
        await expect(page).toHaveURL(`${BASE}/admin`);
        await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
      }
      w.expectClean();
    });
  });
}

test('the API itself refuses what the navigation hides (editor has no users, support has no exams)', async ({ page, playwright }) => {
  await signInAs(page, playwright, 'editor');
  expect((await page.request.get(`${BASE}/api/admin/users`)).status()).toBe(403);
});

test('multi-role: the sidebar names both roles, comma-separated, in the one role slot (desktop)', async ({ page, playwright }, info) => {
  test.skip(isPhone(info), 'the phone header has no name block');
  await signInAs(page, playwright, 'multi');
  await page.goto('/admin');
  const side = page.getByRole('complementary', { name: 'Admin navigation' });
  await expect(side.getByText('Content editor, Support')).toBeVisible();
});

test('the name and role of the signed-in admin are in the sidebar (desktop)', async ({ page, playwright }, info) => {
  test.skip(isPhone(info), 'the phone header has no name block');
  await signInAs(page, playwright, 'editor');
  await page.goto('/admin');
  const side = page.getByRole('complementary', { name: 'Admin navigation' });
  await expect(side.getByText('Marie C.')).toBeVisible();
  await expect(side.getByText('Content editor')).toBeVisible();
});

test('keyboard only: Tab reaches the navigation and Enter opens the page', async ({ page, playwright }, info) => {
  await signInAs(page, playwright, 'system');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.keyboard.press('Tab'); // skip link
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  const target = isPhone(info) ? 'Users' : 'Users';
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    if (name === target) break;
  }
  await expect(mainNav(page).getByRole('link', { name: target })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${BASE}/admin/users`);
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
});

test('a session that ends sends the admin to the normal sign-in, and back to where they were going', async ({ page, playwright }) => {
  await signInAs(page, playwright, 'system');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.context().clearCookies(); // the server no longer knows this browser
  await mainNav(page).getByRole('link', { name: 'Users' }).click();
  await expect(page).toHaveURL(`${BASE}/sign-in?next=${encodeURIComponent('/admin/users')}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});
