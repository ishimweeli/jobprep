import { expect, test, type Page } from '@playwright/test';
import { API, expectNoHorizontalScroll, fillPayerNumber, signUpViaApi, watchErrors } from './web-helpers';
import { simulatePayment } from './web-exam-helpers';
import { addGrant, cleanUser, me } from './web-p3-helpers';

const expected4xx5xx = (e: string) => /status of [45]\d\d/.test(e);

async function toPending(page: Page) {
  await page.goto('/rw/checkout');
  await fillPayerNumber(page, '789123456');
  await page.getByRole('button', { name: /^Pay RWF 2,000$/ }).click();
  await expect(page.getByRole('heading', { name: 'Approve on your phone' })).toBeVisible();
}

/** The id of the payment the page just created (the newest pending one). */
async function lastPaymentId(page: Page): Promise<string> {
  const res = await page.request.get(`${API}/api/me/dashboard`);
  const d = (await res.json()) as { pendingPayment: { id: string } | null };
  if (!d.pendingPayment) throw new Error('no pending payment');
  return d.pendingPayment.id;
}

test.describe('Web: checkout edge states (C20)', () => {
  let userId: string | null = null;
  test.afterEach(async () => {
    if (userId) await cleanUser(userId);
    userId = null;
  });

  test('invalid number: inline message, the Pay button stays off until the number is fixed, nothing is sent', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/payments')) posts += 1;
    });
    await page.goto('/rw/checkout');
    const input = page.getByLabel('Mobile Money number');
    await input.fill('78812');
    await page.getByRole('button', { name: /^Pay RWF 2,000$/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a 9-digit Rwanda number, like 788 123 456.' })).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: /^Pay RWF 2,000$/ })).toBeDisabled();
    expect(posts).toBe(0);
    await input.fill('078 812 3456');
    await expect(page.getByRole('button', { name: /^Pay RWF 2,000$/ })).toBeEnabled();
    await expectNoHorizontalScroll(page);
  });

  test('declined: "Payment declined", you were not charged, Try again, and Pay with Airtel Money instead', async ({ page, request }) => {
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await toPending(page);
    await simulatePayment(request, await lastPaymentId(page), 'decline');
    const card = page.getByRole('status').filter({ hasText: 'Payment declined' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('MTN MoMo declined the request. This can happen if the PIN was wrong or the balance was too low.');
    await expect(card).toContainText('You were not charged.');
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Pay with Airtel Money instead' }).click();
    await expect(page.getByRole('button', { name: /^Airtel Money/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^Pay RWF 2,000$/ })).toBeVisible();
    expect(w.errors.filter((e) => !expected4xx5xx(e))).toEqual([]);
  });

  test('expired: "The request expired", not charged, a new prompt to the same number, or a different number', async ({ page, request }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await toPending(page);
    await simulatePayment(request, await lastPaymentId(page), 'timeout');
    const card = page.getByRole('status').filter({ hasText: 'The request expired' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText(/The prompt on \+250 789 \d{3} \d{3} was not approved in time, so we cancelled it\./);
    await expect(card).toContainText('You were not charged.');
    await page.getByRole('button', { name: 'Send a new prompt' }).click();
    await expect(page.getByRole('heading', { name: 'Approve on your phone' })).toBeVisible();
    // different number: simulate another expiry first
    await simulatePayment(request, await lastPaymentId(page), 'timeout');
    await expect(page.getByRole('status').filter({ hasText: 'The request expired' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Use a different number' }).click();
    await expect(page.getByLabel('Mobile Money number')).toHaveValue('');
  });

  test('provider unavailable (502): "MTN MoMo is not responding", not charged, pay with Airtel Money', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await page.route('**/api/payments', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 502, json: { error: 'provider_unavailable', paymentId: 'x', requestId: 'ABCD1234' } }) : route.continue(),
    );
    await page.goto('/rw/checkout');
    await fillPayerNumber(page);
    await page.getByRole('button', { name: /^Pay RWF 2,000$/ }).click();
    const card = page.getByRole('status').filter({ hasText: 'MTN MoMo is not responding' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('We could not reach MTN MoMo just now. Try again in a few minutes, or pay with Airtel Money.');
    await expect(card).toContainText('You were not charged.');
    await expect(page.getByRole('button', { name: 'Try MTN MoMo again' })).toBeVisible();
    await page.getByRole('button', { name: 'Pay with Airtel Money' }).click();
    await expect(page.getByRole('button', { name: /^Airtel Money/ })).toHaveAttribute('aria-pressed', 'true');
    await expectNoHorizontalScroll(page);
  });

  test('still waiting: "Check payment" from the dashboard, then the approval arrives and the payment is confirmed', async ({ page, request }) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    const created = await page.request.post(`${API}/api/payments`, { data: { provider: 'MTN_MOMO', msisdn: u.phone } });
    const { id } = (await created.json()) as { id: string };
    await page.goto('/rw/progress');
    await page.getByRole('link', { name: 'Check payment' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/checkout\\?payment=${id}&check=1$`));
    const card = page.getByRole('status').filter({ hasText: 'Still waiting for confirmation' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('You approved the payment, but MTN MoMo has not confirmed it to us yet. This usually takes under a minute.');
    await expect(card).not.toContainText(/\[|SUPPORT/);
    await expect(card).not.toContainText('You were not charged.'); // nothing is known about a charge here
    await expect(page.getByRole('button', { name: 'Go to my dashboard' })).toBeVisible();
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(card).toBeVisible();

    await simulatePayment(request, id, 'success');
    await expect(page.getByRole('heading', { name: 'Payment confirmed' })).toBeVisible({ timeout: 15_000 });
  });

  test('"Send the prompt again" on the dashboard sends a new prompt and opens "Approve on your phone"', async ({ page }) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await page.request.post(`${API}/api/payments`, { data: { provider: 'MTN_MOMO', msisdn: u.phone } });
    await page.goto('/rw/progress');
    await page.getByRole('button', { name: 'Send the prompt again' }).click();
    await expect(page).toHaveURL(/\/rw\/checkout\?payment=/);
    await expect(page.getByRole('heading', { name: 'Approve on your phone' })).toBeVisible();
  });

  test('already has access: "You already have Full Access", nothing to pay', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await addGrant(userId, -7, 23);
    await page.goto('/rw/checkout');
    const card = page.getByRole('status').filter({ hasText: 'You already have Full Access' });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Your Rwanda Full Access runs until \d+ \w+ 20\d\d, so there is nothing to pay\. You can add 30 more days from your dashboard when it is close to ending\./);
    await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start a mock test' }).click();
    await expect(page).toHaveURL(/\/rw\/progress$/);
  });

  test('ending soon: the checkout is open again and the new end date comes from the API (after the current one)', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await addGrant(userId, -28, 2);
    const summary = (await (await page.request.get(`${API}/api/me/checkout`)).json()) as { newAccessEndsAt: string };
    await page.goto('/rw/checkout');
    await expect(page.getByRole('button', { name: /^Pay RWF 2,000$/ })).toBeVisible();
    const until = new Date(summary.newAccessEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    await expect(page.getByText(`Access starts once payment is confirmed · until ${until}`)).toBeVisible();
  });
});
