import { expect, test } from '@playwright/test';
import { API, isPhone, watchErrors } from './web-helpers';
import {
  attemptIdFromUrl, choose, clockSeconds, expectSaved, flagButton, FREE_SLUG, FREE_TITLE, guestTokens, nextButton, optionButtons, prevButton,
  questionHeading, saveStatus, serverState, serverTimer, startFreeExam, submitButton,
} from './web-exam-helpers';

test.describe('Web: Flow A (no account) — landing to review to another test', () => {
  test('Teaching -> Secondary Mathematics -> free mock -> answer, flag -> submit -> results -> review -> Try Another Mock Test', async ({ page, request }, info) => {
    const w = watchErrors(page);

    // landing -> Teaching -> Secondary Mathematics -> details -> Start
    await page.goto('/rw');
    await page.getByRole('region', { name: 'Browse by job category' }).getByRole('link', { name: /Teaching positions/ }).click();
    await expect(page).toHaveURL(/\/rw\/tests\?category=teaching-positions/);
    await page.getByRole('link', { name: `View test: ${FREE_TITLE}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: FREE_TITLE })).toBeVisible();
    await page.getByRole('link', { name: 'Start Mock Test' }).click();

    // the exam: no account, a guest token is kept on this device
    await expect(page).toHaveURL(/\/rw\/exam\/[a-z0-9]+$/);
    await expect(questionHeading(page)).toHaveText('Question 1 of 20');
    await expectSaved(page, info);
    expect((await guestTokens(page)).length).toBe(1);
    const id = attemptIdFromUrl(page);
    const tokens = await guestTokens(page);
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(optionButtons(page)).toHaveCount(4);

    // answer 1-4 with A, B, C, D; flag question 3; leave 5+ blank
    for (const [i, letter] of (['A', 'B', 'C', 'D'] as const).entries()) {
      await expect(questionHeading(page)).toHaveText(`Question ${i + 1} of 20`);
      await choose(page, letter);
      await expect(optionButtons(page).nth(i)).toHaveAttribute('aria-pressed', 'true');
      if (i === 2) {
        await flagButton(page).click();
        await expect(flagButton(page)).toHaveAttribute('aria-pressed', 'true');
      }
      await nextButton(page, info).click();
    }
    await expect(questionHeading(page)).toHaveText('Question 5 of 20');
    await expectSaved(page, info);

    // autosave reached the server (answers + flag), the clock is the server's
    await expect.poll(async () => (await serverState(request, id, tokens)).counts).toEqual({ total: 20, answered: 4, flagged: 1 });

    // Submit: confirmation dialog with the counts; "Keep working" closes it
    await submitButton(page, info).click();
    const dialog = page.getByRole('dialog', { name: 'Submit your exam?' });
    await expect(dialog).toBeVisible();
    if (isPhone(info)) await expect(dialog).toContainText('16 unanswered and 1 flagged');
    else {
      await expect(dialog.getByText('Answered', { exact: true }).locator('xpath=following-sibling::dd | preceding-sibling::dd')).toHaveText('4');
      await expect(dialog).toContainText('After submitting you cannot change your answers.');
    }
    await expect(dialog).toContainText('You still have');
    await dialog.getByRole('button', { name: 'Keep working' }).click();
    await expect(dialog).toBeHidden();
    await expect(submitButton(page, info)).toBeFocused(); // focus returns to the opener

    // "Go to first unanswered": question 5
    await nextButton(page, info).click(); // -> 6
    await submitButton(page, info).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Go to (first )?unanswered/ }).click();
    await expect(questionHeading(page)).toHaveText('Question 5 of 20');

    // Submit now -> results
    await submitButton(page, info).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit now' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/results/${id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
    const result = await (await request.get(`${API}/api/attempts/${id}/result`, { headers: { 'X-Guest-Token': tokens.join(',') } })).json();
    await expect(page.getByRole('img', { name: `Score ${Math.round(result.score.percent)} percent` })).toBeVisible();
    await expect(page.getByTestId('no-pass-mark')).toBeVisible();
    await expect(page.getByTestId('no-pass-mark')).toContainText('No official pass mark is published');
    for (const label of ['Correct', 'Incorrect', 'Unanswered', 'Time spent']) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Performance by topic' })).toBeVisible();
    await expect(page.getByText('Weak area').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review these first' })).toBeVisible();
    // a guest sees "Save my result"; "Practice Weak Areas" is drawn but inert (its screen is not designed)
    await expect(page.getByRole('link', { name: 'Save my result' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Practice Weak Areas' })).toHaveAttribute('aria-disabled', 'true');
    // the server closed it
    expect((await serverState(request, id, tokens)).attempt.status).toBe('SUBMITTED');

    // Review
    await page.getByRole('link', { name: 'Review Answers' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/review/${id}$`));
    const counts = (await (await request.get(`${API}/api/attempts/${id}/review`, { params: { filter: 'all' }, headers: { 'X-Guest-Token': tokens.join(',') } })).json()).counts;
    const tab = (name: RegExp) => page.getByRole('group', { name: 'Show' }).filter({ visible: true }).getByRole('button', { name });
    await expect(tab(/^Incorrect \(/)).toHaveText(`Incorrect (${counts.incorrect})`);
    await expect(tab(/^Flagged \(/)).toHaveText('Flagged (1)');
    await expect(tab(/^Unanswered \(/)).toHaveText(`Unanswered (${counts.unanswered})`);
    await expect(tab(/^Incorrect \(/)).toHaveAttribute('aria-pressed', 'true');

    await tab(/^Flagged \(/).click();
    const shown = page.locator('article:visible');
    await expect(shown).toHaveCount(1);
    await expect(shown.getByRole('heading', { name: 'Question 3' })).toBeVisible();
    await expect(shown.getByText('Flagged', { exact: true })).toBeVisible();
    // correct and your pick are marked with text, not colour alone
    await expect(shown.getByText('✓ Correct answer')).toBeVisible();
    await expect(shown.getByText('Explanation')).toBeVisible();

    await tab(/^Unanswered \(/).click();
    await expect(shown.getByText('Not answered').first()).toBeVisible();

    if (isPhone(info)) {
      // one question at a time with Previous / Next
      await tab(/^All$/).click();
      await expect(page.getByText('1 of 20 shown')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText('2 of 20 shown')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Question 2', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Previous', exact: true }).click();
      await expect(page.getByText('1 of 20 shown')).toBeVisible();
    } else {
      // desktop: jump grid covers all 20 questions; jumping to a hidden one switches to All
      const grid = page.getByRole('complementary', { name: 'Jump to a question' });
      await expect(grid.getByRole('link')).toHaveCount(20);
      await expect(grid.getByRole('link', { name: 'Question 3, correct' }).or(grid.getByRole('link', { name: 'Question 3, incorrect' }))).toBeVisible();
      await tab(/^Flagged \(/).click();
      await grid.getByRole('link', { name: /^Question 10, / }).click();
      await expect(page.getByRole('heading', { name: 'Question 10', exact: true })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'All questions' })).toHaveAttribute('aria-pressed', 'true');
    }

    // back to results -> Try Another Mock Test -> the catalog
    await page.getByRole('link', { name: /Back to results/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
    await page.getByRole('link', { name: 'Try Another Mock Test' }).click();
    await expect(page).toHaveURL(/\/rw\/tests$/);
    await expect(page.getByRole('article').first()).toBeVisible();
    w.expectClean();
  });
});

test.describe('Web: exam engine', () => {
  test('refresh mid-exam keeps answers, flags, position and the correct remaining time', async ({ page, request }, info) => {
    const w = watchErrors(page);
    const id = await startFreeExam(page);
    const tokens = await guestTokens(page);

    await choose(page, 'B');
    await nextButton(page, info).click();
    await choose(page, 'C');
    await flagButton(page).click();
    await nextButton(page, info).click();
    await expect(questionHeading(page)).toHaveText('Question 3 of 20');
    await expectSaved(page, info);
    await expect.poll(async () => (await serverState(request, id, tokens)).counts).toMatchObject({ answered: 2, flagged: 1 });

    await page.reload();
    await expect(questionHeading(page)).toHaveText('Question 3 of 20'); // same position
    await expect(page).toHaveURL(new RegExp(`/exam/${id}$`));
    await prevButton(page, info).click();
    await expect(questionHeading(page)).toHaveText('Question 2 of 20');
    await expect(optionButtons(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(flagButton(page)).toHaveAttribute('aria-pressed', 'true');
    await prevButton(page, info).click();
    await expect(optionButtons(page).nth(1)).toHaveAttribute('aria-pressed', 'true');

    // the clock after the refresh is the server's clock (within a couple of seconds), not a fresh 30:00
    const [shown, server] = [await clockSeconds(page), await serverTimer(request, id, tokens)];
    expect(Math.abs(shown - server.remainingSeconds)).toBeLessThanOrEqual(3);
    expect(shown).toBeLessThanOrEqual(30 * 60);
    w.expectClean();
  });

  test('the timer follows the server, not the device clock', async ({ page, request }) => {
    await page.addInitScript(() => {
      // A phone whose date is wrong by a year must not change the countdown.
      const real = Date.now;
      Date.now = () => real() + 365 * 86_400_000;
    });
    const id = await startFreeExam(page);
    const tokens = await guestTokens(page);
    const server = await serverTimer(request, id, tokens);
    expect(Math.abs((await clockSeconds(page)) - server.remainingSeconds)).toBeLessThanOrEqual(3);
  });

  test('offline for 2 full minutes: answers are kept, the banner says so, the clock stays right, and everything saves on reconnect', async ({ page, context, request }, info) => {
    test.slow();
    test.setTimeout(300_000);
    const w = watchErrors(page);
    const id = await startFreeExam(page);
    const tokens = await guestTokens(page);
    await choose(page, 'A');
    await nextButton(page, info).click();
    await expectSaved(page, info);
    await expect.poll(async () => (await serverState(request, id, tokens)).counts.answered).toBe(1);

    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'No connection.' })).toContainText(
      'Keep answering — your answers are kept on this',
    );
    await expect(page.getByText('The timer keeps running while offline, exactly as it would in the exam room.')).toBeVisible();

    // answer 3 questions while offline
    await choose(page, 'B');
    await nextButton(page, info).click();
    await choose(page, 'C');
    await nextButton(page, info).click();
    await choose(page, 'D');
    await expect(saveStatus(page)).toHaveText('3 answers waiting to save', { useInnerText: true });
    const before = await clockSeconds(page);

    // stay offline for two full minutes
    await page.waitForTimeout(125_000);
    const after = await clockSeconds(page);
    expect(before - after).toBeGreaterThanOrEqual(120);
    expect(before - after).toBeLessThanOrEqual(130);
    await expect(saveStatus(page)).toHaveText('3 answers waiting to save', { useInnerText: true });
    // nothing reached the server while offline
    expect((await serverState(request, id, tokens)).counts.answered).toBe(1);

    await context.setOffline(false);
    await expect(page.getByText('No connection.')).toBeHidden({ timeout: 20_000 });
    await expectSaved(page, info);
    await expect.poll(async () => (await serverState(request, id, tokens)).counts.answered, { timeout: 20_000 }).toBe(4);
    const state = await serverState(request, id, tokens);
    const picked = state.questions.slice(0, 4).map((q) => state.answers[q.id]?.selected[0]);
    expect(picked).toEqual(['A', 'B', 'C', 'D']);

    // the clock after reconnecting matches the server
    const server = await serverTimer(request, id, tokens);
    expect(Math.abs((await clockSeconds(page)) - server.remainingSeconds)).toBeLessThanOrEqual(4);

    // and a reload shows the same
    await page.reload();
    await expect(questionHeading(page)).toBeVisible();
    await expect(optionButtons(page).nth(3)).toHaveAttribute('aria-pressed', 'true');
    // The browser itself logs every refused request while offline; anything else is a real error.
    expect(w.errors.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED'))).toEqual([]);
  });

  test('a refresh while the save cannot reach the server keeps the answer (IndexedDB queue merged onto the server state) and sends it afterwards', async ({ page, request }, info) => {
    const id = await startFreeExam(page);
    const tokens = await guestTokens(page);
    // The API refuses autosave (as if the connection dropped right then); the page itself still loads.
    await page.route('**/api/attempts/*/answers', (route) => route.abort('connectionfailed'));
    await choose(page, 'D');
    await expect(saveStatus(page)).toHaveText('1 answer waiting to save', { useInnerText: true, timeout: 15_000 });
    expect((await serverState(request, id, tokens)).counts.answered).toBe(0);
    // it is in IndexedDB, keyed by the attempt id
    const queued = await page.evaluate(
      (attempt) =>
        new Promise<unknown>((resolve, reject) => {
          const open = indexedDB.open('jobprep-exam', 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const get = open.result.transaction('queues').objectStore('queues').get(attempt);
            get.onsuccess = () => resolve(get.result);
          };
        }),
      id,
    );
    expect(queued).toMatchObject({ attemptId: id, items: [{ questionId: expect.any(String), field: 'selected', selected: ['D'] }] });

    // refresh: the screen still shows D (the page also fires a last keepalive save as it unloads)
    await page.reload();
    await expect(questionHeading(page)).toBeVisible();
    await expect(optionButtons(page).nth(3)).toHaveAttribute('aria-pressed', 'true');

    // the connection returns: the queue is sent and the server has the answer
    await page.unroute('**/api/attempts/*/answers');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => (await serverState(request, id, tokens)).counts.answered).toBe(1);
    await expectSaved(page, info);
  });

  test('keyboard only: answer, flag, navigate and submit without a mouse', async ({ page }, info) => {
    test.skip(isPhone(info), 'keyboard run is the desktop layout');
    const id = await startFreeExam(page);
    expect(id).toBeTruthy();
    // header: Submit exam is first in the tab order after the (non-focusable) clock
    await page.keyboard.press('Tab'); // Submit exam
    await expect(submitButton(page, info)).toBeFocused();
    await page.keyboard.press('Tab'); // Flag for review
    await expect(flagButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(flagButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab'); // option A
    await page.keyboard.press('Tab'); // option B
    await expect(optionButtons(page).nth(1)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(optionButtons(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
    // visible focus ring on the focused option
    const outline = await optionButtons(page).nth(1).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
    for (let i = 0; i < 2; i++) await page.keyboard.press('Tab'); // options C, D
    await page.keyboard.press('Tab'); // Previous (disabled on question 1 is skipped) -> Next
    await expect(nextButton(page, info)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(questionHeading(page)).toHaveText('Question 2 of 20');
    await expect(nextButton(page, info)).toBeFocused(); // focus stays where the user is working: no key trap, no focus loss

    // the submit dialog: Enter on Submit opens it, focus is inside, Tab stays inside, Esc closes and returns focus
    await submitButton(page, info).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Submit your exam?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.querySelector('[role=dialog]')?.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(submitButton(page, info)).toBeFocused();

    // submit with the keyboard
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Submit now' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
  });

  test('phone: the navigator is a bottom sheet dialog (focus in, trapped, Esc closes, focus returns)', async ({ page }, info) => {
    test.skip(!isPhone(info), 'the bottom sheet is the phone layout');
    await startFreeExam(page);
    await choose(page, 'A');
    const opener = page.getByRole('button', { name: /^All questions · 1\/20$/ });
    await opener.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Questions' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('1 answered');
    await expect(sheet).toContainText('19 left');
    await expect(sheet.getByRole('button', { name: 'Question 1, answered' })).toBeVisible();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.querySelector('[role=dialog]')?.contains(document.activeElement))).toBe(true);
    }
    await sheet.getByRole('button', { name: 'Question 7, not answered' }).click();
    await expect(questionHeading(page)).toHaveText('Question 7 of 20');
    await opener.click();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('touch targets on the exam are at least 44px', async ({ page }, info) => {
    await startFreeExam(page);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, a[href]')]
        .filter((el) => el.offsetParent !== null && !el.closest('[aria-label="Question navigator"]'))
        .map((el) => ({ name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }))
        .filter((x) => x.h < 44),
    );
    expect(small, JSON.stringify(small)).toEqual([]);
    void info;
  });

  test('FREE_SLUG start is resumed, not duplicated, when the link is opened again', async ({ page, request }) => {
    const id = await startFreeExam(page);
    await page.goto(`/rw/tests/${FREE_SLUG}/start`);
    await expect(page).toHaveURL(new RegExp(`/exam/${id}$`));
    const tokens = await guestTokens(page);
    expect(tokens).toHaveLength(1);
    expect((await serverState(request, id, tokens)).attempt.status).toBe('IN_PROGRESS');
  });

  test('the resume prompt on the details page: Resume continues, Submit as it is closes the attempt', async ({ page, request }, info) => {
    const id = await startFreeExam(page);
    const tokens = await guestTokens(page);
    await choose(page, 'A');
    await expectSaved(page, info);
    await expect.poll(async () => (await serverState(request, id, tokens)).counts.answered).toBe(1);
    await page.goto(`/rw/tests/${FREE_SLUG}`);
    const prompt = page.getByRole('region', { name: 'You have a test in progress' });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(`${FREE_TITLE} · 1 of 20 answered ·`);
    await expect(prompt).toContainText(' left');
    await prompt.getByRole('link', { name: 'Resume' }).click();
    await expect(page).toHaveURL(new RegExp(`/exam/${id}$`));
    await page.goto(`/rw/tests/${FREE_SLUG}`);
    await page.getByRole('region', { name: 'You have a test in progress' }).getByRole('button', { name: 'Submit as it is' }).click();
    await expect(page).toHaveURL(new RegExp(`/results/${id}$`));
    expect((await serverState(request, id, tokens)).attempt.status).toBe('SUBMITTED');
    await page.goto(`/rw/tests/${FREE_SLUG}`);
    await expect(page.getByRole('region', { name: 'You have a test in progress' })).toHaveCount(0);
  });

  test('"Save my result" opens sign-up carrying the guest token and returns to the results', async ({ page }) => {
    const id = await startFreeExam(page);
    const tokens = await guestTokens(page);
    await page.goto(`/rw/exam/${id}`);
    await page.getByRole('button', { name: /^(Submit|Submit exam)$/ }).first().click();
    await page.getByRole('button', { name: 'Submit now' }).click();
    await expect(page).toHaveURL(new RegExp(`/results/${id}$`));
    await page.getByRole('link', { name: 'Save my result' }).click();
    await expect(page).toHaveURL(new RegExp(`/sign-up\\?next=${encodeURIComponent(`/rw/results/${id}`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect((await guestTokens(page)).sort()).toEqual(tokens.sort());
  });
});
