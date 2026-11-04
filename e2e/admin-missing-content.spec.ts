import { expect, test, type APIRequestContext } from '@playwright/test';
import { BASE, adminApi, expectNoHorizontalScroll, isPhone, signInAs, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

/**
 * The content screens built without a design (MISSING_DESIGNS A6, A7, A8, A9): mock-test form and publishing, CSV import,
 * categories / topics / sections, case studies. Everything a spec creates is archived or deleted in `finally`
 * (a mock test cannot be deleted through the API, only archived).
 */

const unique = (tag: string) => `E2E ${tag} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

interface Setup { categoryId: string; categoryName: string; professionId: string; topicName: string; topicId: string }

async function firstRwandaCategory(api: APIRequestContext): Promise<Setup> {
  const o = await (await api.get('/api/admin/catalog-options', { params: { country: 'RW' } })).json();
  const cat = (o.categories as { id: string; name: string; topics: { id: string; name: string }[] }[]).find((c) => c.topics.length > 0)!;
  const profession = (o.professions as { id: string; categoryId: string }[]).find((p) => p.categoryId === cat.id)!;
  return { categoryId: cat.id, categoryName: cat.name, professionId: profession.id, topicName: cat.topics[0]!.name, topicId: cat.topics[0]!.id };
}

/** A draft test with one section, made through the API (the UI flows below are tested separately). */
async function makeTest(api: APIRequestContext, s: Setup, title = unique('content test')) {
  const r = await api.post('/api/admin/mock-tests', { data: { title, categoryId: s.categoryId, professionId: s.professionId, durationMinutes: 30 } });
  expect(r.status(), 'create a mock test through the API').toBe(201);
  const { id } = (await r.json()) as { id: string };
  const sec = await api.post(`/api/admin/mock-tests/${id}/sections`, { data: { name: 'General' } });
  expect(sec.status()).toBe(201);
  return { id, title, sectionId: ((await sec.json()) as { id: string }).id };
}

const archive = (api: APIRequestContext, id: string) => api.post(`/api/admin/mock-tests/${id}/archive`, { data: {} });

/** Archives every test whose title starts with `title` (the test and its copy), found by name: nothing leaks when a spec fails before it learns an id. */
async function archiveByTitle(api: APIRequestContext, title: string) {
  const list = (await (await api.get('/api/admin/exams', { params: { q: title, pageSize: 50 } })).json()) as { results?: { id: string; title: string }[] };
  for (const t of list.results ?? []) if (t.title.startsWith(title)) await archive(api, t.id);
}

const csv = (s: Setup, rows: string[][]) =>
  ['section,topic,stem,option_a,option_b,option_c,option_d,correct,explanation', ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');

const goodRow = (s: Setup, stem: string) => ['General', s.topicName, stem, 'Alpha', 'Beta', 'Gamma', 'Delta', 'B', 'Beta is right because it is the second letter of the alphabet.'];

test.describe('A9 mock-test form and publishing', () => {
  test('create a draft through the form; publishing is blocked until a question exists', async ({ page, playwright }) => {
    const w = watchErrors(page);
    const api = await adminApi(playwright);
    const s = await firstRwandaCategory(api);
    const title = unique('form test');
    let id = '';
    try {
      await signInAs(page, playwright, 'system');
      await page.goto('/admin/exams/new');
      await expect(page.getByRole('heading', { level: 1, name: 'New mock test' }).or(page.getByRole('heading', { name: 'New mock test' }))).toBeVisible();
      await expect(page.getByLabel('Marks taken off for each wrong answer')).toHaveValue('0');
      await expect(page.getByLabel(/Official pass mark/)).toHaveValue('');
      // a pass mark without its source is refused on the form
      await page.getByLabel('Title').fill(title);
      const country = page.getByLabel('Country');
      if ((await country.evaluate((el) => el.tagName)) === 'SELECT') await country.selectOption({ label: 'Rwanda' });
      await page.getByLabel('Category').selectOption(s.categoryId);
      await page.getByLabel('Profession or exam').selectOption(s.professionId);
      await page.getByLabel(/Official pass mark/).fill('50');
      await page.getByRole('button', { name: 'Create draft' }).click();
      await expect(page.getByText(/Say where this pass mark is published/).first()).toBeVisible();
      await page.getByLabel(/Official pass mark/).fill('');
      await expectNoHorizontalScroll(page);
      await page.getByRole('button', { name: 'Create draft' }).click();
      await page.waitForURL(/\/admin\/exams\/[^/]+\/edit$/);
      id = page.url().split('/admin/exams/')[1]!.split('/')[0]!;
      await expect(page.getByLabel('Title')).toHaveValue(title);

      // status and checklist: a draft with no questions cannot be published
      await expect(page.getByText('Needs at least one published question')).toBeVisible();
      const publish = page.getByRole('button', { name: 'Publish', exact: true });
      await expect(publish).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByText('Fix the items marked as must-fix in the checklist first.')).toBeVisible();

      // sections: add one through the dialog
      await page.getByRole('button', { name: '+ Add a section' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add a section' });
      await dialog.getByLabel('Section name').fill('Part one');
      await dialog.getByRole('button', { name: 'Add section' }).click();
      await expect(page.getByText(/1\. Part one/)).toBeVisible();
      await expectNoHorizontalScroll(page);
      w.expectClean();
    } finally {
      if (id) await archive(api, id);
      await archiveByTitle(api, title);
      await api.dispose();
    }
  });

  test('duplicate, archive and restore', async ({ page, playwright }) => {
    const api = await adminApi(playwright);
    const s = await firstRwandaCategory(api);
    const t = await makeTest(api, s);
    const ids = [t.id];
    try {
      await signInAs(page, playwright, 'system');
      await page.goto(`/admin/exams/${t.id}/edit`);
      await page.getByRole('button', { name: 'Duplicate…' }).click();
      const dup = page.getByRole('dialog', { name: 'Duplicate this mock test' });
      await expect(dup.getByLabel(/Title of the copy/)).toHaveValue(`${t.title} (copy)`);
      await dup.getByRole('button', { name: 'Duplicate' }).click();
      await page.waitForURL((u) => /\/admin\/exams\/[^/]+\/edit$/.test(u.pathname) && !u.pathname.includes(t.id));
      const copyId = page.url().split('/admin/exams/')[1]!.split('/')[0]!;
      ids.push(copyId);
      await expect(page.getByLabel('Title')).toHaveValue(`${t.title} (copy)`);

      // archive with a confirmation, then restore as a draft
      await page.getByRole('button', { name: 'Archive…' }).click();
      const confirm = page.getByRole('dialog', { name: /Archive/ });
      await confirm.getByRole('button', { name: 'Archive', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Restore as draft' })).toBeVisible();
      await page.getByRole('button', { name: 'Restore as draft' }).click();
      await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
    } finally {
      for (const id of ids) await archive(api, id);
      await archiveByTitle(api, t.title);
      await api.dispose();
    }
  });
});

test.describe('A6 CSV import', () => {
  test('happy path: file, check, confirm, result; the questions arrive as drafts', async ({ page, playwright }) => {
    const w = watchErrors(page);
    const api = await adminApi(playwright);
    const s = await firstRwandaCategory(api);
    const t = await makeTest(api, s);
    try {
      await signInAs(page, playwright, 'system');
      await page.goto(`/admin/exams/${t.id}/import`);
      await expect(page.getByText('Step 1 of 4: File')).toBeVisible();
      await expect(page.getByLabel('Mock test', { exact: true })).toHaveValue(t.id);
      await page.getByText('CSV format help').click();
      await expect(page.getByText('One row per question, with a header row.', { exact: false })).toBeVisible();
      const body = csv(s, [goodRow(s, 'Which letter is second in the alphabet?'), goodRow(s, 'Which Greek letter is second?')]);
      await page.getByLabel('CSV file').setInputFiles({ name: 'questions.csv', mimeType: 'text/csv', buffer: Buffer.from(body) });
      await expect(page.getByText(/questions\.csv/)).toBeVisible();
      await page.getByRole('button', { name: 'Check the file' }).click();
      await expect(page.getByText('Step 3 of 4: Check')).toBeVisible();
      await expect(page.getByText(/No problems found/)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Step 4 of 4: Import')).toBeVisible();
      await page.getByRole('button', { name: 'Import 2 questions' }).click();
      await expect(page.getByText(/2 questions added to .* as drafts/)).toBeVisible();
      const detail = await (await api.get(`/api/admin/mock-tests/${t.id}`)).json();
      expect((detail.questions as { status: string }[]).filter((q) => q.status === 'DRAFT')).toHaveLength(2);
      w.expectClean();
    } finally {
      await archive(api, t.id);
      await api.dispose();
    }
  });

  test('error report: problems in words, preview of the valid rows, import the valid rows only', async ({ page, playwright }, info) => {
    const api = await adminApi(playwright);
    const s = await firstRwandaCategory(api);
    const t = await makeTest(api, s);
    try {
      await signInAs(page, playwright, 'system');
      await page.goto('/admin/exams/import');
      await page.getByLabel('Mock test', { exact: true }).selectOption(t.id);
      const bad = ['Nonexistent section', s.topicName, 'A question in a missing section?', 'One', 'Two', '', '', 'A', 'Because one is first in the list.'];
      const body = csv(s, [goodRow(s, 'A valid question for the preview?'), bad]);
      await page.getByLabel('CSV file').setInputFiles({ name: 'mixed.csv', mimeType: 'text/csv', buffer: Buffer.from(body) });
      await page.getByRole('button', { name: 'Check the file' }).click();
      await expect(page.getByText('Step 3 of 4: Check')).toBeVisible();
      await expect(page.getByText(/Section “Nonexistent section” does not exist in this test/)).toBeVisible();
      await expect(page.getByText(/unknown_section/)).toHaveCount(0);
      await expect(page.getByText('A valid question for the preview?')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Download the rows with problems (CSV)' })).toBeVisible();
      if (isPhone(info)) await expect(page.getByText('Row 3')).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.getByRole('button', { name: /Continue with 1 valid row/ }).click();
      await page.getByRole('button', { name: 'Import 1 question' }).click();
      await expect(page.getByText(/1 question added to .* as drafts, 1 row skipped/)).toBeVisible();
    } finally {
      await archive(api, t.id);
      await api.dispose();
    }
  });

  test('a file that is not a csv is refused at once', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/exams/import');
    await page.getByLabel('CSV file').setInputFiles({ name: 'questions.xlsx', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
    await expect(page.getByText(/Choose a \.csv file/)).toBeVisible();
  });
});

test.describe('A7 categories, topics and sections', () => {
  test('create, rename, reorder and delete a category; its topics block the delete', async ({ page, playwright }) => {
    const api = await adminApi(playwright);
    const name = unique('category');
    const renamed = `${name} renamed`;
    let categoryId = '';
    try {
      await signInAs(page, playwright, 'system');
      await page.goto('/admin/exams/catalog');
      await expect(page.getByRole('heading', { name: /Categories · / })).toBeVisible();
      await page.getByRole('button', { name: '+ Add a category' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add a category' });
      await dialog.getByLabel('Name').fill(name);
      await dialog.getByRole('button', { name: 'Add category' }).click();
      await expect(page.getByText(new RegExp(String.raw`^\d+\. ${name}`))).toBeVisible();
      categoryId = ((await (await api.get('/api/admin/categories', { params: { country: 'RW' } })).json()).categories as { id: string; name: string }[]).find((c) => c.name === name)!.id;

      // rename
      await page.getByRole('button', { name: `Edit ${name}` }).click();
      const edit = page.getByRole('dialog', { name: 'Edit category' });
      await edit.getByLabel('Name').fill(renamed);
      await edit.getByRole('button', { name: 'Save category' }).click();
      await expect(page.getByText(new RegExp(String.raw`^\d+\. ${renamed}`))).toBeVisible();

      // reorder: it is the last one, move it up and the announcement says where it is now
      await page.getByRole('button', { name: `Move ${renamed} up` }).click();
      await expect(page.getByText(new RegExp(`Moved ${renamed} to position \\d+ of \\d+\\.`))).toBeAttached();
      await expectNoHorizontalScroll(page);

      // topics: add, rename; a category with a topic cannot be deleted
      await page.getByLabel('Category', { exact: true }).selectOption(categoryId);
      await page.getByRole('button', { name: '+ Add a topic' }).click();
      const topic = page.getByRole('dialog', { name: 'Add a topic' });
      await topic.getByLabel('Topic name').fill('Throwaway topic');
      await topic.getByRole('button', { name: 'Add topic' }).click();
      await expect(page.getByText('Throwaway topic')).toBeVisible();
      await page.getByRole('button', { name: 'Rename Throwaway topic' }).click();
      const rn = page.getByRole('dialog', { name: 'Rename topic' });
      await rn.getByLabel('Topic name').fill('Renamed topic');
      await rn.getByRole('button', { name: 'Save topic' }).click();
      await expect(page.getByText('Renamed topic')).toBeVisible();
      await expect(page.getByRole('button', { name: `Delete ${renamed}` })).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByText(/Used by 1 topic, so this category cannot be deleted/)).toBeVisible();

      // delete the topic, then the category
      await page.getByRole('button', { name: 'Delete Renamed topic' }).click();
      await page.getByRole('dialog', { name: /Delete the topic/ }).getByRole('button', { name: 'Delete topic' }).click();
      await expect(page.getByText('Renamed topic')).toHaveCount(0);
      await page.getByRole('button', { name: `Delete ${renamed}` }).click();
      await page.getByRole('dialog', { name: /Delete the category/ }).getByRole('button', { name: 'Delete category' }).click();
      await expect(page.getByText(new RegExp(String.raw`^\d+\. ${renamed}`))).toHaveCount(0);
      categoryId = '';
    } finally {
      // Delete whatever this test made, found by id OR by the original or the renamed name, even when it failed before the
      // rename or before the id was read: a leaked "E2E category" must never stay behind.
      const all = ((await (await api.get('/api/admin/categories', { params: { country: 'RW' } })).json()).categories ?? []) as { id: string; name: string }[];
      for (const c of all.filter((x) => x.id === categoryId || x.name === name || x.name === renamed)) {
        const topics = ((await (await api.get('/api/admin/topics', { params: { categoryId: c.id } })).json()).topics ?? []) as { id: string }[];
        for (const t of topics) await api.delete(`/api/admin/topics/${t.id}`);
        await api.delete(`/api/admin/categories/${c.id}`);
      }
      await api.dispose();
    }
  });

  test('the sections of a test: the delete guard names the questions that use it', async ({ page, playwright }) => {
    const api = await adminApi(playwright);
    const s = await firstRwandaCategory(api);
    const t = await makeTest(api, s);
    try {
      const q = await api.post(`/api/admin/mock-tests/${t.id}/questions`, {
        data: { sectionId: t.sectionId, stem: 'Which letter is first?', options: [{ key: 'A', text: 'A' }, { key: 'B', text: 'B' }], correct: ['A'], explanation: 'A is the first letter of the alphabet.', topicId: s.topicId },
      });
      expect(q.status()).toBe(201);
      await signInAs(page, playwright, 'system');
      await page.goto(`/admin/exams/${t.id}/edit`);
      const del = page.getByRole('button', { name: 'Delete General' });
      await expect(del).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByText(/Used by 1 question, so this section cannot be deleted/)).toBeVisible();
    } finally {
      await archive(api, t.id);
      await api.dispose();
    }
  });
});

test.describe('A8 case study editor', () => {
  test('create a case with a table, preview it as candidates see it, attach a question', async ({ page, playwright }, info) => {
    const api = await adminApi(playwright);
    const s = await firstRwandaCategory(api);
    const t = await makeTest(api, s);
    let caseId = '';
    try {
      const q = await api.post(`/api/admin/mock-tests/${t.id}/questions`, {
        data: { sectionId: t.sectionId, stem: 'What is left of the grant?', options: [{ key: 'A', text: '100' }, { key: 'B', text: '200' }], correct: ['B'], explanation: 'The grant minus the books is 200.', topicId: s.topicId },
      });
      expect(q.status()).toBe(201);
      await signInAs(page, playwright, 'system');
      await page.goto(`/admin/exams/${t.id}/cases`);
      await expect(page.getByText('No case studies yet')).toBeVisible();
      await page.getByRole('link', { name: '+ New case study' }).click();
      await page.getByLabel('Title', { exact: true }).fill('School grant case');
      await page.getByLabel('Paragraph 1', { exact: true }).fill('The school received a grant of RWF 1,000.');
      await page.getByRole('button', { name: '+ Add a table' }).click();
      await page.getByLabel('Table 1 caption').fill('Budget');
      await page.getByLabel('Table 1 row 1 label').fill('Item');
      await page.getByLabel('Table 1 row 1 value').fill('RWF');
      await page.getByLabel('Table 1 row 2 label').fill('Books');
      await page.getByLabel('Table 1 row 2 value').fill('800');
      await page.getByRole('button', { name: '+ Add a note' }).click();
      await page.getByLabel('Note 1', { exact: true }).fill('All amounts are in RWF.');
      await page.getByRole('button', { name: 'Create case study' }).click();
      await page.waitForURL(/\/cases\/[^/]+$/);
      caseId = page.url().split('/cases/')[1]!;
      await expect(page.getByRole('tab', { name: 'Case' })).toHaveAttribute('aria-selected', 'true');

      await page.getByRole('tab', { name: 'Questions' }).click();
      await page.getByRole('checkbox', { name: /What is left of the grant\?/ }).check();
      await page.getByRole('button', { name: /Attach 1 question/ }).click();
      await expect(page.getByRole('button', { name: /Detach question 1/ })).toBeVisible();

      await page.getByRole('tab', { name: 'Preview' }).click();
      if (!isPhone(info)) await expect(page.getByText('Case study · applies to questions 1')).toBeVisible(); // (the phone candidate screen has a Question / Case study switch instead of this label)
      await expect(page.getByText('The school received a grant of RWF 1,000.')).toBeVisible();
      await expect(page.getByText('All amounts are in RWF.')).toBeVisible();
      await expectNoHorizontalScroll(page);

      // a case that questions use cannot be deleted
      await page.getByRole('tab', { name: 'Case' }).click();
      await expect(page.getByRole('button', { name: 'Delete case study' })).toHaveAttribute('aria-disabled', 'true');
      await page.getByRole('tab', { name: 'Translations' }).click();
      await expect(page.getByText('This test has one language')).toBeVisible();
    } finally {
      if (caseId) {
        const d = await (await api.get(`/api/admin/cases/${caseId}`)).json();
        const ids = ((d.case?.attachedQuestions ?? []) as { id: string }[]).map((x) => x.id);
        if (ids.length) await api.post(`/api/admin/cases/${caseId}/detach`, { data: { questionIds: ids } });
        await api.delete(`/api/admin/cases/${caseId}`);
      }
      await archive(api, t.id);
      await api.dispose();
    }
  });
});

test.describe('layout', () => {
  test('no sideways scroll at 360px on the new content screens', async ({ page, playwright }) => {
    const api = await adminApi(playwright);
    const s = await firstRwandaCategory(api);
    const t = await makeTest(api, s);
    try {
      await signInAs(page, playwright, 'system');
      await page.setViewportSize({ width: 360, height: 800 });
      for (const path of ['/admin/exams', '/admin/exams/new', `/admin/exams/${t.id}/edit`, '/admin/exams/import', '/admin/exams/catalog', `/admin/exams/${t.id}/cases`, `/admin/exams/${t.id}/cases/new`]) {
        await page.goto(path);
        await expect(page.getByRole('main')).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalScroll(page);
      }
    } finally {
      await archive(api, t.id);
      await api.dispose();
    }
  });

  test('a role without exams:write sees the reason instead of a hidden button', async ({ page, playwright }) => {
    await signInAs(page, playwright, 'support');
    await page.goto('/admin/exams/new');
    // Support has no exams:read at all: the page says so instead of redirecting
    await expect(page.getByRole('heading', { name: 'You do not have access to this' })).toBeVisible();
  });
});

