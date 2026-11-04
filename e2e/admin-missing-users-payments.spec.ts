import { expect, test, type Page, type Playwright } from '@playwright/test';
import { BASE, adminApi, createPendingPayment, expectNoHorizontalScroll, isPhone, signInAs, signUpCandidate, simulate, watchErrors } from './admin-helpers';

/**
 * The users and payments actions built without a design (MISSING_DESIGNS A2, A3, A4, A5, A16): grant / extend access,
 * suspend and un-suspend, password reset, view as candidate, manual grant for a stuck payment, the payment page with its
 * event timeline, the accounting export, and what a Support person sees. See docs/missing-built-admin.md.
 */
test.use({ baseURL: BASE });

/** The admin id of a throwaway candidate, found through the API (the page is then opened by address). */
async function userId(playwright: Playwright, email: string): Promise<string> {
  const api = await adminApi(playwright);
  try {
    const r = await (await api.get('/api/admin/users', { params: { q: email } })).json();
    return (r as { results: { id: string }[] }).results[0]!.id;
  } finally {
    await api.dispose();
  }
}

const detail = (page: Page) => page.getByRole('main');

test.describe('Users: actions', () => {
  test('grant / extend access: reason required, summary, success, access shown, recorded in the history', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    const candidate = await playwright.request.newContext();
    const { email } = await signUpCandidate(candidate, 'E2E Grant Subject');
    await candidate.dispose();
    const id = await userId(playwright, email);
    await signInAs(page, playwright, 'system');
    await page.goto(`/admin/users/${id}`);

    await detail(page).getByRole('button', { name: 'Grant / extend 30 days' }).click();
    const dlg = page.getByRole('dialog', { name: /Grant or extend Full Access for E2E Grant Subject/ });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByLabel('Country')).toHaveValue('RW');
    await expect(dlg.getByLabel('Days')).toHaveValue('30');
    await expect(dlg.getByText(/^Access will run (until \d+ \w{3} \d{4}|for 30 days)/)).toBeVisible();
    await expect(dlg.getByText(/recorded in the audit log/)).toBeVisible();

    await dlg.getByRole('button', { name: 'Grant access' }).click();
    await expect(dlg.getByText('Write a reason. It is recorded in the audit log.')).toBeVisible();
    await dlg.getByLabel('Reason').fill('E2E: goodwill access');
    await dlg.getByRole('button', { name: 'Grant access' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Full Access for E2E Grant Subject now runs until/ })).toBeVisible();
    await expect(dlg).toHaveCount(0);
    await expect(detail(page).getByText(/^(30|29) days left/)).toBeVisible();
    await expect(detail(page).getByText(/granted Full Access — reason: E2E: goodwill access/)).toBeVisible();
    if (isPhone(info)) await expectNoHorizontalScroll(page);
    w.expectClean();
  });

  test('Esc closes the dialog without changing anything', async ({ page, playwright }) => {
    const candidate = await playwright.request.newContext();
    const { email } = await signUpCandidate(candidate, 'E2E Esc Subject');
    await candidate.dispose();
    await signInAs(page, playwright, 'system');
    await page.goto(`/admin/users/${await userId(playwright, email)}`);
    await detail(page).getByRole('button', { name: 'Suspend account' }).click();
    await expect(page.getByRole('dialog', { name: 'Suspend E2E Esc Subject?' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(detail(page).getByText('This account is suspended', { exact: false })).toHaveCount(0);
  });

  test('suspend and un-suspend: consequence text, reason required, banner with the reason, and back', async ({ page, playwright }) => {
    const candidate = await playwright.request.newContext();
    const { email } = await signUpCandidate(candidate, 'E2E Suspend Subject');
    const id = await userId(playwright, email);
    await signInAs(page, playwright, 'system');
    await page.goto(`/admin/users/${id}`);

    await detail(page).getByRole('button', { name: 'Suspend account' }).click();
    const dlg = page.getByRole('dialog', { name: 'Suspend E2E Suspend Subject?' });
    await expect(dlg.getByText('They will be signed out everywhere and cannot sign in.')).toBeVisible();
    await dlg.getByRole('button', { name: 'Suspend account' }).click();
    await expect(dlg.getByText('Write a reason. It is recorded in the audit log.')).toBeVisible();
    await dlg.getByLabel('Reason').fill('E2E: testing the suspend flow');
    await dlg.getByRole('button', { name: 'Suspend account' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'E2E Suspend Subject is suspended.' })).toBeVisible();
    await expect(detail(page).getByText(/This account is suspended since \d+ \w{3}/)).toBeVisible();
    await expect(detail(page).getByText(/Reason: E2E: testing the suspend flow/)).toBeVisible();
    // the candidate cannot sign in any more (the API says so)
    const signIn = await candidate.post(`${BASE}/api/auth/sign-in`, { data: { email, password: 'Password123!', remember: false, guestTokens: [] } });
    expect(signIn.ok()).toBeFalsy();

    // un-suspend (the same button toggles)
    await expect(detail(page).getByRole('button', { name: 'Suspend account', exact: true })).toHaveCount(0);
    await detail(page).getByRole('button', { name: 'Un-suspend account' }).click();
    const undo = page.getByRole('dialog', { name: 'Un-suspend E2E Suspend Subject?' });
    await undo.getByLabel('Reason').fill('E2E: restored after the test');
    await undo.getByRole('button', { name: 'Un-suspend account' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'can sign in again' })).toBeVisible();
    await expect(detail(page).getByText('This account is suspended', { exact: false })).toHaveCount(0);
    await expect(detail(page).getByRole('button', { name: 'Suspend account', exact: true })).toBeVisible();
    await candidate.dispose();
  });

  test('send password reset: confirmation names the address, no reason asked, the result is shown', async ({ page, playwright }) => {
    const candidate = await playwright.request.newContext();
    const { email } = await signUpCandidate(candidate, 'E2E Reset Subject');
    await candidate.dispose();
    await signInAs(page, playwright, 'support');
    await page.goto(`/admin/users/${await userId(playwright, email)}`);
    await detail(page).getByRole('button', { name: 'Send password reset' }).click();
    const dlg = page.getByRole('dialog', { name: 'Send a password reset email?' });
    await expect(dlg.getByText(email)).toBeVisible();
    await expect(dlg.getByLabel('Reason')).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Send email' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Reset email sent to ${email}.` })).toBeVisible();
    // (the e2e API has no wait between emails, so "too soon, wait N seconds" is covered by the unit tests, not here)
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Support sees grant and suspend disabled, with the reason, and cannot open the dialogs', async ({ page, playwright }) => {
    const candidate = await playwright.request.newContext();
    const { email } = await signUpCandidate(candidate, 'E2E Support View');
    await candidate.dispose();
    await signInAs(page, playwright, 'support');
    await page.goto(`/admin/users/${await userId(playwright, email)}`);
    const grant = detail(page).getByRole('button', { name: 'Grant / extend 30 days' });
    await expect(grant).toHaveAttribute('aria-disabled', 'true');
    await expect(detail(page).getByText('Only a System admin can change access or suspend accounts.').first()).toBeVisible();
    await grant.click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(detail(page).getByRole('button', { name: 'Suspend account' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('view as candidate: a read-only banner with Exit, and nothing to act with', async ({ page, playwright }) => {
    const candidate = await playwright.request.newContext();
    const { email } = await signUpCandidate(candidate, 'E2E View Subject');
    await candidate.dispose();
    const id = await userId(playwright, email);
    await signInAs(page, playwright, 'support');
    await page.goto(`/admin/users/${id}`);
    await expect(detail(page).getByText('Opens a read-only view of what this person sees.', { exact: false })).toBeVisible();
    await detail(page).getByRole('link', { name: 'View as candidate' }).click();
    await expect(page).toHaveURL(`${BASE}/admin/users/${id}/view`);
    await expect(page.getByText('Viewing as E2E View Subject — read only')).toBeVisible();
    await expect(detail(page).getByRole('heading', { name: 'Attempts' })).toBeVisible();
    await expect(detail(page).getByRole('button')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await page.getByRole('link', { name: 'Exit' }).click();
    await expect(page).toHaveURL(`${BASE}/admin/users/${id}`);
  });
});

test.describe('Payments: actions', () => {
  test('a paid payment has a page with its facts and the event timeline', async ({ page, playwright }, info) => {
    const candidate = await playwright.request.newContext();
    const { email, msisdn } = await signUpCandidate(candidate, 'E2E Timeline Payer');
    const pay = await createPendingPayment(candidate, msisdn);
    await simulate(candidate, pay.id, 'success');
    await candidate.dispose();
    await signInAs(page, playwright, 'support');
    await page.goto(`/admin/payments?q=${encodeURIComponent(email)}`);
    const link = isPhone(info) ? page.getByRole('link', { name: /Details of the payment by E2E Timeline Payer/ }) : page.getByRole('link', { name: /^Payment details/ });
    await link.first().click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/admin/payments/[^/?]+$`));
    await expect(page.getByRole('heading', { level: 2, name: 'Timeline' })).toBeVisible();
    const items = page.getByRole('listitem').filter({ hasText: /Payment request sent|operator confirmed|Full Access granted/ });
    await expect(items.filter({ hasText: 'Payment request sent to MTN MoMo' })).toBeVisible();
    await expect(items.filter({ hasText: 'The operator confirmed the payment' })).toBeVisible();
    await expect(items.filter({ hasText: 'Full Access granted' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Access granted' })).toBeVisible();
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grant access manually' })).toHaveCount(0); // nothing to grant on a paid payment
    await expectNoHorizontalScroll(page);
  });

  test('stuck payment: Stuck badge, Support sees the grant disabled, the System admin grants by hand with a transaction ID', async ({ page, playwright }, info) => {
    test.setTimeout(180_000);
    const api = await adminApi(playwright);
    const before = await (await api.get('/api/admin/settings')).json();
    const candidate = await playwright.request.newContext();
    const { email, msisdn } = await signUpCandidate(candidate, 'E2E Manual Payer');
    await createPendingPayment(candidate, msisdn);
    const txn = `E2E-TXN-${Date.now().toString(36)}`;
    try {
      expect((await api.put('/api/admin/settings', { data: { stuckAfterMinutes: 1 } })).ok()).toBeTruthy();
      await expect.poll(async () => (await (await api.get('/api/admin/payments', { params: { stuck: 'true', q: email } })).json()).total, { timeout: 100_000, intervals: [3000] }).toBe(1);

      const rowOf = () => (isPhone(info) ? page.getByRole('article').filter({ hasText: 'E2E Manual Payer' }) : page.getByRole('row').filter({ hasText: 'E2E Manual Payer' }));

      // Support: the button is there, disabled, and says why
      await signInAs(page, playwright, 'support');
      await page.goto(`/admin/payments?stuck=true&q=${encodeURIComponent(email)}`);
      await expect(rowOf().getByText('Stuck', { exact: true })).toBeVisible();
      const disabled = rowOf().getByRole('button', { name: /Grant access manually/ });
      await expect(disabled).toHaveAttribute('aria-disabled', 'true');
      await expect(rowOf().getByText('Only a System admin can grant access by hand.')).toBeVisible();
      await disabled.click({ force: true });
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // System admin: the dialog
      await signInAs(page, playwright, 'system');
      await page.goto(`/admin/payments?stuck=true&q=${encodeURIComponent(email)}`);
      await rowOf().getByRole('button', { name: /Grant access manually/ }).click();
      const dlg = page.getByRole('dialog', { name: 'Grant access manually' });
      await expect(dlg.getByText('RWF 2,000')).toBeVisible();
      await expect(dlg.getByText('MTN MoMo')).toBeVisible();
      await expect(dlg.getByText(/Age of the request/)).toBeVisible();
      await dlg.getByRole('button', { name: 'Grant access' }).click();
      await expect(dlg.getByText('Enter the provider transaction ID.')).toBeVisible();
      await dlg.getByLabel('Provider transaction ID').fill(txn);
      await dlg.getByRole('button', { name: 'Grant access' }).click();
      await expect(dlg.getByText('Write a reason. It is recorded in the audit log.')).toBeVisible();
      await dlg.getByLabel('Reason').fill('E2E: callback never arrived');
      await dlg.getByRole('button', { name: 'Grant access' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Access granted to E2E Manual Payer.' })).toBeVisible();

      // the payment is paid now, and its page shows the manual action
      await page.goto(`/admin/payments?q=${encodeURIComponent(email)}`);
      await expect(rowOf().getByText('Paid', { exact: true })).toBeVisible();
      await (isPhone(info) ? rowOf().getByRole('link', { name: /Details/ }) : rowOf().getByRole('link', { name: /^Payment details/ })).click();
      await expect(page.getByText('Granted by hand by', { exact: false })).toBeVisible();
      await expect(page.getByText(txn)).toBeVisible();
    } finally {
      await api.put('/api/admin/settings', { data: { stuckAfterMinutes: before.stuckAfterMinutes } });
      await candidate.dispose();
      await api.dispose();
    }
  });

  test('"Check status" shows what the operator said in a dialog', async ({ page, playwright }, info) => {
    const candidate = await playwright.request.newContext();
    const { email, msisdn } = await signUpCandidate(candidate, 'E2E Check Payer');
    const payment = await createPendingPayment(candidate, msisdn);
    await simulate(candidate, payment.id, 'success', false); // approved at the operator, callback not delivered
    try {
      await signInAs(page, playwright, 'support');
      await page.goto(`/admin/payments?q=${encodeURIComponent(email)}`);
      const row = isPhone(info) ? page.getByRole('article').filter({ hasText: 'E2E Check Payer' }) : page.getByRole('row').filter({ hasText: 'E2E Check Payer' });
      await row.getByRole('button', { name: 'Check status' }).click();
      const dlg = page.getByRole('dialog', { name: 'Result of the check' });
      await expect(dlg.getByText('Approved: now paid')).toBeVisible();
      await dlg.getByRole('button', { name: 'Close' }).click();
      await expect(row.getByText('Paid', { exact: true })).toBeVisible();
    } finally {
      await candidate.dispose();
    }
  });

  test('export for accounting: the range is checked, then a CSV downloads and the dialog says how many rows', async ({ page, playwright }) => {
    const w = watchErrors(page);
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/payments');
    const open = page.getByRole('button', { name: 'Export for accounting' });
    await open.click();
    const dlg = page.getByRole('dialog', { name: 'Export for accounting' });
    await expect(dlg.getByLabel('Format')).toHaveValue('csv');
    await expect(dlg.getByLabel('Status')).toHaveValue('paid');
    await dlg.getByLabel(/^From/).fill('2026-10-31');
    await dlg.getByLabel(/^To/).fill('2026-10-01');
    await dlg.getByRole('button', { name: 'Download CSV' }).click();
    await expect(dlg.getByText('The end date is before the start date.')).toBeVisible();

    await dlg.getByLabel(/^From/).fill('2020-01-01');
    await dlg.getByLabel(/^To/).fill('2099-12-31');
    await dlg.getByLabel('Status').selectOption('all');
    const [download] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Download CSV' }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    await expect(dlg.getByText(/^Downloaded .*\.csv, /)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    w.expectClean();
  });

  test('Support may open the export too (payments:read)', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'support');
    await page.goto('/admin/payments');
    await page.getByRole('button', { name: 'Export for accounting' }).click();
    await expect(page.getByRole('dialog', { name: 'Export for accounting' })).toBeVisible();
  });
});

test.describe('360px wide', () => {
  test('the dialogs and the payment page fit without sideways scrolling', async ({ page, playwright }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const candidate = await playwright.request.newContext();
    const { email, msisdn } = await signUpCandidate(candidate, 'E2E Narrow Subject');
    const pay = await createPendingPayment(candidate, msisdn);
    await simulate(candidate, pay.id, 'success');
    await candidate.dispose();
    const id = await userId(playwright, email);
    await signInAs(page, playwright, 'system');
    await page.goto(`/admin/users/${id}`);
    await expectNoHorizontalScroll(page);
    for (const [button, dialog] of [['Grant / extend 30 days', /Grant or extend/], ['Suspend account', /^Suspend /], ['Send password reset', 'Send a password reset email?']] as const) {
      await page.getByRole('main').getByRole('button', { name: button }).click();
      await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.keyboard.press('Escape');
    }
    await page.goto(`/admin/payments?q=${encodeURIComponent(email)}`);
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Export for accounting' }).click();
    await expect(page.getByRole('dialog', { name: 'Export for accounting' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: /Details of the payment/ }).first().click();
    await expect(page.getByRole('heading', { level: 2, name: 'Timeline' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto(`/admin/users/${id}/view`);
    await expect(page.getByText(/Viewing as E2E Narrow Subject — read only/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
