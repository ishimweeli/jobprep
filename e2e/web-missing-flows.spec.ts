import { expect, test } from '@playwright/test';
import { API, expectNoHorizontalScroll, isPhone, signUpViaApi, watchErrors } from './web-helpers';
import { ACCOUNTANT_SLUG, attemptIdFromUrl, buyAccessViaApi, choose, completeViaApi, FREE_SLUG, startFreeExam, submitButton } from './web-exam-helpers';

/**
 * Flows built without a design (docs/missing-built-candidate.md): the catalog's Request this exam, filters and Load more,
 * results edge states and practice results, the finished-attempt screen, the practice finish dialog and the maintenance page.
 */

test.describe('Web: catalog (C10, C31, C32)', () => {
  test('Request this exam opens a dialog (phone: bottom sheet), validates and confirms', async ({ page }) => {
    const w = watchErrors(page);
    await page.goto('/rw/tests?q=zzqxvet');
    await expect(page.getByText(/No mock tests match/)).toBeVisible();
    await page.getByRole('button', { name: 'Request this exam' }).click();
    const dialog = page.getByRole('dialog', { name: 'Request this exam' });
    await expect(dialog.getByLabel('Job or exam')).toHaveValue('zzqxvet');
    await dialog.getByLabel('Email (optional)').fill('nope');
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(dialog.getByText('Enter a valid email address, like name@example.com.')).toBeVisible();
    await dialog.getByLabel('Email (optional)').fill('');
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('dialog', { name: /Request sent|You already asked for this/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    w.expectClean();
  });

  test('a failed request shows a friendly error and Try again', async ({ page }) => {
    await page.route('**/api/countries/rw/exam-requests', (route) => route.fulfill({ status: 500, json: { error: 'internal_error' } }));
    await page.goto('/rw/tests?q=zzqxvet');
    await page.getByRole('button', { name: 'Request this exam' }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('alert')).toContainText('Something went wrong on our side');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('Next opens the next page of jobs and Back returns; the sort offers Free first', async ({ page }, info) => {
    await page.route(/\/api\/countries\/rw\/jobs(\?|$)/, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('pageSize', '2');
      const res = await route.fetch({ url: url.toString() });
      await route.fulfill({ response: res });
    });
    await page.goto('/rw/tests');
    const cards = page.locator('main article');
    await expect(cards).toHaveCount(2);
    const firstJob = await cards.first().locator('h2').innerText();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    await expect(cards.first().locator('h2')).not.toHaveText(firstJob);
    await page.goBack();
    await expect(cards.first().locator('h2')).toHaveText(firstJob);
    if (!isPhone(info)) await expect(page.getByLabel('Sort')).toContainText('Free first');
    await expectNoHorizontalScroll(page);
  });

  test('the phone filter sheet has subject, language and sort (Free first)', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the sheet is the phone layout');
    await page.goto('/rw/tests');
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet.getByLabel('Subject / role')).toBeVisible();
    await expect(sheet.getByRole('group', { name: 'Language' })).toBeVisible();
    await sheet.getByText('Free first', { exact: true }).click();
    await expect(page).toHaveURL(/sort=free_first/);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('Web: results and practice (C2, C6, C9, C18, C1)', () => {
  test('a guest result: no auto-submitted line; Save my result returns with "Saved."', async ({ page }, info) => {
    const id = await startFreeExam(page);
    await page.goto(`/rw/exam/${id}`);
    if (isPhone(info)) await page.getByRole('button', { name: /^All questions/ }).click();
    await page.getByRole('button', { name: 'Submit exam', exact: true }).click();
    await page.getByRole('button', { name: 'Submit now' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/results/${id}$`));
    // blank exam: the zero-answered line
    await expect(page.getByTestId('results-summary-line')).toContainText('You did not answer any questions');
    await expect(page.getByTestId('auto-submitted')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Save my result' })).toHaveAttribute('href', new RegExp('saved%3D1'));
  });

  test('a signed-in result has no Save banner; ?saved=1 shows "Saved."', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    const attemptId = await completeViaApi(page.request, FREE_SLUG, 'AAAAAAAAAAAAAAAAAAAA');
    await page.goto(`/rw/results/${attemptId}`);
    await expect(page.getByRole('link', { name: 'Save my result' })).toHaveCount(0);
    await page.goto(`/rw/results/${attemptId}?saved=1`);
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(page.getByText('Find this result under My progress.')).toBeVisible();
  });

  test('a finished attempt link says "This attempt has ended" with See results and Start a new attempt', async ({ page }) => {
    const w = watchErrors(page);
    await signUpViaApi(page, 'Aline Uwase');
    const attemptId = await completeViaApi(page.request, FREE_SLUG, 'AAAAAAAAAAAAAAAAAAAA');
    await page.goto(`/rw/exam/${attemptId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'This attempt has ended' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start a new attempt' })).toHaveAttribute('href', `/rw/tests/${FREE_SLUG}/start`);
    await expectNoHorizontalScroll(page);
    await page.getByRole('link', { name: 'See results' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/results/${attemptId}$`));
    w.expectClean();
  });

  test('practice: End practice asks "Finish practice?" with counts; the results are "Practice results" with no comparison', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    const attemptId = await completeViaApi(page.request, FREE_SLUG, 'AAAAAAAAAAAAAAAAAAAA');
    const practice = (await (await page.request.post(`${API}/api/attempts/${attemptId}/practice`, { data: {} })).json()) as { attemptId: string };
    await page.goto(`/rw/exam/${practice.attemptId}`);
    await choose(page, 'A');
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Correct|Not quite|Partly correct/ })).toBeVisible();
    await page.getByRole('button', { name: 'End practice' }).click();
    const dialog = page.getByRole('dialog', { name: 'Finish practice?' });
    await expect(dialog).toContainText('You have answered 1 of');
    await dialog.getByRole('button', { name: 'Keep practising' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'End practice' }).click();
    await page.getByRole('button', { name: 'Finish now' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Practice finished' })).toBeVisible();
    await page.goto(`/rw/results/${practice.attemptId}`);
    await expect(page.getByRole('heading', { name: 'Practice results' }).first()).toBeVisible();
    await expect(page.getByText('Practice answers do not change your mock test scores.')).toBeVisible();
    await expect(page.getByText(/from your last attempt/)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('reviewing a case-based test offers the case study (phone: switch; desktop: collapsible)', async ({ page }, info) => {
    const u = await signUpViaApi(page, 'Aline Uwase');
    // the accountant test is part of Full Access: buy it through the fake provider first
    await buyAccessViaApi(page.request, u.phone);
    const attemptId = await completeViaApi(page.request, ACCOUNTANT_SLUG, 'A');
    const review = (await (await page.request.get(`${API}/api/attempts/${attemptId}/review?filter=all`)).json()) as { items: { number: number; caseId: string | null }[] };
    const q = review.items.find((i) => i.caseId);
    expect(q, 'the seeded accountant test has a case-based question').toBeTruthy();
    await page.goto(`/rw/review/${attemptId}?q=${q!.number}`);
    if (isPhone(info)) {
      await page.getByRole('button', { name: 'Case study', exact: true }).first().click();
      await expect(page.getByRole('group', { name: /./ }).first()).toBeVisible();
    } else {
      const toggle = page.getByRole('button', { name: /^Case study · questions/ }).first();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    }
  });
});

test.describe('Web: exam offline banner (phone)', () => {
  test('"Back online" shows on a phone too', async ({ page, context }, info) => {
    test.skip(!isPhone(info), 'phone banner');
    await startFreeExam(page);
    await choose(page, 'A');
    await context.setOffline(true);
    await expect(page.getByText('No connection.')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText('Back online.')).toBeVisible();
    expect(attemptIdFromUrl(page).length).toBeGreaterThan(0);
    if (isPhone(info)) await expect(page.getByRole('button', { name: /^All questions/ })).toBeVisible();
    else await expect(submitButton(page, info)).toBeVisible();
  });
});

test.describe('Web: maintenance (C26)', () => {
  test('when the API says maintenance is on, the maintenance page shows the admin message', async ({ page }) => {
    await page.route('**/api/status', (route) => route.fulfill({ json: { ok: true, maintenance: { enabled: true, message: 'Upgrading the database.', backAt: null } } }));
    await page.goto('/rw');
    await expect(page.getByRole('heading', { level: 1, name: 'JobPrep is being updated' })).toBeVisible();
    await expect(page.getByText('Upgrading the database.')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
