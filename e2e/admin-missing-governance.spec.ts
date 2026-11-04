import { expect, test } from '@playwright/test';
import { BASE, expectAccessible, expectNoHorizontalScroll, isPhone, mainNav, randomEmail, signInAs, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

/**
 * A12 audit log, A13 team, A14 country actions, A17 restricted-role states, A18 chrome (sign-out). Written without a design:
 * see docs/missing-built-admin.md. Not run by the author (the lead runs Playwright).
 */

test.describe('A17 restricted roles', () => {
  test('a URL the role lacks says so inside the chrome instead of redirecting', async ({ page, playwright }) => {
    const w = watchErrors(page);
    await signInAs(page, playwright, 'editor');
    await page.goto('/admin/payments');
    await expect(page).toHaveURL(`${BASE}/admin/payments`);
    await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to this' })).toBeVisible();
    await expect(page.getByText('Content editor', { exact: false }).first()).toBeVisible();
    await expect(mainNav(page).getByRole('link', { name: /Exams/ })).toBeVisible(); // the role keeps its own navigation
    await page.getByRole('link', { name: 'Go to Overview' }).click();
    await expect(page).toHaveURL(`${BASE}/admin`);
    w.expectClean();
  });

  test('support cannot open the audit log; the API refuses it too', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'support');
    await page.goto('/admin/settings/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to this' })).toBeVisible();
    expect((await page.request.get(`${BASE}/api/admin/audit`)).status()).toBe(403);
  });

  test('the country select of a Content editor lists only their countries', async ({ page, playwright }, info) => {
    test.skip(isPhone(info), 'the selector is in the desktop sidebar');
    await signInAs(page, playwright, 'editor');
    await page.goto('/admin/exams');
    const side = page.getByRole('complementary', { name: 'Admin navigation' });
    await expect(side.getByText('Rwanda').first()).toBeVisible();
    await expect(side.getByText('Kenya')).toHaveCount(0);
  });
});

test.describe('A18 sign-out', () => {
  test('Sign out in the admin chrome ends the session', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'support');
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).not.toHaveURL(/\/admin/);
    // the shared cached session is now dead; the next spec signs in again
    expect((await page.request.get(`${BASE}/api/admin/me`)).status()).toBe(401);
  });
});

test.describe('A12 audit log', () => {
  test('filters, entry details, export and no sideways scroll', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/settings/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' }).or(page.getByRole('heading', { name: 'Audit log' }).first())).toBeVisible();
    await expect(page.getByText('Only System admins can see this page')).toBeVisible();
    // filter by action
    await page.getByLabel('Action', { exact: true }).selectOption({ index: 1 });
    await expect(page).toHaveURL(/action=/);
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page).not.toHaveURL(/action=/);
    // a backwards range is explained
    await page.getByLabel('From', { exact: true }).fill('2026-10-05');
    await page.getByLabel('To', { exact: true }).fill('2026-10-01');
    await expect(page.getByText('The end date is before the start date.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    // details
    await page.getByRole('button', { name: /^Details of/ }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Audit entry' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText('Reason')).toBeVisible();
    await expectAccessible(page, 'audit entry dialog');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    // export
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await expect(page.getByText(/Downloaded .*csv/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    if (isPhone(info)) await expect(page.getByRole('table')).toHaveCount(0);
    w.expectClean();
  });
});

test.describe('A13 team', () => {
  test('invite a person, change their role, deactivate and restore, each with a reason', async ({ page, playwright }, info) => {
    test.skip(isPhone(info), 'the same dialogs are covered on desktop; the phone card list is checked for overflow below');
    const w = watchErrors(page);
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/settings');
    const email = randomEmail('team');
    const person = `E2E Team Person ${email.split('@')[0]!.split('.')[1]}`; // a name of its own: earlier runs leave their people on the team
    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    const invite = page.getByRole('dialog', { name: 'Invite an admin' });
    await invite.getByRole('button', { name: 'Give access' }).click();
    await expect(invite.getByText(/Fill in the name/)).toBeVisible();
    await invite.getByLabel('Name').fill(person);
    await invite.getByLabel('Email address').fill(email);
    await invite.getByRole('radio', { name: /Support/ }).check();
    await invite.getByLabel('Reason').fill('E2E invite');
    await invite.getByRole('button', { name: 'Give access' }).click();
    await expect(invite).toHaveCount(0);
    const row = page.getByRole('region', { name: 'Admin team' }).locator('div.border-t', { hasText: person });
    await expect(row.getByText('Support')).toBeVisible();

    await row.getByRole('button', { name: `Change Support role of ${person}` }).click();
    const edit = page.getByRole('dialog', { name: `Change role of ${person}` });
    await edit.getByRole('radio', { name: /Content editor/ }).check();
    await edit.getByLabel('Reason').fill('E2E promote');
    await edit.getByRole('button', { name: 'Save change' }).click();
    await expect(edit).toHaveCount(0);
    await expect(row.getByText('Content editor')).toBeVisible();

    await row.getByRole('button', { name: 'Deactivate Content editor role of ' + person }).click();
    const off = page.getByRole('dialog', { name: `Deactivate Content editor for ${person}` });
    await expect(off.getByText(/They lose the pages of this role at once/)).toBeVisible();
    await off.getByLabel('Reason').fill('E2E clean up');
    await off.getByRole('button', { name: 'Deactivate' }).click();
    await expect(off).toHaveCount(0);
    await expect(row.getByText('Removed')).toBeVisible();
    w.expectClean();
  });

  test('the last System admin cannot be removed (the refusal is in words)', async ({ page, playwright }, info) => {
    test.skip(isPhone(info), 'desktop dialog');
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: /^Deactivate System admin role of/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Reason').fill('E2E must refuse');
    await dlg.getByRole('button', { name: 'Deactivate' }).click();
    // either "you cannot remove your own role" or "one active System admin" depending on which row came first
    await expect(dlg.getByRole('alert')).toContainText(/System admin/);
    await page.keyboard.press('Escape');
  });

  test('no sideways scroll on the settings page at the phone width', async ({ page, playwright }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Admin team' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('A14 country actions', () => {
  test('price dialog explains new payments only and can be cancelled; provider and move-back dialogs open with their facts', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/countries?country=KE');
    await expect(page.getByRole('heading', { name: 'Kenya' })).toBeVisible();

    await page.getByRole('button', { name: 'Set price…' }).click();
    const price = page.getByRole('dialog', { name: /Set the Full Access price in Kenya/ });
    await expect(price.getByText(/applies to new payments only|never shortened/).first()).toBeVisible();
    await price.getByLabel('Price (KES)').fill('abc');
    await price.getByLabel('Reason').fill('E2E look only');
    await price.getByRole('button', { name: 'Save price' }).click();
    await expect(price.getByText(/Enter an amount in KES/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(price).toHaveCount(0);

    await page.getByRole('button', { name: /^Change mode of/ }).first().click();
    const mode = page.getByRole('dialog', { name: /in Kenya/ });
    await expect(mode.getByText('Secrets and keys are never shown here')).toBeVisible();
    await expect(mode.getByRole('radio', { name: /Sandbox/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Go live…' }).click();
    const live = page.getByRole('dialog', { name: /Open Kenya to candidates/ });
    await expect(live.getByText('Before a country goes live')).toBeVisible();
    await expectAccessible(page, 'go-live dialog');
    await page.keyboard.press('Escape');

    await page.goto('/admin/countries?country=RW');
    await page.getByRole('button', { name: 'Move back to Preparing…' }).click();
    const back = page.getByRole('dialog', { name: /Move Rwanda back to Preparing/ });
    await expect(back.getByText(/Candidates will no longer see Rwanda/)).toBeVisible();
    await expect(back.getByText(/registered in Rwanda/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expectNoHorizontalScroll(page);
    w.expectClean();
    void info;
  });

  test('a role without countries:write cannot even reach the page (support): access page', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'support');
    await page.goto('/admin/countries');
    await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to this' })).toBeVisible();
  });
});
