import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { API, expectNoHorizontalScroll, isPhone, signUpViaApi, watchErrors } from './web-helpers';
import { attemptIdFromUrl, FREE_SLUG, guestTokens, questionHeading, serverState, startFreeExam, submitButton } from './web-exam-helpers';
import { cleanUser, me } from './web-p3-helpers';

/** Go to question 7 of the seeded free Secondary Mathematics test ("Select ALL the prime numbers", choose 2). */
async function gotoQuestion7(page: Page, info: TestInfo) {
  if (isPhone(info)) {
    await page.getByRole('button', { name: /^All questions/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Question 7,/ }).click();
  } else {
    await page.getByRole('button', { name: /^Question 7,/ }).click();
  }
  await expect(questionHeading(page)).toHaveText('Question 7 of 20');
}

const boxes = (page: Page) => page.getByRole('group', { name: 'Answer options, choose 2' }).getByRole('checkbox');

test.describe('Web: multiple-select and "Partly correct" (C3, C5)', () => {
  test('pick, the cap at "Choose 2", the live count, the answered mark and the partly correct review', async ({ page, request }, info) => {
    const w = watchErrors(page);
    await startFreeExam(page);
    const id = attemptIdFromUrl(page);
    await gotoQuestion7(page, info);

    // the question says how many to choose
    await expect(page.getByText('Choose 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Select ALL the prime numbers.')).toContainText('Choose 2.');
    await expect(boxes(page)).toHaveCount(4);
    await expect(page.getByRole('status').filter({ hasText: /of 2 chosen/ })).toHaveText('0 of 2 chosen');

    await boxes(page).nth(0).click(); // A = 2 (prime)
    await expect(boxes(page).nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('status').filter({ hasText: /of 2 chosen/ })).toHaveText('1 of 2 chosen — choose 1 more');

    await boxes(page).nth(1).click(); // B = 9 (not prime)
    await expect(page.getByRole('status').filter({ hasText: /of 2 chosen/ })).toHaveText('2 of 2 chosen');

    // a 3rd pick changes nothing and says how to change
    await boxes(page).nth(2).click();
    await expect(boxes(page).nth(2)).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('status').filter({ hasText: /Unselect one/ })).toHaveText('You’ve chosen 2. Unselect one to change your answer.');
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(2);
    await expectNoHorizontalScroll(page);

    // unselect B: a normal count again, and the server holds A only
    await boxes(page).nth(1).click();
    await expect(page.getByRole('status').filter({ hasText: /of 2 chosen/ })).toHaveText('1 of 2 chosen — choose 1 more');
    const tokens = await guestTokens(page);
    await expect.poll(async () => {
      const s = await serverState(request, id, tokens);
      const q7 = s.questions.find((q) => q.number === 7)!;
      return s.answers[q7.id]?.selected;
    }).toEqual(['A']);

    // answered on the navigator once at least one is picked
    if (isPhone(info)) {
      await page.getByRole('button', { name: /^All questions/ }).click();
      await expect(page.getByRole('dialog').getByRole('button', { name: /^Question 7, answered/ })).toBeVisible();
      await page.keyboard.press('Escape');
    } else {
      await expect(page.getByRole('button', { name: /^Question 7, answered/ })).toBeVisible();
    }

    // submit, then the review shows "Partly correct" with marks and each choice marked
    await submitButton(page, info).click();
    await page.getByRole('button', { name: 'Submit now' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/results/${id}$`));
    await page.getByRole('link', { name: 'Review Answers' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/review/${id}`));
    await page.goto(`/rw/review/${id}?q=7`);
    const card = page.locator('#rq7');
    await expect(card).toBeVisible();
    await expect(card.getByText('Partly correct')).toBeVisible(); // a label, not colour alone
    await expect(card).toContainText('1 of 2 marks');
    await expect(card).toContainText('Choose 2');
    await expect(card).toContainText('✓ Correct · your choice');
    await expect(card).toContainText('✓ Correct · you missed this one');
    await expect(card).not.toContainText('[SCORING RULE');
    if (!isPhone(info)) {
      // partly correct answers are listed under Incorrect and carry their own mark on the jump grid
      await page.getByRole('button', { name: /^Incorrect \(/ }).click();
      await expect(page.locator('#rq7')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Question 7, partly correct' })).toHaveText('7◐');
      await expect(page.getByText(/Partly correct, marked ◐ \(1\)/)).toBeVisible();
    }
    w.expectClean();
  });

  test('the server also refuses a pick over the limit (too_many_choices)', async ({ page, request }) => {
    await startFreeExam(page);
    const id = attemptIdFromUrl(page);
    const tokens = await guestTokens(page);
    const s = await serverState(request, id, tokens);
    const q7 = s.questions.find((q) => q.number === 7)!;
    const res = await request.put(`${API}/api/attempts/${id}/answers`, { headers: { 'X-Guest-Token': tokens.join(',') }, data: { changes: [{ questionId: q7.id, selected: ['A', 'B', 'C'] }] } });
    expect(((await res.json()) as { results: { error: string }[] }).results[0]?.error).toBe('too_many_choices');
  });
});

test.describe('Web: practice runner (C1)', () => {
  let userId: string | null = null;
  test.afterEach(async () => {
    if (userId) await cleanUser(userId);
    userId = null;
  });

  test('results -> Practice Weak Areas -> answer -> check -> explanation -> end -> summary', async ({ page }, info) => {
    const w = watchErrors(page);
    // a mock test with everything answered "A": several topics end up weak
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    const start = await page.request.post(`${API}/api/countries/RW/mock-tests/${FREE_SLUG}/attempts`, { data: {} });
    const { attemptId } = (await start.json()) as { attemptId: string };
    const state = (await (await page.request.get(`${API}/api/attempts/${attemptId}`)).json()) as { questions: { id: string }[] };
    await page.request.put(`${API}/api/attempts/${attemptId}/answers`, { data: { changes: state.questions.map((q) => ({ questionId: q.id, selected: ['A'] })).slice(0, 12) } });
    await page.request.post(`${API}/api/attempts/${attemptId}/submit`, { data: {} });

    await page.goto(`/rw/results/${attemptId}`);
    await page.getByRole('button', { name: 'Practice Weak Areas' }).click();
    await expect(page).toHaveURL(/\/rw\/exam\/[a-z0-9]+$/);

    // labelled as practice: untimed, no timer, no submit, no flag, no navigator
    await expect(page.locator('header').getByText(/^Weak-area practice/).filter({ visible: true })).toBeVisible();
    await expect(page.getByText('Untimed')).toBeVisible();
    if (!isPhone(info)) await expect(page.getByText('Feedback after every question · doesn’t affect your scores')).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Submit|Flag/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /^Question 1 of \d+$/ })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // before checking: no explanation, "Check answer" needs a pick
    const check = page.getByRole('button', { name: 'Check answer' });
    await expect(check).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Explanation')).toHaveCount(0);
    const options = page.getByRole('group', { name: /Answer options/ }).getByRole('button');
    const multi = (await page.getByRole('checkbox').count()) > 0;
    if (multi) await page.getByRole('checkbox').first().click();
    else await options.first().click();
    await check.click();
    await expect(page.getByRole('button', { name: 'Next question' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /Correct|Not quite|Partly correct/ })).toBeVisible();
    await expect(page.getByText('✓ Correct').first()).toBeVisible();
    await expect(check).toHaveCount(0);

    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^Question 2 of \d+$/ })).toBeVisible();
    await page.getByRole('button', { name: 'End practice' }).click();
    await page.getByRole('dialog', { name: 'Finish practice?' }).getByRole('button', { name: 'Finish now' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Practice finished' })).toBeVisible();
    await expect(page.getByText(/You answered 1 question on .* and got [01] right\. Practice answers don’t change your mock test scores\./)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Practise \d+ more$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Take a full mock test' })).toHaveAttribute('href', '/rw/tests');

    // the practice attempt is closed; it never changed the mock test's own score
    await page.getByRole('button', { name: /^Practise \d+ more$/ }).click();
    await expect(page).toHaveURL(/\/rw\/exam\/[a-z0-9]+$/);
    await expect(page.getByRole('heading', { level: 1, name: /^Question 1 of \d+$/ })).toBeVisible();
    w.expectClean();
  });

  test('a practice set answered to the end reaches the summary and a finished set opens its results', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    const start = await page.request.post(`${API}/api/countries/RW/mock-tests/${FREE_SLUG}/attempts`, { data: {} });
    const { attemptId } = (await start.json()) as { attemptId: string };
    await page.request.post(`${API}/api/attempts/${attemptId}/submit`, { data: {} });
    const practice = (await (await page.request.post(`${API}/api/attempts/${attemptId}/practice`, { data: {} })).json()) as { attemptId: string; questionCount: number };
    await page.goto(`/rw/exam/${practice.attemptId}`);
    for (let i = 1; i <= practice.questionCount; i++) {
      await expect(page.getByRole('heading', { level: 1, name: `Question ${i} of ${practice.questionCount}` })).toBeVisible();
      const multi = (await page.getByRole('checkbox').count()) > 0;
      if (multi) await page.getByRole('checkbox').first().click();
      else await page.getByRole('group', { name: /Answer options/ }).getByRole('button').first().click();
      await page.getByRole('button', { name: 'Check answer' }).click();
      if (i < practice.questionCount) await page.getByRole('button', { name: 'Next question' }).click();
      else {
        // the last question offers Finish practice, which asks first
        await page.getByRole('button', { name: 'Finish practice' }).click();
        await page.getByRole('dialog', { name: 'Finish practice?' }).getByRole('button', { name: 'Finish now' }).click();
      }
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Practice finished' })).toBeVisible();
    await expect(page.getByText(new RegExp(`You answered ${practice.questionCount} questions`))).toBeVisible();
    // reopening a finished set says it has ended and offers the results (no comparison, no history for practice)
    await page.goto(`/rw/exam/${practice.attemptId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'This attempt has ended' })).toBeVisible();
    await page.getByRole('link', { name: 'See results' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/results/${practice.attemptId}$`));
    await expect(page.getByRole('heading', { name: 'Compared with earlier attempts' })).toHaveCount(0);
  });

  test('the API only gives the explanation after the answer was saved', async ({ page }) => {
    await signUpViaApi(page, 'Aline Uwase');
    userId = (await me(page)).id;
    const start = await page.request.post(`${API}/api/countries/RW/mock-tests/${FREE_SLUG}/attempts`, { data: {} });
    const { attemptId } = (await start.json()) as { attemptId: string };
    await page.request.post(`${API}/api/attempts/${attemptId}/submit`, { data: {} });
    const practice = (await (await page.request.post(`${API}/api/attempts/${attemptId}/practice`, { data: {} })).json()) as { attemptId: string };
    const state = (await (await page.request.get(`${API}/api/attempts/${practice.attemptId}`)).json()) as { questions: { id: string }[] };
    const early = await page.request.post(`${API}/api/attempts/${practice.attemptId}/check`, { data: { questionId: state.questions[0]!.id } });
    expect(early.status()).toBe(409);
    expect(((await early.json()) as { error: string }).error).toBe('answer_first');
  });
});
