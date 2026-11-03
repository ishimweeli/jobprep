import { expect, test, type Page } from '@playwright/test';
import { API, expectNoHorizontalScroll, isPhone, signUpViaApi, watchErrors } from './web-helpers';
import { ACCOUNTANT_SLUG, buyAccessViaApi, completeViaApi, FREE_SLUG } from './web-exam-helpers';
import { addGrant, cleanUser, me, signInWithPassword } from './web-p3-helpers';

async function setGoal(page: Page) {
  const body = (await (await page.request.get(`${API}/api/countries/RW/categories`)).json()) as { categories: { id: string; slug: string }[] };
  await page.request.patch(`${API}/api/me`, { data: { goalCategoryId: body.categories.find((c) => c.slug === 'teaching-positions')?.id } });
}

const accessCard = (page: Page) => page.getByRole('region', { name: 'My access' }).or(page.locator('section[aria-labelledby="ma-t"]')).first();

test.describe('Web: dashboard for a new user and "My access" states (C16)', () => {
  let userId: string | null = null;
  test.afterEach(async () => {
    if (userId) await cleanUser(userId);
    userId = null;
  });

  test('a new user sees Start here, an empty history, more tests for the goal and the free-only access card', async ({ page }, info) => {
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await setGoal(page);
    await page.goto('/rw/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Aline' })).toBeVisible();
    await expect(page.locator('main')).toContainText('Teaching positions');

    const start = page.getByRole('region', { name: 'Start here' });
    await expect(start).toContainText('Primary Teacher — General (P1–P6) Mock 1');
    await expect(start).toContainText(/Free sample · 6 questions · 20 minutes\. Take it once to see where you stand — we’ll point you to your weakest topics afterwards\./);
    await expect(page.getByRole('region', { name: 'Score history' })).toContainText('No scores yet');
    await expect(page.getByRole('region', { name: 'Score history' })).toContainText('Your scores and strongest and weakest topics will appear here after your first mock test.');
    const more = page.getByRole('region', { name: 'More for your goal' });
    await expect(more.getByRole('link')).toHaveCount(3);
    await expect(more).toContainText('Free');
    await expect(more).toContainText('Full Access');
    await expect(more).toContainText(/\d+ questions · \d+ min/);

    const access = accessCard(page);
    await expect(access).toContainText('Free');
    await expect(access).toContainText('You’re using free sample tests');
    await expect(access).toContainText('Full Access unlocks every mock test in Rwanda for 30 days, with one payment of RWF 2,000. Nothing renews.');
    await expect(access).not.toContainText('[PRICE]');
    await expect(access.getByRole('link', { name: 'Get Full Access' })).toHaveAttribute('href', '/rw/checkout');

    if (isPhone(info)) {
      // phone order: Start here, My access, Score history, More for your goal
      const order = await page.locator('main section').evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')));
      expect(order).toEqual(['st-t', 'ma-t', 'sh-t', 'sg-t']);
    }
    await expectNoHorizontalScroll(page);

    await start.getByRole('link', { name: 'Start free mock test' }).click();
    await expect(page).toHaveURL(/\/rw\/tests\/primary-teacher-general-p1-p6-mock-1$/);
    w.expectClean();
  });

  test('once a test is finished, "Start here" goes away and the usual dashboard appears', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await completeViaApi(page.request, FREE_SLUG, 'ABCDABCDABCDABCDABCD');
    await page.goto('/rw/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Muraho, Aline' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Start here' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Score history' })).toBeVisible();
  });

  test('active: days left, end date, a progress bar and a link to browse', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await addGrant(userId, -7, 23);
    await page.goto('/rw/progress');
    const access = accessCard(page);
    await expect(access).toContainText('Active');
    await expect(access).toContainText('Full Access · 23 days left');
    await expect(access).toContainText(/Every mock test in Rwanda is unlocked until \d+ \w+ 20\d\d\./);
    await expect(access.getByRole('link', { name: 'Browse all mock tests' })).toHaveAttribute('href', '/rw/tests');
    await expect(access.getByRole('link', { name: /Get Full Access|Add/ })).toHaveCount(0);
  });

  test('ending soon (3 days or fewer): amber, "Add 30 more days"', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await addGrant(userId, -28, 2);
    await page.goto('/rw/progress');
    const access = accessCard(page);
    await expect(access).toContainText('Ends in 2 days');
    await expect(access).toContainText(/Full Access ends on \d+ \w+ 20\d\d/);
    await expect(access).toContainText('After that, you keep your results but paid tests lock again. You can buy another 30 days at any time — it starts when the current access ends.');
    await expect(access.getByRole('link', { name: 'Add 30 more days' })).toHaveAttribute('href', '/rw/checkout');
  });

  test('expired: when it ended, results kept, "Get Full Access again"', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await addGrant(userId, -40, -5);
    await page.goto('/rw/progress');
    const access = accessCard(page);
    await expect(access).toContainText('Expired');
    await expect(access).toContainText(/Full Access ended on \d+ \w+ 20\d\d/);
    await expect(access).toContainText('Your results, scores and review notes are still here. Free sample tests stay open.');
    await expect(access.getByRole('link', { name: 'Get Full Access again' })).toBeVisible();
  });

  test('payment pending: provider, price, number and "Check payment"; approving it makes the card Active', async ({ page, request }) => {
    const w = watchErrors(page);
    const u = await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    const created = await page.request.post(`${API}/api/payments`, { data: { provider: 'MTN_MOMO', msisdn: u.phone } });
    const { id } = (await created.json()) as { id: string };
    await page.goto('/rw/progress');
    const access = accessCard(page);
    await expect(access).toContainText('Pending');
    await expect(access).toContainText('Waiting for your MTN MoMo approval');
    await expect(access).toContainText(/We sent a prompt for RWF 2,000 to \+250 789 \d{3} \d{3} at \d\d:\d\d\. Approve it on your phone\. If you don’t, you won’t be charged\./);
    await expect(access).not.toContainText('PIN');
    await expect(access.getByRole('button', { name: 'Send the prompt again' })).toBeVisible();
    await expect(access.getByRole('link', { name: 'Check payment' })).toHaveAttribute('href', `/rw/checkout?payment=${id}&check=1`);

    await request.post(`${API}/api/test/payments/${id}/simulate`, { data: { outcome: 'success' } });
    await page.reload();
    await expect(accessCard(page)).toContainText('Full Access · 30 days left');
    w.expectClean();
  });

  test('Start practice and Practise on the dashboard open the practice runner (no minutes anywhere)', async ({ page }, info) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await completeViaApi(page.request, FREE_SLUG, 'AAAAAAAAAAAAAAAAAAAA');
    await page.goto('/rw/progress');
    const rec = page.getByRole('region', { name: 'Recommended next' });
    await expect(rec).toContainText(/Your weakest topic at \d+%/);
    await expect(rec).toContainText(/\d+ questions/);
    await expect(rec).not.toContainText(/\bmin\b/);
    await rec.getByRole('button', { name: 'Start practice' }).click();
    await expect(page).toHaveURL(/\/rw\/exam\/[a-z0-9]+$/);
    await expect(page.getByText('Untimed')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /^Question 1 of \d+/ })).toBeVisible();
    await page.goBack();
    const practise = page.getByRole('button', { name: /^Practise / }).first();
    await practise.click();
    await expect(page).toHaveURL(/\/rw\/exam\/[a-z0-9]+$/);
    void info;
  });
});

test.describe('Web: details of an unlocked test (C30)', () => {
  let userId: string | null = null;
  test.afterEach(async () => {
    if (userId) await cleanUser(userId);
    userId = null;
  });

  test('not started -> in progress (Resume) -> taken before (new attempt + Review last attempt)', async ({ page }, info) => {
    const w = watchErrors(page);
    const u = await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    await buyAccessViaApi(page.request, u.phone);
    const url = `/rw/tests/${ACCOUNTANT_SLUG}`;

    // 1. not started
    await page.goto(url);
    await expect(page.getByText('Unlocked with Full Access')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Accountant (Public Institution) — Mock 1' })).toBeVisible();
    const card = page.getByRole('region', { name: 'Start' });
    await expect(card).toContainText('Your access');
    await expect(card).toContainText(/Full Access · until \d+ \w+ 20\d\d/);
    await expect(card.getByRole('link', { name: 'Get started' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Review last attempt/ })).toHaveCount(0);
    await expect(page.getByText('You have this test in progress')).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    // 2. in progress
    await card.getByRole('link', { name: 'Get started' }).click();
    await expect(page).toHaveURL(/\/rw\/exam\/[a-z0-9]+$/);
    const attemptUrl = page.url();
    await page.getByRole('group', { name: 'Answer options' }).getByRole('button').first().click();
    await expect(page.locator('header [role=status]')).toHaveText(isPhone(info) ? 'Saved' : 'All answers saved', { useInnerText: true });
    await page.goto(url);
    await expect(card).toContainText('You have this test in progress');
    await expect(card).toContainText(/1 of 12 answered · \d\d:\d\d left on the timer/);
    await expect(card).toContainText('To start over, submit this attempt first. It will count in your history.');
    await card.getByRole('link', { name: 'Resume test' }).click();
    await expect(page).toHaveURL(attemptUrl);

    // 3. taken before
    await page.request.post(`${API}/api/attempts/${attemptUrl.split('/').pop()}/submit`, { data: {} });
    await page.goto(url);
    await expect(card.getByRole('link', { name: 'Start a new attempt' })).toBeVisible();
    await expect(card.getByRole('link', { name: /^Review last attempt · \d+%$/ })).toBeVisible();
    await expect(card).toContainText(/Attempts: 1 · best \d+% · unlimited attempts while your access lasts\./);
    await card.getByRole('link', { name: /Review last attempt/ }).click();
    await expect(page).toHaveURL(/\/rw\/review\/[a-z0-9]+$/);
    // closing the attempt through the API while its exam page was open answers that page's last calls with 409: expected
    expect(w.errors.filter((e) => !/status of 409/.test(e))).toEqual([]);
  });
});

test.describe('Web: guest taps a paid test (C17)', () => {
  test('the dialog offers account, sign-in and the free sample; after sign-in the user returns to checkout', async ({ page }, info) => {
    const w = watchErrors(page);
    await page.goto(`/rw/tests/${ACCOUNTANT_SLUG}`);
    const buy = isPhone(info) ? page.getByRole('button', { name: 'Unlock with Mobile Money' }) : page.getByRole('button', { name: /^Get Full Access/ });
    await buy.click();
    const dialog = page.getByRole('dialog', { name: 'This test is part of Full Access' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Accountant (Public Institution) — Mock 1 is not free. Full Access unlocks every mock test in Rwanda for 30 days for one payment of RWF 2,000.');
    await expect(dialog).toContainText('Create a free account with Google or your email, so your access belongs to you on any device.');
    await expect(dialog).toContainText('Pay with MTN MoMo or Airtel Money. You come straight back to this test.');
    await expect(dialog).not.toContainText('[PRICE]');
    const next = encodeURIComponent(`/rw/checkout?test=${ACCOUNTANT_SLUG}`);
    await expect(dialog.getByRole('link', { name: 'Create account and continue' })).toHaveAttribute('href', `/sign-up?next=${next}`);
    await expect(dialog.getByRole('link', { name: 'I already have an account' })).toHaveAttribute('href', `/sign-in?next=${next}`);
    await expect(dialog.getByRole('link', { name: /^Try the free \d+-question .* sample instead$/ })).toBeVisible();

    // Esc / Close return to the details
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/rw/tests/${ACCOUNTANT_SLUG}$`));
    w.expectClean();
  });

  test('"I already have an account" signs in and lands on the checkout of that test', async ({ page }, info) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    const id = (await me(page)).id;
    await page.context().clearCookies();
    await page.addInitScript(() => localStorage.removeItem('jobprep.session'));
    await page.goto(`/rw/tests/${ACCOUNTANT_SLUG}`);
    const buy = isPhone(info) ? page.getByRole('button', { name: 'Unlock with Mobile Money' }) : page.getByRole('button', { name: /^Get Full Access/ });
    await buy.click();
    await page.getByRole('link', { name: 'I already have an account' }).click();
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    await signInWithPassword(page, u.email, u.password);
    await expect(page).toHaveURL(new RegExp(`/rw/checkout\\?test=${ACCOUNTANT_SLUG}$`));
    await expect(page.getByRole('button', { name: /^Pay RWF 2,000$/ })).toBeVisible();
    await cleanUser(id);
  });

  test('opening the start link of a paid test as a guest shows the same dialog', async ({ page }) => {
    await page.goto(`/rw/tests/${ACCOUNTANT_SLUG}/start`);
    await expect(page).toHaveURL(new RegExp(`/rw/tests/${ACCOUNTANT_SLUG}\\?gate=paid$`));
    await expect(page.getByRole('dialog', { name: 'This test is part of Full Access' })).toBeVisible();
  });

  test('opening the checkout as a guest also leads to the dialog', async ({ page }) => {
    await page.goto(`/rw/checkout?test=${ACCOUNTANT_SLUG}`);
    await expect(page.getByRole('dialog', { name: 'This test is part of Full Access' })).toBeVisible();
  });
});
