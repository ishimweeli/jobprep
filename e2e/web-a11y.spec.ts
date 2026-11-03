import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FREE_SLUG, PAID_SLUG, isPhone } from './web-helpers';

const activeInside = (page: Page, selector: string) =>
  page.evaluate((sel) => !!document.querySelector(sel)?.contains(document.activeElement), selector);

test.describe('Web: accessibility', () => {
  for (const [name, path] of [
    ['landing', '/rw'],
    ['catalog', '/rw/tests'],
    ['exam details (free)', `/rw/tests/${FREE_SLUG}`],
    ['exam details (paid)', `/rw/tests/${PAID_SLUG}`],
    ['pricing', '/rw/pricing'],
    ['choose country', '/choose-country'],
    ['sign-up', '/sign-up'],
  ] as const) {
    test(`axe: no WCAG A/AA violations on ${name}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' | ')})`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }

  test('focus ring is 3px #6AA6EE and the skip link is the first tab stop', async ({ page }) => {
    await page.goto('/rw/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    const outline = await skip.evaluate((el) => {
      const s = getComputedStyle(el);
      return { w: s.outlineWidth, c: s.outlineColor, o: s.outlineOffset, st: s.outlineStyle };
    });
    expect(outline).toEqual({ w: '3px', c: 'rgb(106, 166, 238)', o: '2px', st: 'solid' });
  });

  test('phone: filter sheet is keyboard-operable (focus moves in, is trapped, Esc closes and returns focus)', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the filter sheet is the phone layout');
    await page.goto('/rw/tests');
    const opener = page.getByRole('button', { name: /^Filters/ });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Filters' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(await activeInside(page, '[role=dialog]')).toBe(true);

    // Tab many more times than there are controls: focus never leaves the dialog.
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      expect(await activeInside(page, '[role=dialog]')).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await activeInside(page, '[role=dialog]')).toBe(true);
    }

    // Operate a radio with the keyboard only.
    await dialog.getByRole('radio', { name: 'Free', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/price=free/);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    // The page behind the sheet is usable again.
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  });

  test('desktop: the country modal traps focus and Esc closes it', async ({ page }, info) => {
    test.skip(isPhone(info), 'desktop modal');
    await page.goto('/choose-country');
    const dialog = page.getByRole('dialog', { name: 'Where are you sitting your exam?' });
    await expect(dialog).toBeVisible();
    expect(await activeInside(page, '[role=dialog]')).toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await activeInside(page, '[role=dialog]')).toBe(true);
    }
    // Arrow keys move between the radios.
    await page.getByRole('radio', { name: /Rwanda/ }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: /Kenya/ })).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/rw$/);
  });

  test('phone: touch targets of the main controls are at least 44px', async ({ page }, info) => {
    test.skip(!isPhone(info), 'touch targets matter on phones');
    await page.goto('/rw');
    for (const loc of [
      page.getByRole('button', { name: 'Find Mock Tests' }),
      page.getByRole('link', { name: /Country: .*Change country/ }),
      page.getByRole('link', { name: 'Sign in' }),
      page.getByRole('button', { name: 'Open menu' }),
    ]) {
      const box = (await loc.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await page.goto('/rw/tests');
    for (const loc of [page.getByRole('button', { name: /^Filters/ }), page.getByRole('button', { name: 'All', exact: true }).first()]) {
      expect((await loc.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
