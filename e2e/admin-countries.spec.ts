import { expect, test } from '@playwright/test';
import { BASE, expectNoHorizontalScroll, isPhone, signInAs, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

test.describe('Countries', () => {
  test('list with status chips and summaries; Kenya (preparing) opens with its go-live checklist', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/countries');
    await expect(page.getByRole('heading', { level: 1, name: 'Countries' })).toBeVisible();
    const list = page.getByRole('region', { name: 'Country list' });
    await expect(list.getByRole('button', { name: /Rwanda/ })).toContainText('Live');
    await expect(list.getByRole('button', { name: /Rwanda/ })).toContainText('RWF 2,000');
    await expect(list.getByRole('button', { name: /Kenya/ })).toContainText('Preparing');
    await expect(list.getByRole('button', { name: /Kenya/ })).toContainText('Price not set');
    await expect(list.getByRole('button', { name: /Uganda/ })).toContainText('Planned');
    await expect(list.getByRole('button', { name: /Kenya/ })).toHaveAttribute('aria-pressed', 'true'); // as the artboard opens

    if (isPhone(info)) {
      await expect(page.getByRole('heading', { name: 'Kenya · ready to launch?' })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { level: 2, name: 'Kenya' })).toBeVisible();
      await expect(page.getByText('jobprep.nexvecta.com/ke')).toBeVisible();
      await expect(page.getByText('Before this country can go live')).toBeVisible();
    }
    // the checklist comes from the API: price, payment, free samples, legal
    for (const item of ['Set the Full Access price', 'Move a payment method from sandbox to live', 'At least one free sample test in every category', 'Legal review of terms and refund policy']) {
      await expect(page.getByText(item)).toBeVisible();
    }
    await expect(page.getByText('Not done: ').first()).toBeAttached(); // ✓ / ✕ also have words for screen readers

    // Rwanda is live: no checklist
    await list.getByRole('button', { name: /Rwanda/ }).click();
    await expect(page).toHaveURL(`${BASE}/admin/countries?country=RW`);
    await expect(page.getByText('Before this country can go live')).toHaveCount(0);
    if (!isPhone(info)) {
      await expect(page.getByRole('heading', { level: 2, name: 'Rwanda' })).toBeVisible();
      await expect(page.getByLabel('Currency')).toHaveValue('RWF');
      await expect(page.getByLabel('Full Access price')).toHaveValue('2000');
      await expect(page.getByLabel('Access days')).toHaveValue('30');
      await expect(page.getByLabel('Phone prefix')).toHaveValue('+250');
      await expect(page.getByText('MTN MoMo')).toBeVisible();
      await expect(page.getByText('English100%')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Job categories' })).toBeVisible();
      await expect(page.getByText('Teaching positions')).toBeVisible();
      await expect(page.getByLabel('Independence notice shown in the footer and FAQ')).toHaveValue(/not affiliated with MIFOTRA or REB/);
    }
    await expectNoHorizontalScroll(page);
    w.expectClean();
  });

  test('Save, Preview as candidate, + Add country, + Language and the editable-looking fields are drawn and change nothing', async ({ page, playwright }, info) => {
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/countries?country=KE');
    const inert = isPhone(info) ? ['Save Kenya', 'Preview as candidate', '+ Add country'] : ['Save country', 'Preview as candidate', '+ Add country', '+ Language'];
    for (const name of inert) {
      const b = page.getByRole('button', { name });
      await expect(b).toHaveAttribute('aria-disabled', 'true');
      await b.dispatchEvent('click');
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(`${BASE}/admin/countries?country=KE`);
    if (!isPhone(info)) {
      await expect(page.getByLabel('Currency')).toHaveAttribute('readonly', '');
      await expect(page.getByLabel('Full Access price')).toHaveAttribute('readonly', '');
    }
  });

  test('Support and the editor cannot open Countries', async ({ page, playwright }) => {
    for (const role of ['support', 'editor'] as const) {
      await signInAs(page, playwright, role);
      await page.goto('/admin/countries');
      await expect(page).toHaveURL(`${BASE}/admin`);
    }
  });
});
