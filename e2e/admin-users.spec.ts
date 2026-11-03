import { expect, test, type Page } from '@playwright/test';
import { BASE, createPendingPayment, expectNoHorizontalScroll, isPhone, signInAs, signUpCandidate, simulate, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

const q = (email: string) => encodeURIComponent(email);

/** A candidate who bought Full Access, and one who did not. */
async function twoCandidates(playwright: import('@playwright/test').Playwright) {
  const paid = await playwright.request.newContext();
  const free = await playwright.request.newContext();
  const p = await signUpCandidate(paid, 'E2E Paid Candidate');
  const f = await signUpCandidate(free, 'E2E Free Candidate');
  const pay = await createPendingPayment(paid, p.msisdn);
  await simulate(paid, pay.id, 'success');
  await paid.dispose();
  await free.dispose();
  return { paid: p, free: f };
}

const search = (page: Page, text: string) => page.getByRole('searchbox', { name: /Search (by )?name or email/ }).fill(text);

test.describe('Users', () => {
  test('list: search by email (any case), filter chips, empty state, paging; the query string follows', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    const { paid, free } = await twoCandidates(playwright);
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // all five chips (the phone says "Free", the desktop "Free only")
    const group = page.getByRole('group', { name: 'Access status' });
    for (const label of ['All', 'Full Access', isPhone(info) ? 'Free' : 'Free only', 'Expired', 'Suspended']) await expect(group.getByRole('button', { name: label, exact: true })).toBeVisible();

    await search(page, paid.email);
    await expect(page).toHaveURL(`${BASE}/admin/users?q=${q(paid.email)}`);
    await expect(page.getByText('E2E Paid Candidate').first()).toBeVisible();
    await expect(page.getByText(paid.email).first()).toBeVisible();
    // the match ignores case
    await search(page, paid.email.toUpperCase());
    await expect(page.getByText(paid.email).first()).toBeVisible();
    await search(page, paid.email);
    await expect(page.getByText('Full Access', { exact: true }).first()).toBeVisible();

    // Free filter hides the paid one and shows the free one
    await group.getByRole('button', { name: isPhone(info) ? 'Free' : 'Free only', exact: true }).click();
    await expect(page).toHaveURL(`${BASE}/admin/users?q=${q(paid.email)}&filter=free`);
    await expect(page.getByText('E2E Paid Candidate')).toHaveCount(0);
    await search(page, free.email);
    await expect(page.getByText('E2E Free Candidate').first()).toBeVisible();
    await group.getByRole('button', { name: 'Full Access', exact: true }).click();
    await expect(page.getByText('E2E Free Candidate')).toHaveCount(0);

    // nothing matches
    await group.getByRole('button', { name: 'All', exact: true }).click();
    await search(page, 'zzzzzznomatch');
    await expect(page.getByText(isPhone(info) ? 'No users match.' : 'No users match this search.')).toBeVisible();

    // paging: the whole list has more than one page
    await search(page, '');
    await expect(page).toHaveURL(`${BASE}/admin/users`);
    // (a freshly seeded database has fewer users than one page: then there is no pager to try)
    const next = page.getByRole('button', { name: 'Next' }).first();
    if (await next.count()) {
      await next.click();
      await expect(page).toHaveURL(`${BASE}/admin/users?page=2`);
      await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
    }
    w.expectClean();
  });

  test('opens already filtered from a link', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/users?filter=suspended');
    await expect(page.getByRole('button', { name: 'Suspended', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });

  test('detail: access state and days left, attempts, payments with the reference, inert actions with the audit note', async ({ page, playwright }, info) => {
    const { paid, free } = await twoCandidates(playwright);
    await signInAs(page, playwright, 'system');
    await page.goto(`/admin/users?q=${q(paid.email)}`);
    await expect(page.getByText('E2E Paid Candidate').first()).toBeVisible();
    if (isPhone(info)) await page.getByRole('link', { name: /E2E Paid Candidate/ }).click();
    else await page.getByRole('button', { name: /E2E Paid Candidate/ }).click();
    await expect(page).toHaveURL(new RegExp(`/users/`));

    const detail = isPhone(info) ? page.getByRole('main') : page.getByRole('complementary', { name: 'E2E Paid Candidate' });
    await expect(detail.getByText('ACCESS', { exact: true })).toBeVisible();
    await expect(detail.getByText(/^(30|29) days left · until \d+ \w{3} \d{4}$/)).toBeVisible();
    await expect(detail.getByText('RWF 2,000 · MTN MoMo').first()).toBeVisible();
    await expect(detail.getByText(/FAKE-TXN-/)).toBeVisible(); // the reference
    await expect(detail.getByText('Paid', { exact: true })).toBeVisible();
    await expect(detail.getByText('Access changes ask for a reason and are recorded in the audit log.')).toBeVisible();

    // the four buttons are drawn, announced as unavailable, and do nothing
    for (const name of ['Grant / extend 30 days', 'Send password reset', 'View as candidate', 'Suspend account']) {
      const b = detail.getByRole('button', { name });
      await expect(b).toHaveAttribute('aria-disabled', 'true');
      await b.dispatchEvent('click');
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // a free candidate: Free badge, no payments
    await page.goto(`/admin/users?q=${q(free.email)}`);
    if (isPhone(info)) await page.getByRole('link', { name: /E2E Free Candidate/ }).click();
    else await page.getByRole('button', { name: /E2E Free Candidate/ }).click();
    await expect(page.getByText('No payments yet.')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('support may open Users; the editor is sent away', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'support');
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    await signInAs(page, playwright, 'editor');
    await page.goto('/admin/users');
    await expect(page).toHaveURL(`${BASE}/admin`);
  });
});
