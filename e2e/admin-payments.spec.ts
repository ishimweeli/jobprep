import { expect, test } from '@playwright/test';
import { BASE, adminApi, createPendingPayment, expectNoHorizontalScroll, isPhone, signInAs, signUpCandidate, simulate, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

const digits = (phone: string) => phone.replace('+250', '');

test.describe('Payments', () => {
  test('stat cards, tabs with the pending count, the table or cards, and the drawn notes', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    await signInAs(page, playwright, 'system');
    await page.goto('/payments');
    await expect(page.getByRole('heading', { level: 1, name: 'Payments' })).toBeVisible();
    await expect(page.getByText('Paid today')).toBeVisible();
    await expect(page.getByText('Pending now')).toBeVisible();
    if (!isPhone(info)) {
      await expect(page.getByText('Successful payments today')).toBeVisible();
      await expect(page.getByText('Failed or expired today')).toBeVisible();
      await expect(page.getByText('Full Access · RWF 2,000 · MTN MoMo and Airtel Money')).toBeVisible();
      await expect(page.getByRole('columnheader')).toHaveText(['Time', 'Candidate', 'Provider', 'Amount', 'Status', 'Reference', 'Action']);
      await expect(page.getByRole('button', { name: 'Export for accounting' })).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByText('“Grant access manually” is for confirmed payments whose callback never arrived', { exact: false })).toBeVisible();
    }
    const tabs = page.getByRole('group', { name: 'Status' });
    await expect(tabs.getByRole('button', { name: /^Pending \(\d+\)$/ })).toBeVisible();
    for (const [tab, status] of [['Paid', 'paid'], ['Failed', 'failed'], ['All', 'all']] as const) {
      await tabs.getByRole('button', { name: tab, exact: true }).click();
      await expect(tabs.getByRole('button', { name: tab, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(status === 'all' ? `${BASE}/payments` : `${BASE}/payments?status=${status}`);
    }
    await expect(page.getByText('SMS shows paid')).toHaveCount(0); // there is no data for it
    await expectNoHorizontalScroll(page);
    w.expectClean();
  });

  test('"Check status" asks the operator and the row shows the new status', async ({ page, playwright }, info) => {
    const candidate = await playwright.request.newContext();
    const { phone } = await signUpCandidate(candidate, 'E2E Payer');
    const payment = await createPendingPayment(candidate, phone);
    // the operator approved, but the callback never reached us: still pending on our side
    await simulate(candidate, payment.id, 'success', false);
    try {
      await signInAs(page, playwright, 'support'); // Support may check payments
      await page.goto(`/payments?q=${digits(phone)}`);
      const row = isPhone(info) ? page.getByRole('article').filter({ hasText: 'E2E Payer' }) : page.getByRole('row').filter({ hasText: 'E2E Payer' });
      await expect(row.getByText('Pending', { exact: true })).toBeVisible();
      await expect(row.getByText(/Waiting \d+ min/i)).toBeVisible();
      await row.getByRole('button', { name: 'Check status' }).click();
      await expect(row.getByText('Paid', { exact: true })).toBeVisible();
      await expect(row.getByText(/access until \d+ \w{3}/i)).toBeVisible();
      await expect(row.getByRole('button', { name: 'Check status' })).toHaveCount(0);
    } finally {
      await candidate.dispose();
    }
  });

  test('stuck payments: the Overview link filters them, they are highlighted, "Grant access manually" is drawn and does nothing', async ({ page, playwright }, info) => {
    test.setTimeout(150_000);
    const api = await adminApi(playwright);
    const before = await (await api.get('/api/admin/settings')).json();
    const candidate = await playwright.request.newContext();
    const { phone } = await signUpCandidate(candidate, 'E2E Stuck Payer');
    await createPendingPayment(candidate, phone);
    try {
      // "stuck" = pending longer than the setting: make it one minute, and wait for the payment to get there
      expect((await api.put('/api/admin/settings', { data: { stuckAfterMinutes: 1 } })).ok()).toBeTruthy();
      await expect.poll(async () => (await (await api.get('/api/admin/payments', { params: { stuck: 'true', q: digits(phone) } })).json()).total, { timeout: 100_000, intervals: [3000] }).toBe(1);

      await signInAs(page, playwright, 'system');
      await page.goto('/');
      const alert = page.getByRole('link', { name: /payments? pending over 1 min/ });
      await expect(alert).toBeVisible();
      await alert.click();
      await expect(page).toHaveURL(`${BASE}/payments?stuck=true`);
      await expect(page.getByRole('button', { name: /^Pending \(\d+\)$/ })).toHaveAttribute('aria-pressed', 'true');

      await page.goto(`/payments?stuck=true&q=${digits(phone)}`);
      const row = isPhone(info) ? page.getByRole('article').filter({ hasText: 'E2E Stuck Payer' }) : page.getByRole('row').filter({ hasText: 'E2E Stuck Payer' });
      await expect(row).toBeVisible();
      const grant = row.getByRole('button', { name: 'Grant access manually' });
      await expect(grant).toHaveAttribute('aria-disabled', 'true');
      await grant.dispatchEvent('click');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(row.getByRole('button', { name: 'Check status' })).toBeVisible();
    } finally {
      await api.put('/api/admin/settings', { data: { stuckAfterMinutes: before.stuckAfterMinutes } });
      await candidate.dispose();
      await api.dispose();
    }
  });

  test('a content editor cannot open Payments', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'editor');
    await page.goto('/payments');
    await expect(page).toHaveURL(`${BASE}/`);
  });
});
