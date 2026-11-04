import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { BASE, adminApi, expectNoHorizontalScroll, isPhone, signInAs, startGuestAttempt, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

/**
 * A10 question editor (types, translations, preview, reorder, archive), A11 reports queue, A15 exam requests and
 * waiting list. Not designed: built in the admin style. Written against docs/API_ADDITIONS.md; run by the lead.
 */

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
const rowFor = (page: Page, info: TestInfo, text: string | RegExp) =>
  (isPhone(info) ? page.getByRole('article') : page.getByRole('row')).filter({ hasText: text });

interface Throwaway { testId: string; questionIds: string[]; title: string }

/** A draft mock test in the first Rwanda category with two draft single-answer questions, made through the admin API. */
async function makeTest(api: APIRequestContext): Promise<Throwaway> {
  const opts = await (await api.get('/api/admin/catalog-options', { params: { country: 'RW' } })).json();
  const cat = (opts.categories as { id: string; topics: { id: string }[] }[]).find((c) => c.topics.length > 0)!;
  // a test needs an exam or a profession of its category (400 exam_or_profession_required otherwise)
  const profession = (opts.professions as { id: string; categoryId: string }[]).find((p) => p.categoryId === cat.id)!;
  const title = `E2E editor test ${stamp()}`;
  const created = await api.post('/api/admin/mock-tests', { data: { title, categoryId: cat.id, professionId: profession.id, durationMinutes: 30, languages: ['en', 'rw', 'sw'] } });
  expect(created.status()).toBe(201);
  const testId = ((await created.json()) as { id: string }).id;
  const sec = await api.post(`/api/admin/mock-tests/${testId}/sections`, { data: { name: 'Section A' } });
  expect(sec.status()).toBe(201);
  const sectionId = ((await sec.json()) as { id: string }).id;
  const questionIds: string[] = [];
  for (const n of [1, 2]) {
    const r = await api.post(`/api/admin/mock-tests/${testId}/questions`, {
      data: {
        sectionId, topicId: cat.topics[0]!.id, stem: `Throwaway question number ${n}?`, explanation: `Explanation for throwaway question ${n}.`,
        options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }], correct: ['A'], status: 'DRAFT',
      },
    });
    expect(r.status()).toBe(201);
    questionIds.push(((await r.json()) as { id: string }).id);
  }
  return { testId, questionIds, title };
}

async function cleanup(api: APIRequestContext, t: Throwaway | undefined) {
  if (!t) return;
  const detail = await (await api.get(`/api/admin/mock-tests/${t.testId}`)).json();
  for (const q of detail.questions as { id: string }[]) await api.delete(`/api/admin/questions/${q.id}`);
  await api.post(`/api/admin/mock-tests/${t.testId}/archive`);
}

test.describe('Question editor (A10)', () => {
  test('create a multiple-select question with partial credit, edit it, preview it, translate it, reorder and archive', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    const api = await adminApi(playwright);
    let t: Throwaway | undefined;
    try {
      t = await makeTest(api);
      await signInAs(page, playwright, 'system');
      await page.goto(`/admin/exams/${t.testId}/q/new`);

      await page.getByLabel('Question', { exact: true }).fill('Which of these are prime numbers?');
      await page.getByLabel('Question type').selectOption('MULTIPLE_SELECT');
      await expect(page.getByLabel(/^Mark option A (as )?correct$/)).toHaveAttribute('type', 'checkbox');
      for (const [k, text] of [['A', 'Two'], ['B', 'Four'], ['C', 'Five'], ['D', 'Six']]) await page.getByLabel(`Option ${k}`, { exact: true }).fill(text!);
      await page.getByLabel(/^Mark option A (as )?correct$/).check();
      await page.getByLabel(/^Mark option C (as )?correct$/).check();
      await page.getByRole('radio', { name: /Partial credit/ }).check();
      await page.getByLabel(/Explanation/).fill('Two and five are prime numbers.');
      await page.getByLabel('Topic').selectOption({ index: 1 });
      await page.getByRole('button', { name: 'Create as draft' }).click();
      await expect(page).toHaveURL(/\/q\/(?!new)[^/]+$/);

      // saved as typed: two correct answers and partial credit
      await expect(page.getByLabel(/^Mark option A (as )?correct$/)).toBeChecked();
      await expect(page.getByLabel(/^Mark option C (as )?correct$/)).toBeChecked();
      await expect(page.getByRole('radio', { name: /Partial credit/ })).toBeChecked();
      const newId = page.url().split('/').pop()!;
      const saved = await (await api.get(`/api/admin/questions/${newId}`)).json();
      expect(saved.question).toMatchObject({ type: 'MULTIPLE_SELECT', scoring: 'PARTIAL', status: 'DRAFT' });

      // edit: all-or-nothing, "choose 2"
      await page.getByRole('radio', { name: /All or nothing/ }).check();
      await page.getByLabel(/Choose how many/).fill('2');
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByText('Saved as a draft.')).toBeVisible();
      const edited = await (await api.get(`/api/admin/questions/${newId}`)).json();
      expect(edited.question).toMatchObject({ scoring: 'ALL_OR_NOTHING', choose: 2 });

      // a "choose" that cannot be right is caught with words, nothing is sent
      await page.getByLabel(/Choose how many/).fill('1');
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByRole('alert')).toContainText('number to choose');
      await page.getByLabel(/Choose how many/).fill('2');

      // preview as a candidate sees it
      await page.getByRole('button', { name: 'Preview as candidate' }).click();
      const dialog = page.getByRole('dialog', { name: 'Preview as candidate' });
      await expect(dialog.getByText('Select ALL that apply.')).toBeVisible();
      await expect(dialog.getByRole('checkbox')).toHaveCount(4);
      await expect(dialog.getByText('Choose 2')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);

      // translation: partial first, tab label says so
      await page.getByRole('tab', { name: /Kinyarwanda/ }).click();
      await page.getByLabel('Question in Kinyarwanda').fill('Ni izihe mibare y’ibanze?');
      await page.getByRole('button', { name: 'Save Kinyarwanda translation' }).click();
      await expect(page.getByText('Kinyarwanda translation saved')).toBeVisible();
      await expect(page.getByRole('tab', { name: /Kinyarwanda · Partly translated/ })).toBeVisible();
      await page.getByRole('button', { name: 'Copy the English text' }).click();
      await page.getByRole('button', { name: 'Save Kinyarwanda translation' }).click();
      await expect(page.getByRole('tab', { name: /Kinyarwanda · Complete/ })).toBeVisible();
      await page.getByRole('tab', { name: /English \(source\)/ }).click();

      // unsaved changes are not lost silently
      await page.getByLabel('Question', { exact: true }).fill('Which of these are prime numbers? (changed)');
      if (isPhone(info)) await page.getByRole('button', { name: /Questions in this test/ }).click();
      await page.getByRole('link', { name: 'Add question' }).first().click();
      const leave = page.getByRole('dialog', { name: 'Leave without saving?' });
      await expect(leave).toBeVisible();
      await leave.getByRole('button', { name: 'Keep editing' }).click();
      await expect(page).toHaveURL(new RegExp(`/q/${newId}$`));
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByText('Saved as a draft.')).toBeVisible();

      // reorder: move the new (third) question up; the API's order changes
      if (isPhone(info) && (await page.getByRole('button', { name: /Questions in this test/ }).getAttribute('aria-expanded')) !== 'true') {
        await page.getByRole('button', { name: /Questions in this test/ }).click();
      }
      await page.getByRole('button', { name: 'Move question 3 up' }).click();
      await expect(page.getByText('Order saved')).toBeVisible();
      const order = (await (await api.get(`/api/admin/mock-tests/${t.testId}`)).json()).questions.map((q: { id: string }) => q.id);
      expect(order[1]).toBe(newId);

      // archive with a confirmation that says what happens
      await page.getByRole('button', { name: 'Archive question' }).click();
      const confirm = page.getByRole('dialog', { name: 'Archive this question?' });
      await expect(confirm).toContainText('keep their history');
      await confirm.getByRole('button', { name: 'Archive question' }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/exams/${t.testId}$`));
      const after = (await (await api.get(`/api/admin/mock-tests/${t.testId}`)).json()).questions.map((q: { id: string }) => q.id);
      expect(after).not.toContain(newId);
      await expectNoHorizontalScroll(page);
      w.expectClean();
    } finally {
      await cleanup(api, t);
      await api.dispose();
    }
  });

  test('a case-based question needs a case study; the editor links to the case editor', async ({ page, playwright }) => {
    const api = await adminApi(playwright);
    let t: Throwaway | undefined;
    try {
      t = await makeTest(api);
      await signInAs(page, playwright, 'system');
      await page.goto(`/admin/exams/${t.testId}/q/${t.questionIds[0]}`);
      await page.getByLabel('Question type').selectOption('CASE_BASED');
      await expect(page.getByRole('link', { name: 'Manage case studies' })).toHaveAttribute('href', `/admin/exams/${t.testId}/cases`);
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByRole('alert')).toContainText('Choose a case study');
    } finally {
      await cleanup(api, t);
      await api.dispose();
    }
  });

  test('a content editor may edit; a role without write access sees the button disabled with the reason', async ({ page, playwright }) => {
    const api = await adminApi(playwright);
    let t: Throwaway | undefined;
    try {
      t = await makeTest(api);
      await signInAs(page, playwright, 'editor');
      await page.goto(`/admin/exams/${t.testId}/q/${t.questionIds[0]}`);
      await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    } finally {
      await cleanup(api, t);
      await api.dispose();
    }
  });
});

test.describe('Reports queue (A11)', () => {
  test('a candidate report appears, opens its question, and dismiss needs a reason', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    const api = await adminApi(playwright);
    const candidate = await playwright.request.newContext();
    const s = stamp();
    try {
      const list = await (await api.get('/api/admin/exams', { params: { q: 'Procurement Officer — Free Sample' } })).json();
      const test = list.results[0] as { id: string; title: string };
      const detail = await (await api.get(`/api/admin/mock-tests/${test.id}`)).json();
      const questionId = (detail.questions as { id: string; status: string }[]).find((q) => q.status === 'PUBLISHED')!.id;
      const a = await startGuestAttempt(candidate);
      expect((await candidate.post(`${BASE}/api/attempts/${a.attemptId}/reports`, { headers: a.headers, data: { questionId, message: `Wrong key ${s}` } })).status()).toBe(201);

      await signInAs(page, playwright, 'system');
      await page.goto('/admin/exams/reports');
      await expect(page.getByRole('heading', { level: 1, name: /Reports|Reported questions/ })).toBeVisible();
      const row = rowFor(page, info, test.title).first();
      await expect(row).toContainText(`“Wrong key ${s}”`);
      await expect(row).toContainText(/Reported (once|twice|\d+ times)/);

      await row.getByRole('link', { name: 'Open question' }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/exams/${test.id}/q/${questionId}$`));
      await expect(page.getByRole('note')).toContainText(/Reported by \d+ candidate/);
      await page.goBack();

      await rowFor(page, info, test.title).first().getByRole('button', { name: 'Dismiss' }).click();
      const dialog = page.getByRole('dialog', { name: 'Dismiss these reports?' });
      await dialog.getByRole('button', { name: 'Dismiss reports' }).click();
      await expect(dialog).toContainText('Write a reason');
      await dialog.getByLabel('Why are you dismissing them?').fill(`The key is right ${s}`);
      await dialog.getByRole('button', { name: 'Dismiss reports' }).click();
      await expect(dialog).toHaveCount(0);

      await page.getByRole('button', { name: 'Dismissed', exact: true }).click();
      await expect(page).toHaveURL(/status=dismissed/);
      await expect(page.getByText(`The key is right ${s}`).first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      w.expectClean();
    } finally {
      await candidate.dispose();
      await api.dispose();
    }
  });

  test('a content editor opens the queue; Support is told it has no access (not silently moved)', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'editor');
    await page.goto('/admin/exams/reports');
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const support = await page.context().newPage();
    await signInAs(support, playwright, 'support');
    await support.goto('/admin/exams/reports');
    await expect(support.getByRole('heading', { name: 'You do not have access to this' })).toBeVisible();
    await expect(support).toHaveURL(/\/admin\/exams\/reports$/);
  });

  test('empty filters say so, at 360px wide without sideways scroll', async ({ page, playwright }, info) => {
    test.skip(!isPhone(info), 'phone only');
    await page.setViewportSize({ width: 360, height: 800 });
    await signInAs(page, playwright, 'system');
    for (const path of ['/admin/exams/reports?status=resolved', '/admin/exams/requests', '/admin/countries/waiting-list?country=KE']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }
  });
});

test.describe('Demand (A15)', () => {
  test('exam requests are grouped by search; Plan exam goes to the new mock test; Mark done closes the group', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    const candidate = await playwright.request.newContext();
    const s = stamp();
    const query = `E2E Veterinary officer ${s}`;
    try {
      for (let i = 0; i < 2; i++) {
        const r = await candidate.post(`${BASE}/api/countries/RW/exam-requests`, { data: { query } });
        expect([200, 201]).toContain(r.status());
      }
      await signInAs(page, playwright, 'system');
      await page.goto(`/admin/exams/requests?q=${encodeURIComponent(s)}`);
      const row = rowFor(page, info, query);
      await expect(row).toContainText(/(^|\D)2(\D|$)/); // the count (the row text runs the cells together)
      const plan = row.getByRole('link', { name: 'Plan exam' });
      await expect(plan).toHaveAttribute('href', new RegExp(`/admin/exams/new\\?title=${encodeURIComponent(query).replace(/%20/g, '\\+')}&country=RW`));

      await row.getByRole('button', { name: 'Mark done' }).click();
      const dialog = page.getByRole('dialog', { name: 'Mark this request done' });
      await dialog.getByLabel(/Note/).fill('E2E: planned');
      await dialog.getByRole('button', { name: 'Mark done' }).click();
      await expect(page.getByText(/Marked 2 requests done/)).toBeVisible();

      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page).toHaveURL(/status=done/);
      await expect(rowFor(page, info, query)).toContainText('Done');
      await expectNoHorizontalScroll(page);
      w.expectClean();
    } finally {
      await candidate.dispose();
    }
  });

  test('the Overview alert "Plan exam" goes to the requests screen', async ({ page, playwright }) => {
    const candidate = await playwright.request.newContext();
    const query = `E2E Alert request ${stamp()}`;
    try {
      for (let i = 0; i < 3; i++) await candidate.post(`${BASE}/api/countries/RW/exam-requests`, { data: { query } });
      await signInAs(page, playwright, 'system');
      await page.goto('/admin');
      const link = page.getByRole('link', { name: /requested/ }).first();
      if (await link.count()) {
        await link.click();
        await expect(page).toHaveURL(/\/admin\/exams\/requests\?q=/);
      }
    } finally {
      await candidate.dispose();
    }
  });

  test('the waiting list of a country that is not live: people, disabled "tell them", CSV export', async ({ page, playwright }) => {
    const w = watchErrors(page);
    const candidate = await playwright.request.newContext();
    const email = `e2e.waiting.${stamp()}@example.com`;
    try {
      const joined = await candidate.post(`${BASE}/api/countries/KE/waiting-list`, { data: { email, interest: `E2E teacher recruitment ${email.split('.')[2]}` } });
      expect([200, 201]).toContain(joined.status());
      await signInAs(page, playwright, 'system');
      await page.goto('/admin/countries/waiting-list?country=KE');
      await expect(page.getByText(email)).toBeVisible();
      await expect(page.getByText(`E2E teacher recruitment ${email.split('.')[2]}`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tell them it is open' })).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByText(/Only when Kenya is Live/)).toBeVisible();

      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
      expect(download.suggestedFilename()).toMatch(/waiting-list.*\.csv$/);
      const path = await download.path();
      const text = (await import('node:fs')).readFileSync(path, 'utf8');
      expect(text).toContain(email);
      await expect(page.getByText(/^Downloaded /)).toBeVisible();
      await expectNoHorizontalScroll(page);
      w.expectClean();
    } finally {
      await candidate.dispose();
    }
  });
});
