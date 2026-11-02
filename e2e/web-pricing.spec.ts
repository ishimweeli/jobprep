import { expect, test } from '@playwright/test';
import { API, watchErrors } from './web-helpers';

test.describe('Web: pricing', () => {
  test('free samples, Full Access paid once, Mobile Money methods and FAQ — all from the API', async ({ page, request }) => {
    const w = watchErrors(page);
    const api = await (await request.get(`${API}/api/countries/rw/pricing`)).json();
    await page.goto('/rw/pricing');

    await expect(page.getByRole('heading', { level: 1, name: 'One price. Every mock test.' })).toBeVisible();
    await expect(page.getByText(`one payment unlocks everything for ${api.fullAccess.durationDays} days`)).toBeVisible();

    const pack = page.getByRole('region', { name: new RegExp(`${api.fullAccess.name} · ${api.fullAccess.durationDays} days`) });
    await expect(pack).toContainText(api.fullAccess.priceLabel);
    if (api.fullAccess.paidOnce) await expect(pack).toContainText('paid once');
    await expect(pack).toContainText(`Unlimited attempts for ${api.fullAccess.durationDays} days`);
    await expect(pack.getByRole('button', { name: 'Continue to payment' })).toBeVisible();

    const free = page.getByRole('region', { name: 'Free samples' });
    await expect(free).toContainText(api.free.priceLabel);

    const pay = page.getByRole('region', { name: 'Pay with Mobile Money' });
    for (const m of api.paymentMethods) await expect(pay).toContainText(m.label);
    await expect(pay).toContainText('JobPrep never asks for your PIN');
    w.expectClean();
  });

  test('FAQ answers expand and use the plan duration', async ({ page }) => {
    await page.goto('/rw/pricing');
    await page.getByText('When does my access start?').click();
    await expect(page.getByText(/The 30 days are counted from that moment/)).toBeVisible();
    await page.getByText('Are these the real examination questions?').click();
    await expect(page.getByText(/not affiliated with MIFOTRA or REB/).first()).toBeVisible();
  });

  test('Find a free test opens the free catalog', async ({ page }) => {
    await page.goto('/rw/pricing');
    await page.getByRole('link', { name: 'Find a free test' }).click();
    await expect(page).toHaveURL(/\/rw\/tests\?price=free/);
  });
});
