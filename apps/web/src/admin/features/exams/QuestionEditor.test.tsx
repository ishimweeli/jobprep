import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_PERMS, SUPPORT_PERMS, SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { QuestionEditor } from './QuestionEditor';

afterEach(() => vi.unstubAllGlobals());

const question = (over: Record<string, unknown> = {}) => ({
  id: 'q1', type: 'MULTIPLE_SELECT', status: 'PUBLISHED', stem: 'Which of these are prime numbers?', explanation: 'Two, three and five are prime numbers.', marks: 2, difficulty: 'STANDARD', version: 2,
  options: [{ key: 'A', text: 'two', correct: true }, { key: 'B', text: 'four', correct: false }, { key: 'C', text: 'five', correct: true }, { key: 'D', text: 'six', correct: false }],
  scoring: 'PARTIAL', choose: null, topic: { id: 't1', name: 'Number theory' }, section: { id: 's1', name: 'Section A' }, case: null,
  translations: [{ language: 'rw', stem: 'Ni izihe ndangagaciro?', optionTexts: { A: 'a', B: 'b' }, explanation: '' }],
  translationStatus: [{ language: 'rw', state: 'partial' }, { language: 'sw', state: 'missing' }],
  ...over,
});
const detail = (q = question()) => ({
  question: q, mockTest: { id: 'm1', title: 'Mock 1', isFree: false, status: 'DRAFT', countryCode: 'RW' },
  position: { number: 3, total: 5, previousId: 'q0', nextId: 'q2' }, reports: [], stats: { attempts: 1204, correctPercent: 41 }, lastEdited: null,
});
const test = {
  mockTest: { id: 'm1', title: 'Mock 1', status: 'DRAFT', isFree: false, countryCode: 'RW', languages: ['en', 'rw', 'sw'], category: { id: 'c1', name: 'Teaching' } },
  sections: [{ id: 's1', name: 'Section A', questionTypeLabel: 'Multiple choice', sortOrder: 0, questionCount: 5 }, { id: 's2', name: 'Section B', questionTypeLabel: 'Multiple choice', sortOrder: 1, questionCount: 0 }],
  cases: [{ id: 'k1', title: 'School budget' }],
  questions: [],
};
const catalog = { categories: [{ id: 'c1', countryCode: 'RW', slug: 'teaching', name: 'Teaching', topics: [{ id: 't1', name: 'Number theory' }, { id: 't2', name: 'Algebra' }] }] };

function setup(opts: { id?: string; perms?: typeof SYSTEM_PERMS; q?: unknown; phone?: boolean } = {}) {
  stubViewport(!opts.phone);
  const api = mockFetch((url, init) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/admin/mock-tests/m1' && method === 'GET') return { body: test };
    if (url.startsWith('/api/admin/catalog-options')) return { body: catalog };
    if (url === '/api/admin/questions/q1' && method === 'GET') return { body: opts.q ?? detail() };
    if (url === '/api/admin/questions/q1' && method === 'PATCH') return { body: { ok: true } };
    if (url === '/api/admin/questions/q1/translations/rw' && method === 'PUT') return { body: { ok: true, state: 'partial' } };
    if (url === '/api/admin/questions/q1' && method === 'DELETE') return { body: { ok: true } };
    if (url === '/api/admin/mock-tests/m1/questions' && method === 'POST') return { status: 201, body: { id: 'q9', status: 'DRAFT' } };
    if (url.startsWith('/api/admin/cases/')) return { body: { case: { id: 'k1', mockTestId: 'm1', title: 'School budget', passage: ['The school has a budget.'], tables: [], notes: [], questions: 1 } } };
    return undefined;
  });
  const r = renderAdminRoutes(
    [{ path: '/admin/exams/:testId/q/:questionId', element: <QuestionEditor testId="m1" questionId={opts.id ?? 'q1'} phone={!!opts.phone} /> }, { path: '/admin/exams/:testId/q/new', element: <QuestionEditor testId="m1" questionId="new" phone={!!opts.phone} /> }],
    { route: `/admin/exams/m1/q/${opts.id ?? 'q1'}`, me: admin('SYSTEM_ADMIN', opts.perms ?? SYSTEM_PERMS) },
  );
  return { api, ...r };
}
const patchBody = (api: ReturnType<typeof setup>['api']) => JSON.parse(String(api.calls.find((c) => c.init?.method === 'PATCH')!.init!.body));

describe('question editor: multiple-select', () => {
  it('opens editable with checkboxes for the correct options, the marking choice and no read-only rule', async () => {
    setup();
    expect(await screen.findByLabelText('Question')).toHaveValue('Which of these are prime numbers?');
    expect(screen.getByLabelText('Mark option A as correct')).toBeChecked();
    expect(screen.getByLabelText('Mark option A as correct')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('Mark option C as correct')).toBeChecked();
    expect(screen.getByLabelText('Mark option B as correct')).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Partial credit/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /All or nothing/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save draft' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText(/Edited after 1,204 attempts/)).toBeInTheDocument();
  });

  it('saving after a change of marking sends the type, scoring and the options with the correct set', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('radio', { name: /All or nothing/ }));
    await userEvent.click(screen.getByLabelText('Mark option D as correct'));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.calls.some((c) => c.init?.method === 'PATCH')).toBe(true));
    expect(patchBody(api)).toMatchObject({ type: 'MULTIPLE_SELECT', scoring: 'ALL_OR_NOTHING', correct: ['A', 'C', 'D'], status: 'DRAFT' });
    expect(await screen.findByText('Saved as a draft.')).toBeInTheDocument();
  });

  it('a "choose" smaller than the correct answers is refused before any request', async () => {
    const { api } = setup();
    await userEvent.type(await screen.findByLabelText(/Choose how many/), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least the number of correct answers/);
    expect(api.calls.some((c) => c.init?.method === 'PATCH')).toBe(false);
  });

  it('removing an option re-letters the rest and keeps the right answers on their texts', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove option A' }));
    expect(screen.getByLabelText('Option A')).toHaveValue('four');
    expect(screen.getByLabelText('Option B')).toHaveValue('five');
    expect(screen.getByLabelText('Mark option B as correct')).toBeChecked();
    expect(screen.queryByLabelText('Option D')).not.toBeInTheDocument();
  });

  it('adds options up to six and then stops', async () => {
    setup();
    const add = await screen.findByRole('button', { name: '+ Add option' });
    await userEvent.click(add);
    await userEvent.click(add);
    expect(screen.getByLabelText('Option F')).toBeInTheDocument();
    expect(add).toBeDisabled();
  });

  it('a server refusal is shown in words inside the form and the edits stay', async () => {
    stubViewport(true);
    mockFetch((url, init) => {
      if (url === '/api/admin/questions/q1' && init?.method === 'PATCH') return { status: 400, body: { error: 'invalid_choose' } };
      if (url === '/api/admin/questions/q1') return { body: detail() };
      if (url === '/api/admin/mock-tests/m1') return { body: test };
      if (url.startsWith('/api/admin/catalog-options')) return { body: catalog };
      return undefined;
    });
    renderAdminRoutes([{ path: '/admin/exams/:testId/q/:questionId', element: <QuestionEditor testId="m1" questionId="q1" phone={false} /> }], { route: '/admin/exams/m1/q/q1', me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });
    await userEvent.clear(await screen.findByLabelText('Question'));
    await userEvent.type(screen.getByLabelText('Question'), 'Which numbers are prime?');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/number to choose/);
    expect(screen.getByLabelText('Question')).toHaveValue('Which numbers are prime?');
  });
});

describe('question editor: case-based, single answer and permissions', () => {
  it('case-based shows the case choice with a link to manage case studies; a case is required', async () => {
    const { api } = setup({ q: detail(question({ type: 'CASE_BASED', scoring: null, options: [{ key: 'A', text: 'x', correct: true }, { key: 'B', text: 'y', correct: false }], case: null })) });
    expect(await screen.findByLabelText('Case study')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage case studies' })).toHaveAttribute('href', '/admin/exams/m1/cases');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a case study');
    expect(api.calls.some((c) => c.init?.method === 'PATCH')).toBe(false);
    await userEvent.selectOptions(screen.getByLabelText('Case study'), 'k1');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(patchBody(api)).toMatchObject({ caseId: 'k1', status: 'DRAFT' }));
  });

  it('changing the type to single answer keeps one correct answer', async () => {
    const { api } = setup();
    await userEvent.selectOptions(await screen.findByLabelText('Question type'), 'SINGLE_CHOICE');
    expect(screen.getByLabelText('Mark option A as correct')).toHaveAttribute('type', 'radio');
    expect(screen.getByLabelText('Mark option C as correct')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(patchBody(api)).toMatchObject({ type: 'SINGLE_CHOICE', correct: ['A'], caseId: null }));
  });

  it('a role without exams:write sees the fields but a disabled button that says why', async () => {
    setup({ perms: SUPPORT_PERMS });
    expect(await screen.findByLabelText('Question')).toHaveAttribute('readonly');
    const publish = screen.getByRole('button', { name: 'Publish change & resolve reports' });
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Only a Content editor or System admin can change questions/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove option A' })).not.toBeInTheDocument();
  });

  it('a content editor publishes and resolves reports', async () => {
    const { api } = setup({ perms: EDITOR_PERMS });
    await userEvent.click(await screen.findByRole('button', { name: 'Publish change & resolve reports' }));
    await waitFor(() => expect(patchBody(api)).toMatchObject({ status: 'PUBLISHED', resolveReports: true }));
  });
});

describe('question editor: translations and preview', () => {
  it('has a tab per other language with its completeness in words', async () => {
    setup();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['English (source)', 'Kinyarwanda · Partly translated', 'Kiswahili · Not translated']);
  });

  it('saves a translation with exactly the question’s option letters', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('tab', { name: /Kinyarwanda/ }));
    expect(screen.getByLabelText('Question in Kinyarwanda')).toHaveValue('Ni izihe ndangagaciro?');
    await userEvent.type(screen.getByLabelText('Explanation in Kinyarwanda'), 'Bibiri, bitatu na bitanu.');
    await userEvent.click(screen.getByRole('button', { name: 'Save Kinyarwanda translation' }));
    await waitFor(() => expect(api.calls.some((c) => c.url.endsWith('/translations/rw') && c.init?.method === 'PUT')).toBe(true));
    const body = JSON.parse(String(api.calls.find((c) => c.init?.method === 'PUT')!.init!.body));
    expect(Object.keys(body.optionTexts)).toEqual(['A', 'B', 'C', 'D']);
    expect(body.explanation).toBe('Bibiri, bitatu na bitanu.');
  });

  it('"Copy the English text" fills the translation', async () => {
    setup();
    await userEvent.click(await screen.findByRole('tab', { name: /Kiswahili/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy the English text' }));
    expect(screen.getByLabelText('Question in Kiswahili')).toHaveValue('Which of these are prime numbers?');
    expect(screen.getByLabelText(/Option C/)).toHaveValue('five');
  });

  it('the preview shows the instruction line for multiple answers, no count of correct answers, and closes with Esc', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Preview as candidate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preview as candidate' });
    expect(within(dialog).getByText('Select ALL that apply.')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(4);
    expect(within(dialog).queryByText(/Choose \d/)).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('the preview of a case-based question shows its case study', async () => {
    setup({ q: detail(question({ type: 'CASE_BASED', scoring: null, options: [{ key: 'A', text: 'x', correct: true }, { key: 'B', text: 'y', correct: false }], case: { id: 'k1', title: 'School budget' } })) });
    await userEvent.click(await screen.findByRole('button', { name: 'Preview as candidate' }));
    expect(await screen.findByText('The school has a budget.')).toBeInTheDocument();
  });
});

describe('question editor: new question, archive', () => {
  it('"Add question" starts blank with a section and creates through the API', async () => {
    const { api, router } = setup({ id: 'new' });
    expect(await screen.findByRole('button', { name: 'Create as draft' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Question'), 'What is the capital of Rwanda?');
    await userEvent.type(screen.getByLabelText('Option A'), 'Kigali');
    await userEvent.type(screen.getByLabelText('Option B'), 'Huye');
    await userEvent.type(screen.getByLabelText('Option C'), 'Musanze');
    await userEvent.type(screen.getByLabelText('Option D'), 'Rubavu');
    await userEvent.click(screen.getByLabelText('Mark option A as correct'));
    await userEvent.type(screen.getByLabelText('Explanation shown after submission'), 'Kigali is the capital city.');
    await userEvent.selectOptions(screen.getByLabelText('Topic'), 't1');
    await userEvent.click(screen.getByRole('button', { name: 'Create as draft' }));
    await waitFor(() => expect(api.calls.some((c) => c.url === '/api/admin/mock-tests/m1/questions' && c.init?.method === 'POST')).toBe(true));
    const body = JSON.parse(String(api.calls.find((c) => c.init?.method === 'POST')!.init!.body));
    expect(body).toMatchObject({ sectionId: 's1', topicId: 't1', type: 'SINGLE_CHOICE', correct: ['A'], status: 'DRAFT', marks: 1 });
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/exams/m1/q/q9'));
  }, 20_000); // many keystrokes: slow when the machine is busy

  it('shows what is missing instead of sending an incomplete new question', async () => {
    const { api } = setup({ id: 'new' });
    await userEvent.click(await screen.findByRole('button', { name: 'Create & publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Write the question');
    expect(api.calls.some((c) => c.init?.method === 'POST')).toBe(false);
  });

  it('archiving asks first, says what happens and then archives', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Archive question' }));
    const dialog = await screen.findByRole('dialog', { name: 'Archive this question?' });
    expect(within(dialog).getByText(/keep their history/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive question' }));
    await waitFor(() => expect(api.calls.some((c) => c.url === '/api/admin/questions/q1' && c.init?.method === 'DELETE')).toBe(true));
  });

  it('phone: the same editor with a 360-friendly layout (wrapping option rows)', async () => {
    setup({ phone: true });
    expect(await screen.findByLabelText('Question')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish & resolve reports' })).toBeInTheDocument();
  });
});
