import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { BASE, adminApi, expectNoHorizontalScroll, isPhone, signInAs, startGuestAttempt, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

const TEST_TITLE = 'Procurement Officer — Free Sample';

interface Target { testId: string; questionId: string; stem: string; explanation: string }

/** An editable (single-answer, no case) question of the free sample, found through the admin API. */
async function findTarget(api: APIRequestContext): Promise<Target> {
  const list = await (await api.get('/api/admin/exams', { params: { q: TEST_TITLE } })).json();
  const test = list.results.find((r: { title: string }) => r.title === TEST_TITLE);
  const detail = await (await api.get(`/api/admin/mock-tests/${test.id}`)).json();
  for (const q of detail.questions as { id: string; type: string; status: string }[]) {
    if (q.type !== 'SINGLE_CHOICE' || q.status !== 'PUBLISHED') continue;
    const d = await (await api.get(`/api/admin/questions/${q.id}`)).json();
    if (!d.question.case && d.reports.length === 0) return { testId: test.id, questionId: q.id, stem: d.question.stem, explanation: d.question.explanation };
  }
  throw new Error('no editable question in the free sample');
}

async function reportAsGuest(request: APIRequestContext, questionId: string, message: string) {
  const a = await startGuestAttempt(request);
  const r = await request.post(`${BASE}/api/attempts/${a.attemptId}/reports`, { headers: a.headers, data: { questionId, message } });
  expect(r.status()).toBe(201);
}

const restore = async (api: APIRequestContext, t: Target) =>
  api.patch(`/api/admin/questions/${t.questionId}`, { data: { stem: t.stem, explanation: t.explanation, status: 'PUBLISHED', resolveReports: true } });

async function openQuestion(page: Page, t: Target) {
  await page.goto(`/admin/exams/${t.testId}/q/${t.questionId}`);
  await expect(page.getByLabel('Question', { exact: true })).toBeVisible();
}

test.describe('Exams & questions', () => {
  test('list: header totals, search, category, status badges; opening a test opens its first question', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/exams');
    await expect(page.getByRole('region', { name: 'Mock tests' })).toBeVisible();
    if (!isPhone(info)) {
      await expect(page.getByText(/^\d[\d,]* mock tests · \d[\d,]* questions · \d+ categories$/)).toBeVisible();
      // formerly inert: now real links to the import and the new-test form (e2e/admin-missing-content.spec.ts covers them)
      await expect(page.getByRole('link', { name: 'Import questions (CSV)' })).toHaveAttribute('href', /\/admin\/exams\/(?:[^/]+\/)?import$/);
      await expect(page.getByRole('link', { name: '+ New mock test' })).toHaveAttribute('href', '/admin/exams/new');
    }

    await page.getByRole('searchbox', { name: 'Search mock tests' }).fill('Procurement');
    await expect(page).toHaveURL(`${BASE}/admin/exams?q=Procurement`);
    await expect(page.getByRole('link', { name: /Accountant/ })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Procurement' });
    await expect(page).toHaveURL(`${BASE}/admin/exams?q=Procurement&category=procurement`);
    // checked after filtering: the specs that create mock tests leave archived ones behind, which fill the unfiltered list
    await expect(page.getByRole('link', { name: new RegExp(TEST_TITLE) })).toContainText('Published');

    await page.getByRole('link', { name: new RegExp(TEST_TITLE) }).click();
    await expect(page).toHaveURL(new RegExp(`/exams/[^/]+$`));
    if (isPhone(info)) await expect(page.getByRole('heading', { level: 1, name: /^Question \d+ of 4$/ })).toBeVisible();
    else await expect(page.getByRole('heading', { level: 2, name: /^Edit question \d+ of 4$/ })).toBeVisible();
    await expect(page.getByLabel('Question', { exact: true })).not.toBeEmpty();
    await expectNoHorizontalScroll(page);
    w.expectClean();
  });

  test('"Save draft" hides the question from candidates; "Publish change & resolve reports" shows the change and closes the report', async ({ page, playwright }, info) => {
    const api = await adminApi(playwright);
    const t = await findTarget(api);
    const candidate = await playwright.request.newContext();
    const stamp = Date.now().toString(36);
    const newStem = `${t.stem.replace(/[?…]+$/, '')} (edited ${stamp})?`;
    try {
      await reportAsGuest(candidate, t.questionId, `Looks confusing ${stamp}`);
      await signInAs(page, playwright, 'system');
      await openQuestion(page, t);

      // the reported-by banner (from `reports`) and the "last edited / attempts" line
      await expect(page.getByRole('note')).toContainText('Reported by 1 candidate');
      await expect(page.getByRole('note')).toContainText(`“Looks confusing ${stamp}”`);
      await expect(page.getByText(/\d+ attempts/)).toBeVisible();

      // Save draft: the change is stored as a draft, so candidates no longer get the question
      await page.getByLabel('Explanation', { exact: false }).fill(`${t.explanation} Draft ${stamp}.`);
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Saved as a draft.' })).toBeVisible();
      const afterDraft = await startGuestAttempt(candidate);
      expect(afterDraft.questions.map((q) => q.id)).not.toContain(t.questionId);
      const mid = await (await api.get(`/api/admin/questions/${t.questionId}`)).json();
      expect(mid.question.status).toBe('DRAFT');
      expect(mid.reports).toHaveLength(1); // a draft does not resolve reports

      // Publish: the new text reaches candidates and the open report is resolved
      await page.getByLabel('Question', { exact: true }).fill(newStem);
      await page.getByRole('button', { name: isPhone(info) ? 'Publish & resolve reports' : 'Publish change & resolve reports' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();
      const afterPublish = await startGuestAttempt(candidate);
      expect(afterPublish.questions.find((q) => q.id === t.questionId)?.stem).toBe(newStem);
      const done = await (await api.get(`/api/admin/questions/${t.questionId}`)).json();
      expect(done.question.status).toBe('PUBLISHED');
      expect(done.reports).toHaveLength(0);
      await expect(page.getByRole('note')).toHaveCount(0);
    } finally {
      await restore(api, t);
      await candidate.dispose();
      await api.dispose();
    }
  });

  test('checks before saving and the API\'s own refusals appear inline, in friendly words, and keep the edits', async ({ page, playwright }, info) => {
    const api = await adminApi(playwright);
    const t = await findTarget(api);
    try {
      await signInAs(page, playwright, 'system');
      await openQuestion(page, t);
      const publish = page.getByRole('button', { name: isPhone(info) ? 'Publish & resolve reports' : 'Publish change & resolve reports' });

      let patches = 0;
      await page.route('**/api/admin/questions/*', async (route) => {
        if (route.request().method() === 'PATCH') {
          patches++;
          return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'correct_not_an_option' }) });
        }
        return route.continue();
      });

      await page.getByLabel('Question', { exact: true }).fill('abc');
      await publish.click();
      await expect(page.getByRole('alert')).toContainText('Write the question (at least 5 characters).');
      await expect(page.getByLabel('Question', { exact: true })).toHaveAttribute('aria-invalid', 'true');
      expect(patches).toBe(0); // nothing was sent

      await page.getByLabel('Question', { exact: true }).fill('A long enough question text?');
      await publish.click();
      await expect(page.getByRole('alert')).toContainText('The correct answer must be one of the options.');
      expect(patches).toBe(1);
      await expect(page.getByLabel('Question', { exact: true })).toHaveValue('A long enough question text?'); // the edit is kept
      await expect(page.getByRole('alert')).not.toContainText('correct_not_an_option');
    } finally {
      await api.dispose();
    }
  });

  test('keyboard only: type in the question, move the correct answer with the arrow keys, save with Enter', async ({ page, playwright }) => {
    const api = await adminApi(playwright);
    const t = await findTarget(api);
    const before = await (await api.get(`/api/admin/questions/${t.questionId}`)).json();
    const keyA = before.question.options.find((o: { correct: boolean }) => o.correct).key as string;
    try {
      await signInAs(page, playwright, 'system');
      await openQuestion(page, t);
      const target = keyA === 'B' ? 'C' : 'B';

      await page.getByLabel('Question', { exact: true }).focus();
      await page.keyboard.press('End');
      await page.keyboard.type(' ');
      await page.keyboard.press('Backspace'); // typed with the keyboard, no mouse
      const radio = page.getByRole('radio', { name: new RegExp(`Mark option ${keyA}`) });
      await radio.focus();
      while (!(await page.getByRole('radio', { name: new RegExp(`Mark option ${target}`) }).isChecked())) await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('radio', { name: new RegExp(`Mark option ${target}`) })).toBeChecked();

      const save = page.getByRole('button', { name: 'Save draft' });
      await save.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status').filter({ hasText: 'Saved as a draft.' })).toBeVisible();
      const after = await (await api.get(`/api/admin/questions/${t.questionId}`)).json();
      expect(after.question.options.find((o: { correct: boolean }) => o.correct).key).toBe(target);
    } finally {
      // put the correct answer and the status back
      const orig = before.question.options.map((o: { key: string; text: string }) => ({ key: o.key, text: o.text }));
      await api.patch(`/api/admin/questions/${t.questionId}`, { data: { options: orig, correct: [keyA], status: 'PUBLISHED' } });
      await restore(api, t);
      await api.dispose();
    }
  });

  test('previous and next move through the test; a multiple-select question opens editable with its scoring choice', async ({ page, playwright }) => {
    const api = await adminApi(playwright);
    const list = await (await api.get('/api/admin/exams', { params: { q: 'Secondary Mathematics' } })).json();
    const maths = list.results.find((r: { title: string }) => r.title.includes('S1–S3') && !r.title.includes('Free'));
    const detail = await (await api.get(`/api/admin/mock-tests/${maths.id}`)).json();
    const multi = detail.questions.find((q: { type: string }) => q.type === 'MULTIPLE_SELECT');
    expect(multi, 'seed has a multiple-select question').toBeTruthy();
    await signInAs(page, playwright, 'system');

    await page.goto(`/admin/exams/${maths.id}/q/${detail.questions[0].id}`);
    await expect(page.getByLabel('Question', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous question' })).toBeDisabled();
    await page.getByRole('link', { name: 'Next question' }).click();
    await expect(page).toHaveURL(`${BASE}/admin/exams/${maths.id}/q/${detail.questions[1].id}`);
    await page.getByRole('link', { name: 'Previous question' }).click();
    await expect(page).toHaveURL(`${BASE}/admin/exams/${maths.id}/q/${detail.questions[0].id}`);

    await page.goto(`/admin/exams/${maths.id}/q/${multi.id}`);
    // multiple-select used to open read-only (A10): it is editable now, with checkboxes and the marking choice
    await expect(page.getByLabel('Question', { exact: true })).not.toHaveAttribute('readonly', '');
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Mark option/ }).first()).toBeEnabled();
    await expect(page.getByText('Marking')).toBeVisible();
    await expect(page.getByRole('radio', { name: /All or nothing/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Partial credit/ })).toBeVisible();
    await api.dispose();
  });

  test('a content editor (Rwanda) can edit; support cannot open Exams', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'editor');
    await page.goto('/admin/exams');
    await expect(page.getByRole('region', { name: 'Mock tests' })).toBeVisible();
    await signInAs(page, playwright, 'support');
    await page.goto('/admin/exams');
    await expect(page).toHaveURL(`${BASE}/admin/exams`); // no redirect: the page says so
    await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to this' })).toBeVisible();
  });
});

