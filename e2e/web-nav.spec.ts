import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, isPhone, signUpViaApi, watchErrors } from './web-helpers';

test.describe('Web: navigation (C13 desktop header, C29 phone tabs)', () => {
  test('phone, signed in: Home / Tests / Progress / Account tabs on the main pages, with the current tab marked', async ({ page }, info) => {
    test.skip(!isPhone(info), 'bottom tabs are phone only');
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    const tabs = page.getByRole('navigation', { name: 'Main' });
    for (const [path, tab] of [['/rw', 'Home'], ['/rw/tests', 'Tests'], ['/rw/progress', 'Progress'], ['/account', 'Account']] as const) {
      await page.goto(path);
      await expect(tabs.getByRole('link')).toHaveText(['Home', 'Tests', 'Progress', 'Account']);
      await expect(tabs.getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page');
      await expectNoHorizontalScroll(page);
    }
    await tabs.getByRole('link', { name: 'Tests' }).click();
    await expect(page).toHaveURL(/\/rw\/tests$/);
    await tabs.getByRole('link', { name: 'Progress' }).click();
    await expect(page).toHaveURL(/\/rw\/progress$/);
    // the old three-tab bar (Mock tests / My progress / Access) is gone
    await expect(page.getByRole('link', { name: 'Access', exact: true })).toHaveCount(0);
    w.expectClean();
  });

  test('phone, signed in: the Account tab lists the menu rows and Sign out; Account settings opens the account page', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone only');
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/account');
    await expect(page.getByText('Aline Uwase')).toBeVisible();
    for (const row of ['My progress', 'My access', 'Exam country', 'Language', 'Help and support', 'Account settings']) {
      await expect(page.getByRole('navigation', { name: 'Account' }).getByText(row, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('English · Ikinyarwanda')).toBeVisible();
    await expect(page.getByText('JobPrep by Nexvecta · Independent practice platform')).toBeVisible();
    await expect(page.getByText(/SUPPORT PHONE/)).toHaveCount(0);
    await page.getByRole('link', { name: /Account settings/ }).click();
    await expect(page).toHaveURL(/\/account\/settings$/);
    await expect(page.getByText('Exam country')).toBeVisible();
  });

  test('phone, guest: no tab bar; the menu button opens the sheet with Mock tests, Pricing, Country, Language, Sign in, Create a free account', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone only');
    await page.goto('/rw');
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Mock tests' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Pricing' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: /Country/ })).toContainText('Rwanda · RWF');
    // the language switch is drawn but inert (no picker design)
    await expect(sheet.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('group', { name: 'Language' }).getByRole('button').first()).toHaveAttribute('aria-disabled', 'true');
    await expect(sheet.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    await expect(sheet.getByRole('link', { name: 'Create a free account' })).toHaveAttribute('href', '/sign-up');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await sheet.getByRole('link', { name: 'Mock tests' }).click();
    await expect(page).toHaveURL(/\/rw\/tests$/);
  });

  test('desktop, signed in: the avatar opens the account menu with every row; Escape closes it; rows lead where drawn', async ({ page }, info) => {
    test.skip(isPhone(info), 'desktop menu');
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw/pricing');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My progress' })).toBeVisible();
    const button = page.getByRole('button', { name: /account menu for Aline Uwase/i });
    await button.click();
    const menu = page.getByRole('menu', { name: 'Account' });
    await expect(menu).toContainText('Aline Uwase');
    await expect(menu.getByRole('menuitem')).toHaveCount(7);
    await expect(menu.getByRole('menuitem', { name: /My access/ })).toContainText(/Full Access · \d+ days? left|^My access$/);
    await expect(menu.getByRole('menuitem', { name: /Exam country/ })).toContainText('Rwanda · change');
    await expect(menu.getByRole('menuitem', { name: /Language/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(menu.getByRole('menuitem', { name: /Help and support/ })).not.toContainText('[');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();

    await button.click();
    await menu.getByRole('menuitem', { name: /Account settings/ }).click();
    await expect(page).toHaveURL(/\/account\/settings$/);
    await expect(page.getByText('Aline Uwase')).toBeVisible();
    await button.click();
    await menu.getByRole('menuitem', { name: /Exam country/ }).click();
    await expect(page).toHaveURL(/\/choose-country$/);
    w.expectClean();
  });

  test('desktop, guest: country chip, Sign in and Create account in the header', async ({ page }, info) => {
    test.skip(isPhone(info), 'desktop header');
    await page.goto('/rw/pricing');
    const header = page.locator('header').first();
    await expect(header.getByRole('link', { name: /Country: .*Change country/ })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    await expect(header.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/sign-up');
    await expect(header.getByRole('link', { name: 'My progress' })).toHaveCount(0);
  });
});
