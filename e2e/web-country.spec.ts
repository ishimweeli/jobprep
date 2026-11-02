import { expect, test } from '@playwright/test';
import { isPhone, watchErrors } from './web-helpers';

test.describe('Web: country picker', () => {
  test('lists every country, Rwanda selected, others marked Coming soon', async ({ page }, info) => {
    const w = watchErrors(page);
    await page.goto('/choose-country');
    const title = 'Where are you sitting your exam?';
    if (isPhone(info)) await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    else await expect(page.getByRole('dialog', { name: title })).toBeVisible();

    await expect(page.getByRole('radio', { name: /Rwanda/ })).toBeChecked();
    for (const c of ['Kenya', 'Tanzania', 'Uganda']) {
      await expect(page.getByRole('radio', { name: new RegExp(c) })).toBeVisible();
    }
    await expect(page.getByText('Coming soon')).toHaveCount(3);
    await expect(page.getByText(/RWF · MTN MoMo, Airtel Money/)).toBeVisible();
    w.expectClean();
  });

  test('a country that is not live offers "Notify me when X opens" (button only, inert)', async ({ page }) => {
    await page.goto('/choose-country');
    await page.getByText('Kenya', { exact: true }).click();
    const notify = page.getByRole('button', { name: 'Notify me when Kenya opens' });
    await expect(notify).toBeVisible();
    await expect(notify).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: /Continue to/ })).toHaveCount(0);
    await expect(page).toHaveURL(/\/choose-country$/);
  });

  test('Continue to Rwanda opens its home page and remembers the choice', async ({ page }) => {
    await page.goto('/choose-country');
    await page.getByText('Kenya', { exact: true }).click();
    await page.getByText('Rwanda', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue to Rwanda' }).click();
    await expect(page).toHaveURL(/\/rw$/);
    expect(await page.evaluate(() => localStorage.getItem('jobprep.country'))).toBe('rw');
    await page.goto('/');
    await expect(page).toHaveURL(/\/rw$/);
  });

  test('the header country chip opens the picker; a country that is not live redirects to it', async ({ page }) => {
    await page.goto('/rw');
    await page.getByRole('link', { name: /Country: .*Change country/ }).click();
    await expect(page).toHaveURL(/\/choose-country$/);
    await page.goto('/ke');
    await expect(page).toHaveURL(/\/choose-country$/);
    await page.goto('/rw/tests');
    await expect(page.getByRole('heading', { level: 1, name: 'Find your mock test' })).toBeVisible();
  });

  test('Esc closes the desktop picker modal', async ({ page }, info) => {
    test.skip(isPhone(info), 'the phone picker is a full page');
    await page.goto('/choose-country');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/rw$/);
  });
});
