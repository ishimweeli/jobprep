import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttemptState, ExamQuestion } from '../../api/types';
import { QueryError } from '../../components/states';
import { ApiError } from '../../api/client';
import { pickOption } from '../exam/examModel';
import { AnswerOptions } from '../exam/ExamParts';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { PracticeRunner } from './PracticeRunner';

const mk = (id: string, n: number, extra: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id, number: n, sectionName: 'S', topic: { id: 't1', name: 'Statistics & probability' }, type: 'SINGLE_CHOICE', multiple: false, choose: null, stem: `Stem ${n}`,
  options: [{ key: 'A', text: 'Option A' }, { key: 'B', text: 'Option B' }, { key: 'C', text: 'Option C' }], marks: 1, caseId: null, ...extra,
});
const attempt = (questions: ExamQuestion[]): AttemptState => ({
  attempt: { id: 'att1', status: 'IN_PROGRESS', kind: 'PRACTICE', startedAt: '', deadlineAt: '', durationSeconds: 0, submittedAt: null, mockTest: { slug: 's', title: 'Practice', countryCode: 'RW' } },
  timer: { untimed: true, remainingSeconds: 0, serverNow: '', deadlineAt: '', low: false, expired: false },
  questions, cases: [], answers: {}, counts: { total: questions.length, answered: 0, flagged: 0 }, finished: false,
});

afterEach(() => vi.unstubAllGlobals());

function server() {
  return mockFetch((url, init) => {
    if (url === '/api/attempts/att1/answers' && init?.method === 'PUT') return { body: { results: [{ questionId: 'q1', status: 'saved' }] } };
    if (url === '/api/attempts/att1/check' && init?.method === 'POST') {
      const id = JSON.parse(String(init.body)).questionId as string;
      return id === 'q1'
        ? { body: { questionId: 'q1', state: 'incorrect', correct: ['B'], yourAnswer: ['A'], explanation: 'B is right because of B.' } }
        : { body: { questionId: 'q2', state: 'correct', correct: ['C'], yourAnswer: ['C'], explanation: null } };
    }
    if (url === '/api/attempts/att1/submit' && init?.method === 'POST') return { body: { status: 'SUBMITTED', autoSubmitted: false, submittedAt: '', counts: { total: 2, answered: 2, flagged: 0 }, unanswered: 0 } };
    return undefined;
  });
}
const renderRunner = (qs: ExamQuestion[]) =>
  renderWithProviders(
    <Routes>
      <Route path="/rw/exam/att1" element={<PracticeRunner state={attempt(qs)} slug="rw" />} />
    </Routes>,
    { route: '/rw/exam/att1' },
  );

describe('practice runner (Practice.dc)', () => {
  it('is untimed and labelled as practice: no timer, no navigator, no submit', () => {
    server();
    renderRunner([mk('q1', 1), mk('q2', 2)]);
    expect(screen.getByText('Untimed')).toBeInTheDocument();
    expect(screen.getByText('Feedback after every question · doesn’t affect your scores')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.queryByText(/Submit exam|Flag/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Question 1 of 2' })).toBeInTheDocument();
  });

  it('answer -> Check answer -> feedback + explanation -> Next question; the explanation is not there before checking', async () => {
    const { calls } = server();
    const u = userEvent.setup();
    renderRunner([mk('q1', 1), mk('q2', 2)]);
    expect(screen.queryByText('B is right because of B.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check answer' })).toHaveAttribute('aria-disabled', 'true');
    await u.click(screen.getByRole('button', { name: /Option A/ }));
    await u.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByText('Not quite — the answer is B')).toBeInTheDocument();
    expect(screen.getByText('B is right because of B.')).toBeInTheDocument();
    expect(screen.getByText('✓ Correct')).toBeInTheDocument();
    expect(screen.getByText('✕ Your answer')).toBeInTheDocument();
    // the answer was saved before the check was asked for
    const urls = calls.map((c) => `${c.init?.method} ${c.url}`);
    expect(urls.indexOf('PUT /api/attempts/att1/answers')).toBeLessThan(urls.indexOf('POST /api/attempts/att1/check'));
    // locked after checking
    await u.click(screen.getByRole('button', { name: /Option C/ }));
    expect(screen.getByText('Not quite — the answer is B')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByRole('heading', { name: 'Question 2 of 2' })).toBeInTheDocument();
    expect(screen.queryByText('Not quite — the answer is B')).not.toBeInTheDocument();
  });

  it('the last question ends in the summary, which says practice does not change mock test scores', async () => {
    const { calls } = server();
    const u = userEvent.setup();
    renderRunner([mk('q1', 1), mk('q2', 2)]);
    await u.click(screen.getByRole('button', { name: /Option A/ }));
    await u.click(screen.getByRole('button', { name: 'Check answer' }));
    await u.click(await screen.findByRole('button', { name: 'Next question' }));
    await u.click(screen.getByRole('button', { name: /Option C/ }));
    await u.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByText('Correct')).toBeInTheDocument();
    // the last question offers "Finish practice", which asks first (answered / not answered)
    await u.click(screen.getByRole('button', { name: 'Finish practice' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finish practice?' });
    expect(dialog).toHaveTextContent('You have answered all 2 questions.');
    await u.click(screen.getByRole('button', { name: 'Finish now' }));
    expect(await screen.findByRole('heading', { name: 'Practice finished' })).toBeInTheDocument();
    expect(screen.getByText(/You answered/)).toHaveTextContent('You answered 2 questions on Statistics & probability and got 1 right. Practice answers don’t change your mock test scores.');
    expect(screen.getByRole('button', { name: 'Practise 2 more' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take a full mock test' })).toHaveAttribute('href', '/rw/tests');
    await waitFor(() => expect(calls.some((c) => c.url === '/api/attempts/att1/submit')).toBe(true));
  });

  it('End practice asks first with the counts; Keep practising goes back, Finish now shows the summary', async () => {
    server();
    const u = userEvent.setup();
    renderRunner([mk('q1', 1), mk('q2', 2)]);
    await u.click(screen.getByRole('button', { name: 'End practice' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finish practice?' });
    expect(dialog).toHaveTextContent('You have answered 0 of 2 questions. The 2 you have not answered will be left out.');
    await u.click(screen.getByRole('button', { name: 'Keep practising' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Question 1 of 2' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'End practice' }));
    await u.click(screen.getByRole('button', { name: 'Finish now' }));
    expect(await screen.findByRole('heading', { name: 'Practice finished' })).toBeInTheDocument();
    expect(screen.getByText(/You answered/)).toHaveTextContent('You answered 0 questions');
  });

  it('a partly correct multiple-select answer says how many right answers were found', async () => {
    mockFetch((url, init) => {
      if (url === '/api/attempts/att1/answers' && init?.method === 'PUT') return { body: { results: [{ questionId: 'q1', status: 'saved' }] } };
      if (url === '/api/attempts/att1/check' && init?.method === 'POST') return { body: { questionId: 'q1', state: 'partial', correct: ['A', 'C'], yourAnswer: ['A', 'B'], explanation: 'Because.' } };
      return undefined;
    });
    const u = userEvent.setup();
    renderRunner([mk('q1', 1, { multiple: true, type: 'MULTIPLE_SELECT', choose: 2 })]);
    await u.click(screen.getByRole('checkbox', { name: /Option A/ }));
    await u.click(screen.getByRole('checkbox', { name: /Option B/ }));
    await u.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByText('Partly correct')).toBeInTheDocument();
    expect(screen.getByText('You found 1 of 2 correct answers and chose 1 that is not correct. The correct answers are A, C.')).toBeInTheDocument();
  });

  it('a multiple-select practice question shows "Choose 2", caps picks and tells the user to unselect one', async () => {
    server();
    const u = userEvent.setup();
    renderRunner([mk('q1', 1, { multiple: true, type: 'MULTIPLE_SELECT', choose: 2 })]);
    expect(screen.getByText('Choose 2')).toBeInTheDocument();
    await u.click(screen.getByRole('checkbox', { name: /Option A/ }));
    await u.click(screen.getByRole('checkbox', { name: /Option B/ }));
    await u.click(screen.getByRole('checkbox', { name: /Option C/ }));
    expect(screen.getByRole('checkbox', { name: /Option C/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('You’ve chosen 2. Unselect one to change your answer.')).toBeInTheDocument();
  });
});

describe('multiple-select options in the exam (MultiSelect.dc)', () => {
  const m = mk('m1', 38, { multiple: true, type: 'MULTIPLE_SELECT', choose: 3, options: ['A', 'B', 'C', 'D', 'E'].map((k) => ({ key: k, text: `Choice ${k}` })) });
  function Harness() {
    const [sel, setSel] = useState<string[]>([]);
    const [blocked, setBlocked] = useState(false);
    return (
      <AnswerOptions
        question={m}
        selected={sel}
        blocked={blocked}
        onPick={(key) => {
          const r = pickOption(m, sel, key);
          setBlocked(r.blocked);
          setSel(r.selected);
        }}
      />
    );
  }
  it('square checkboxes in a group named for the limit, a live count, and the cap message', async () => {
    const u = userEvent.setup();
    renderWithProviders(<Harness />);
    expect(screen.getByRole('group', { name: 'Answer options, choose 3' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(screen.getByRole('status')).toHaveTextContent('0 of 3 chosen');
    await u.click(screen.getByRole('checkbox', { name: /Choice A/ }));
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 chosen — choose 2 more');
    await u.click(screen.getByRole('checkbox', { name: /Choice C/ }));
    await u.click(screen.getByRole('checkbox', { name: /Choice E/ }));
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 chosen');
    await u.click(screen.getByRole('checkbox', { name: /Choice B/ }));
    expect(screen.getByRole('status')).toHaveTextContent('You’ve chosen 3. Unselect one to change your answer.');
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(3);
    await u.click(screen.getByRole('checkbox', { name: /Choice E/ }));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 chosen — choose 1 more');
    await u.click(screen.getByRole('checkbox', { name: /Choice B/ }));
    expect(screen.getAllByRole('checkbox', { checked: true }).map((e) => e.textContent?.slice(0, 1))).toEqual(['A', 'B', 'C']);
  });
});

describe('server errors on a page', () => {
  it('a 500 shows "Something went wrong on our side" with the Reference from the API', () => {
    renderWithProviders(<QueryError error={new ApiError(500, 'internal_error', {}, null, 'ABCD1234')} what="your progress" onRetry={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Something went wrong on our side' })).toBeInTheDocument();
    expect(screen.getByText(/Reference: JP-ABCD-1234/)).toBeInTheDocument();
  });
  it('a 404 keeps the small retry state', () => {
    renderWithProviders(<QueryError error={new ApiError(404, 'not_found')} what="your progress" onRetry={vi.fn()} />);
    expect(screen.getByText('We could not load your progress')).toBeInTheDocument();
  });
});
