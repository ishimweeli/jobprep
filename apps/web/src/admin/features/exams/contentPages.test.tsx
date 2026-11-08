import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_PERMS, SYSTEM_PERMS, SUPPORT_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { ToastProvider } from '../../components/Toast';
import { CasePage } from './CasePage';
import { CatalogPage } from './CatalogPage';
import { ImportPage } from './ImportPage';
import { MockTestFormPage } from './MockTestFormPage';
import { ChecklistList } from './PublishPanel';
import { TestToolbar, testToolbarLinks } from './TestToolbar';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) => ({ status, body });
const sys = admin('SYSTEM_ADMIN', SYSTEM_PERMS);

describe('checklist and toolbar', () => {
  it('the checklist separates must-fix items from warnings', () => {
    renderAdminRoutes([{ path: '*', element: <ChecklistList checklist={{ canPublish: false, items: [
      { key: 'hasQuestions', label: 'q', ok: false, blocking: true },
      { key: 'freeSample', label: 'f', ok: false, blocking: false },
      { key: 'title', label: 't', ok: true, blocking: true },
    ] }} /> }], { route: '/', me: sys });
    expect(screen.getByText(/Must fix:/)).toBeInTheDocument();
    expect(screen.getByText(/Warning:/)).toBeInTheDocument();
    expect(screen.getByText(/Done:/)).toBeInTheDocument();
    expect(screen.getByText('Needs at least one published question')).toBeInTheDocument();
  });

  it('the toolbar links follow the status', () => {
    expect(testToolbarLinks('t1', 'DRAFT').map((l) => l.label)).toEqual(['Edit test', 'Case studies', 'Import', 'Review and publish']);
    expect(testToolbarLinks('t1', 'PUBLISHED').at(-1)).toMatchObject({ label: 'Unpublish', to: '/admin/exams/t1/edit#publish' });
    expect(testToolbarLinks('t1', 'ARCHIVED').at(-1)?.label).toBe('Restore');
  });

  it('a role that cannot write sees the actions with the reason, not hidden', () => {
    renderAdminRoutes([{ path: '*', element: <TestToolbar testId="t1" status="DRAFT" title="Sec. Mathematics" /> }], { route: '/', me: admin('SUPPORT', SUPPORT_PERMS) });
    const imp = screen.getByRole('button', { name: 'Import' });
    expect(imp).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(/Only a Content editor or System admin can change this test\./).length).toBeGreaterThan(0);
  });
});

const catalog = {
  categories: [{ id: 'c1', countryCode: 'RW', slug: 'teaching', name: 'Teaching', topics: [{ id: 'tp1', name: 'Pedagogy' }] }],
  professions: [{ id: 'p1', categoryId: 'c1', name: 'Teacher', examId: 'e1' }],
  authorities: [],
};

describe('mock test form', () => {
  function setup(route = '/admin/exams/new', routes = [{ path: '/admin/exams/new', element: <MockTestFormPage /> }]) {
    stubViewport(true);
    const api = mockFetch((url, init) => {
      if (url.startsWith('/api/admin/catalog-options')) return json(catalog);
      if (url.startsWith('/api/admin/country-options')) return json({ countries: [{ code: 'RW', name: 'Rwanda', status: 'LIVE' }] });
      if (url.startsWith('/api/admin/overview')) return json({});
      if (url === '/api/admin/mock-tests' && init?.method === 'POST') return json({ id: 'new1', slug: 's', status: 'DRAFT' }, 201);
      return undefined;
    });
    return { api, ...renderAdminRoutes([...routes, { path: '/admin/exams/:testId/edit', element: <p>editing the new test</p> }], { route, me: sys }) };
  }

  it('prefills the title from the Plan exam link and has the drawn defaults', async () => {
    setup('/admin/exams/new?title=Veterinary%20officer&country=RW');
    expect(await screen.findByLabelText('Title')).toHaveValue('Veterinary officer');
    expect(screen.getByLabelText('Marks taken off for each wrong answer')).toHaveValue(0);
    expect(screen.getByLabelText(/Official pass mark/)).toHaveValue(null);
    expect(screen.getByText(/only shows a pass mark when both/i)).toBeInTheDocument();
    // A new test starts as a free sample, so it is discoverable unless someone chooses to charge for it.
    expect(screen.getByRole('radio', { name: /Free sample/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Full Access/ })).not.toBeChecked();
  });

  it('refuses a pass mark without its source and shows the field error', async () => {
    setup('/admin/exams/new?title=Veterinary%20officer&country=RW');
    await screen.findByLabelText('Title');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Teaching' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'c1');
    await userEvent.selectOptions(screen.getByLabelText('Profession or exam'), 'p1');
    await userEvent.type(screen.getByLabelText(/Official pass mark/), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findAllByText(/Say where this pass mark is published/)).not.toHaveLength(0);
  });

  it('creates the draft with the right body and opens it for editing', async () => {
    const { api } = setup('/admin/exams/new?title=Veterinary%20officer&country=RW');
    await screen.findByLabelText('Title');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Teaching' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'c1');
    await userEvent.selectOptions(screen.getByLabelText('Profession or exam'), 'p1');
    await userEvent.click(screen.getByRole('radio', { name: /Free sample/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('editing the new test')).toBeInTheDocument();
    const post = api.calls.find((c) => c.init?.method === 'POST' && c.url === '/api/admin/mock-tests')!;
    expect(JSON.parse(String(post.init?.body))).toMatchObject({
      title: 'Veterinary officer', categoryId: 'c1', professionId: 'p1', isFree: true, durationMinutes: 60, negativeMarkPerWrong: 0, passMarkPercent: null, passMarkSource: null, languages: ['en'],
    });
  });
});

describe('CSV import', () => {
  function setup(desktop = true) {
    stubViewport(desktop);
    let call = 0;
    const api = mockFetch((url, init) => {
      if (url.startsWith('/api/admin/exams')) return json({ total: 1, page: 1, pageSize: 100, totals: {}, results: [{ id: 't1', title: 'Sec. Mathematics — Mock 1', countryCode: 'RW', status: 'DRAFT', slug: 's', category: { name: 'x', slug: 'x' }, isFree: false, questionCount: 0, durationMinutes: 60, openReports: 0 }] });
      if (url === '/api/admin/import-template') return json({ columns: [], csv: 'section,topic\n' });
      if (url === '/api/admin/mock-tests/t1/import' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { dryRun?: boolean };
        if (body.dryRun) {
          call++;
          return json({
            dryRun: true, totalRows: 3, validRows: 2, invalidRows: 1, problems: [{ row: 3, column: 'section', problem: 'unknown_section:Algebra' }],
            preview: [{ row: 2, section: 'General', topic: 'Pedagogy', stem: 'Which approach?', options: [{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }], correct: ['B'] }], errorCsv: 'row,problems\n3,x\n',
          });
        }
        return json({ dryRun: false, created: 2, totalRows: 3, validRows: 2, invalidRows: 1, problems: [] }, 201);
      }
      return undefined;
    });
    return { api, calls: () => call, ...renderAdminRoutes([{ path: '/admin/exams/import', element: <ImportPage /> }, { path: '/admin/exams/:testId/import', element: <ImportPage /> }], { route: '/admin/exams/t1/import', me: sys }) };
  }

  it('walks file, check, confirm and result, with the problems in words', async () => {
    const { api } = setup();
    expect(await screen.findByText('Step 1 of 4: File')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Mock test')).toHaveValue('t1'));
    const file = new File(['section,topic,stem\nGeneral,Pedagogy,Which?\n'], 'questions.csv', { type: 'text/csv' });
    await userEvent.upload(screen.getByLabelText('CSV file'), file);
    expect(await screen.findByText(/questions\.csv/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check the file' }));
    expect(await screen.findByText('Step 3 of 4: Check')).toBeInTheDocument();
    expect(screen.getByText(/Section “Algebra” does not exist in this test/)).toBeInTheDocument();
    expect(screen.queryByText(/unknown_section/)).not.toBeInTheDocument();
    expect(screen.getByText('Which approach?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download the rows with problems (CSV)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with 2 valid rows' }));
    expect(await screen.findByText('Step 4 of 4: Import')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 questions' }));
    expect(await screen.findByText(/2 questions added to Sec\. Mathematics — Mock 1 as drafts, 1 row skipped/)).toBeInTheDocument();
    const real = api.calls.filter((c) => c.url.endsWith('/import')).map((c) => JSON.parse(String(c.init?.body)) as Record<string, unknown>);
    expect(real[0]).toMatchObject({ dryRun: true });
    expect(real[1]).toMatchObject({ importValidRows: true });
    expect(real[1]).not.toHaveProperty('dryRun');
  });

  it('a file that is not a csv is refused before anything is sent', async () => {
    const { api } = setup();
    await screen.findByText('Step 1 of 4: File');
    const file = new File(['x'], 'questions.xlsx');
    await userEvent.upload(screen.getByLabelText('CSV file'), file, { applyAccept: false });
    expect(await screen.findByText(/Choose a \.csv file/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.url.endsWith('/import'))).toBe(false);
  });

  it('phone: problems are cards per row', async () => {
    setup(false);
    await screen.findByText('Step 1 of 4: File');
    await waitFor(() => expect(screen.getByLabelText('Mock test')).toHaveValue('t1'));
    await userEvent.upload(screen.getByLabelText('CSV file'), new File(['a,b\n1,2\n'], 'q.csv', { type: 'text/csv' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Check the file' }));
    const card = (await screen.findByText('Row 3')).closest('li')!;
    expect(within(card).getByText(/Section “Algebra”/)).toBeInTheDocument();
  });
});

describe('categories and topics', () => {
  function setup(me = sys) {
    stubViewport(true);
    const api = mockFetch((url, init) => {
      if (url.startsWith('/api/admin/country-options')) return json({ countries: [{ code: 'RW', name: 'Rwanda', status: 'LIVE' }] });
      if (url.startsWith('/api/admin/categories') && (init?.method ?? 'GET') === 'GET') {
        return json({ categories: [
          { id: 'c1', countryCode: 'RW', slug: 'teaching', name: 'Teaching', description: '', icon: '', sortOrder: 0, featured: true, mockTests: 3, topics: 2, professions: 1 },
          { id: 'c2', countryCode: 'RW', slug: 'empty', name: 'Empty one', description: '', icon: '', sortOrder: 1, featured: false, mockTests: 0, topics: 0, professions: 0 },
        ] });
      }
      if (url.startsWith('/api/admin/topics') && (init?.method ?? 'GET') === 'GET') return json({ topics: [{ id: 'tp1', slug: 'pedagogy', name: 'Pedagogy', questions: 12 }, { id: 'tp2', slug: 'new', name: 'Unused', questions: 0 }] });
      if (url === '/api/admin/categories/reorder' && init?.method === 'POST') return json({ ok: true });
      if (url === '/api/admin/categories' && init?.method === 'POST') return json({ id: 'c3', slug: 'x' }, 201);
      if (url === '/api/admin/topics/tp2' && init?.method === 'DELETE') return json({ error: 'topic_in_use', usedBy: { questions: 2 } }, 409);
      return undefined;
    });
    return { api, ...renderAdminRoutes([{ path: '/admin/exams/catalog', element: <ToastProvider><CatalogPage /></ToastProvider> }], { route: '/admin/exams/catalog', me }) };
  }

  it('delete is disabled with the count and the reason while a category or topic is used', async () => {
    setup();
    const del = await screen.findByRole('button', { name: 'Delete Teaching' });
    expect(del).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Used by 3 mock tests, 2 topics and 1 profession, so this category cannot be deleted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Empty one' })).not.toHaveAttribute('aria-disabled');
    expect(await screen.findByRole('button', { name: 'Delete Pedagogy' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Used by 12 questions, so this topic cannot be deleted/)).toBeInTheDocument();
  });

  it('moving a category sends the new order and announces it', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Move Empty one up' }));
    await waitFor(() => expect(api.calls.some((c) => c.url === '/api/admin/categories/reorder')).toBe(true));
    const post = api.calls.find((c) => c.url === '/api/admin/categories/reorder')!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ countryCode: 'RW', ids: ['c2', 'c1'] });
    expect(await screen.findByText('Moved Empty one to position 1 of 2.')).toBeInTheDocument();
  });

  it('a delete the API refuses stays open and says who uses it', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Unused' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete the topic/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete topic' }));
    expect(await within(dialog).findByText(/Used by 2 questions, so this topic cannot be deleted/)).toBeInTheDocument();
  });

  it('a Content editor without countries access still sees the page', async () => {
    setup(admin('CONTENT_EDITOR', EDITOR_PERMS));
    expect(await screen.findByRole('heading', { name: /Categories · Rwanda/ })).toBeInTheDocument();
  });
});

describe('case studies', () => {
  it('lists the cases of a test and links to the editor', async () => {
    stubViewport(true);
    mockFetch((url) => {
      if (url === '/api/admin/mock-tests/t1') return json({ mockTest: { id: 't1', title: 'Case test', languages: ['en', 'rw'], status: 'DRAFT', category: { id: 'c1', name: 'x' } }, sections: [], cases: [], questions: [] });
      if (url === '/api/admin/mock-tests/t1/cases') return json({ cases: [{ id: 'k1', title: 'School budget', questions: 3, translations: ['rw'] }] });
      return undefined;
    });
    renderAdminRoutes([{ path: '/admin/exams/:testId/cases', element: <CasePage /> }], { route: '/admin/exams/t1/cases', me: sys });
    expect(await screen.findByText('School budget')).toBeInTheDocument();
    expect(screen.getByText(/3 questions attached · translated: Kinyarwanda/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit School budget' })).toHaveAttribute('href', '/admin/exams/t1/cases/k1');
  });

  it('the editor has its four tabs and the preview shows the passage as candidates read it', async () => {
    stubViewport(true);
    mockFetch((url) => {
      if (url === '/api/admin/mock-tests/t1') return json({ mockTest: { id: 't1', title: 'Case test', languages: ['en', 'rw'], status: 'DRAFT', category: { id: 'c1', name: 'x' } }, sections: [], cases: [], questions: [] });
      if (url === '/api/admin/cases/k1') {
        return json({ case: { id: 'k1', mockTestId: 't1', title: 'School budget', passage: ['The school received a grant.'], tables: [{ caption: 'Budget', rows: [{ label: 'Books', value: '1,000' }] }], notes: ['All in RWF.'], questions: 1, translations: [], attachedQuestions: [{ id: 'q1', number: 4, stem: 'What is left?' }] } });
      }
      return undefined;
    });
    renderAdminRoutes([{ path: '/admin/exams/:testId/cases/:caseId', element: <CasePage /> }], { route: '/admin/exams/t1/cases/k1', me: sys });
    expect(await screen.findByRole('tab', { name: 'Case' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Case', 'Questions', 'Preview', 'Translations']);
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(await screen.findByText('Case study · applies to questions 4')).toBeInTheDocument();
    expect(screen.getByText('The school received a grant.')).toBeInTheDocument();
    expect(screen.getByText('All in RWF.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Translations' }));
    expect(await screen.findByRole('button', { name: /Kinyarwanda · Not translated/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy the English text to start' })).toBeInTheDocument();
  });

  it('a new case study can only use the Case tab until it is saved', async () => {
    stubViewport(true);
    mockFetch((url) => (url === '/api/admin/mock-tests/t1' ? json({ mockTest: { id: 't1', title: 'Case test', languages: ['en'], status: 'DRAFT', category: { id: 'c1', name: 'x' } }, sections: [], cases: [], questions: [] }) : undefined));
    renderAdminRoutes([{ path: '/admin/exams/:testId/cases/:caseId', element: <CasePage /> }], { route: '/admin/exams/t1/cases/new', me: sys });
    expect(await screen.findByRole('button', { name: 'Create case study' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Create case study' }));
    expect((await screen.findAllByText(/Write a title of at least 3 characters/)).length).toBeGreaterThan(0);
  });
});

describe('editing a test: status, checklist, sections', () => {
  const test = (status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') => ({
    mockTest: {
      id: 't1', slug: 's', title: 'Sec. Mathematics — Mock 1', summary: '', status, isFree: false, difficulty: 'STANDARD', durationMinutes: 90, languages: ['en'], instructions: [],
      countryCode: 'RW', negativeMarkPerWrong: 0, passMarkPercent: null, passMarkSource: null, category: { id: 'c1', name: 'Teaching' }, publishedAt: null, profession: { id: 'p1', name: 'Teacher' },
    },
    sections: [{ id: 's1', name: 'General', questionTypeLabel: 'Multiple choice', sortOrder: 0, questionCount: 4 }, { id: 's2', name: 'Empty', questionTypeLabel: 'Multiple choice', sortOrder: 1, questionCount: 0 }],
    cases: [], questions: [],
  });

  function setup(status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED', canPublish = false, deleteReply?: { status: number; body: unknown }) {
    stubViewport(true);
    const api = mockFetch((url, init) => {
      if (url === '/api/admin/mock-tests/t1' && (init?.method ?? 'GET') === 'GET') return json(test(status));
      if (url.startsWith('/api/admin/catalog-options')) return json(catalog);
      if (url.startsWith('/api/admin/country-options')) return json({ countries: [] });
      if (url === '/api/admin/mock-tests/t1/checklist') return json({ canPublish, items: [{ key: 'hasQuestions', label: 'q', ok: canPublish, blocking: true }, { key: 'freeSample', label: 'f', ok: false, blocking: false }] });
      if (url === '/api/admin/mock-tests/t1/consequences') return json({ attemptsInProgress: 2, attemptsFinished: 40, status: 'PUBLISHED' });
      if (url === '/api/admin/mock-tests/t1/unpublish') return json({ ok: true, status: 'DRAFT', consequences: {} });
      if (url === '/api/admin/mock-tests/t1' && init?.method === 'DELETE') return deleteReply ? { status: deleteReply.status, body: deleteReply.body } : json({ ok: true });
      if (url.startsWith('/api/admin/exams')) return json({ total: 0, page: 1, pageSize: 100, items: [] });
      return undefined;
    });
    return { api, ...renderAdminRoutes([{ path: '/admin/exams/:testId/edit', element: <ToastProvider><MockTestFormPage /></ToastProvider> }], { route: '/admin/exams/t1/edit', me: sys }) };
  }

  it('a draft with no questions cannot be published and says why; sections show the guard', async () => {
    setup('DRAFT', false);
    expect(await screen.findByText('Needs at least one published question')).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Fix the items marked as must-fix in the checklist first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete General' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Delete Empty' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByLabelText('Country')).toHaveValue('Rwanda');
  });

  it('unpublish shows what it does to candidates and needs a reason', async () => {
    const { api } = setup('PUBLISHED');
    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish…' }));
    const dialog = await screen.findByRole('dialog', { name: /Unpublish/ });
    expect(await within(dialog).findByText(/2 attempts are in progress and 40 have been finished/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }));
    expect(await within(dialog).findByText(/Write a reason/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Wrong answers in section 2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => expect(api.calls.some((c) => c.url.endsWith('/unpublish'))).toBe(true));
    const post = api.calls.find((c) => c.url.endsWith('/unpublish'))!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ reason: 'Wrong answers in section 2' });
  });

  it('a published test cannot be deleted: the button says why', async () => {
    setup('PUBLISHED');
    const del = await screen.findByRole('button', { name: 'Delete permanently…' });
    expect(del).toHaveAttribute('aria-disabled', 'true');
  });

  it('deleting an archived test needs its exact title and a reason, then sends both', async () => {
    const { api } = setup('ARCHIVED');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete permanently…' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete .* permanently/ });
    await userEvent.type(within(dialog).getByLabelText('Type the test’s title to confirm'), 'Sec. Mathematics');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Old dummy test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    expect(await within(dialog).findByText('Type the title exactly as it is shown above.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.init?.method === 'DELETE')).toBe(false);
    await userEvent.clear(within(dialog).getByLabelText('Type the test’s title to confirm'));
    await userEvent.type(within(dialog).getByLabelText('Type the test’s title to confirm'), 'Sec. Mathematics — Mock 1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(api.calls.some((c) => c.init?.method === 'DELETE')).toBe(true));
    const del = api.calls.find((c) => c.init?.method === 'DELETE')!;
    expect(JSON.parse(String(del.init?.body))).toEqual({ confirmTitle: 'Sec. Mathematics — Mock 1', reason: 'Old dummy test' });
  });

  it('a test candidates have taken is not deleted, and the dialog says why', async () => {
    setup('ARCHIVED', false, { status: 409, body: { error: 'has_attempts' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete permanently…' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete .* permanently/ });
    await userEvent.type(within(dialog).getByLabelText('Type the test’s title to confirm'), 'Sec. Mathematics — Mock 1');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Old dummy test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    expect(await within(dialog).findByText(/Candidates have taken this test/)).toBeInTheDocument();
  });
});
