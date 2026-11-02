import { expect, test, type Page } from '@playwright/test';
import { API, isPhone, signUpViaApi, watchErrors } from './web-helpers';
import { ACCOUNTANT_SLUG, buyAccessViaApi, completeViaApi, FREE_SLUG } from './web-exam-helpers';

/** A signed-in user with Full Access, two finished attempts of the free test, one finished paid test and one running. */
async function seedUser(page: Page) {
  const me = await signUpViaApi(page, 'Aline Uwase');
  const r = page.request;
  const cats = (await (await r.get(`${API}/api/countries/RW/categories`)).json()) as { categories?: { id: string; slug: string }[] } | { id: string; slug: string }[];
  const list = Array.isArray(cats) ? cats : (cats.categories ?? []);
  await r.patch(`${API}/api/me`, { data: { goalCategoryId: list.find((c) => c.slug === 'teaching-positions')?.id } });
  await buyAccessViaApi(r, me.phone);
  await completeViaApi(r, FREE_SLUG, 'ABCDABCDABCDABCDABCD');
  await completeViaApi(r, FREE_SLUG, 'BBBBBBBBBBBBBBBBBBBB');
  await completeViaApi(r, ACCOUNTANT_SLUG, 'AAAAAAAAAAAA');
  const running = await r.post(`${API}/api/countries/RW/mock-tests/${ACCOUNTANT_SLUG}/attempts`, { data: {} });
  const { attemptId } = (await running.json()) as { attemptId: string };
  const state = await (await r.get(`${API}/api/attempts/${attemptId}`)).json();
  await r.put(`${API}/api/attempts/${attemptId}/answers`, { data: { changes: state.questions.slice(0, 3).map((q: { id: string }) => ({ questionId: q.id, selected: ['A'] })) } });
  return { ...me, runningId: attemptId };
}

test.describe('Web: dashboard / My progress', () => {
  test('shows greeting, resume, recommended practice, history, topics, recent attempts and access', async ({ page }, info) => {
    const w = watchErrors(page);
    const u = await seedUser(page);
    await page.goto('/rw/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Muraho, Aline' })).toBeVisible();

    // goal line; "Change goal" is drawn but inert (no designed screen)
    await expect(page.getByText(/Preparing for|Goal:/).filter({ visible: true }).first()).toBeVisible();
    const change = page.locator('[aria-disabled=true]').filter({ hasText: /Change/ }).filter({ visible: true });
    await expect(change).toHaveAttribute('aria-disabled', 'true');

    // resume
    const resume = page.getByRole('region', { name: 'Continue where you stopped' });
    await expect(resume).toContainText('Accountant (Public Institution) — Mock 1');
    await expect(resume).toContainText(/3 of 12 answered · \d\d:\d\d left/);
    await resume.getByRole('link', { name: 'Resume test' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/tests/${ACCOUNTANT_SLUG}/start$`));
    await expect(page).toHaveURL(new RegExp(`/rw/exam/${u.runningId}$`)); // resumed, not restarted
    await page.goBack(); // the start page redirected (replace) to the exam, so one step back is the dashboard
    await expect(page.getByRole('heading', { level: 1, name: 'Muraho, Aline' })).toBeVisible();

    // recommended practice: drawn, inert
    const rec = page.getByRole('region', { name: 'Recommended next' });
    await expect(rec).toContainText(/practice/);
    await expect(rec).toContainText(/Your weakest topic at \d+%/);
    await expect(rec.getByRole('button', { name: 'Start practice' })).toHaveAttribute('aria-disabled', 'true');

    // score history
    await expect(page.getByRole('img', { name: /^Scores: \d+ percent on \d+ \w+, \d+ percent on \d+ \w+/ })).toBeVisible();

    // topics
    const topics = page.getByRole('region', { name: 'Topics' });
    await expect(topics.getByText(/needs work/i)).toBeVisible();
    await expect(topics.getByText('Practise').first()).toHaveAttribute('aria-disabled', 'true');

    // recently completed -> results
    const done = page.getByRole('region', { name: 'Recently completed' });
    await expect(done.getByRole('link').first()).toContainText(/\d+%/);
    await expect(done).toContainText('attempt 2');
    await done.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/rw\/results\/[a-z0-9]+$/);
    await page.goBack();

    // access
    const access = page.getByRole('region', { name: 'My access' });
    await expect(access).toContainText('Full Access · all mock tests');
    await expect(access).toContainText('Active');
    await expect(access).toContainText(/\d+ days left · until \d+ \w+/);

    // navigation
    if (isPhone(info)) {
      const tabs = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
      await expect(tabs.getByRole('link')).toHaveText(['Mock tests', 'My progress', 'Access']);
      await expect(tabs.getByRole('link', { name: 'My progress' })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('link', { name: /Country: .*Rwanda/ })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My progress' })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('link', { name: 'Browse mock tests' })).toBeVisible();
    }
    w.expectClean();
  });

  test('a guest is sent to sign-up and comes back to My progress afterwards', async ({ page }) => {
    await page.goto('/rw/progress');
    await expect(page).toHaveURL(/\/sign-up\?next=%2Frw%2Fprogress$/);
  });

  test('a new account with no attempts shows only what the artboard can show (no placeholder screens)', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    await page.goto('/rw/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Muraho, Aline' })).toBeVisible();
    for (const name of ['Continue where you stopped', 'Recommended next', 'Score history', 'Topics', 'Recently completed', 'My access']) {
      await expect(page.getByRole('region', { name })).toHaveCount(0);
    }
  });
});
