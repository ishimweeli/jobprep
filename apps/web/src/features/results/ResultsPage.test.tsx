import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResultResponse } from '../../api/types';
import { testSession } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { ResultsPage } from './ResultsPage';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const topic = (id: string, percent: number) => ({ topicId: id, name: `Topic ${id}`, correct: 1, total: 2, marks: 1, marksAvailable: 2, percent, weak: percent < 60 });

function result(over: Partial<ResultResponse> = {}): ResultResponse {
  return {
    attempt: { id: 'a1', kind: 'FULL', status: 'SUBMITTED', autoSubmitted: false, startedAt: '2026-11-01T10:00:00Z', submittedAt: '2026-11-01T10:30:00Z', timeSpentSeconds: 1800 },
    mockTest: { slug: 'math', title: 'Maths mock', countryCode: 'RW', isFree: true },
    score: { marks: 5, totalMarks: 10, percent: 50 },
    counts: { total: 10, correct: 5, incorrect: 3, unanswered: 2 },
    passMark: null,
    noOfficialPassMark: true,
    comparison: null,
    history: [],
    topics: [topic('a', 40), topic('b', 80)],
    weakestTopic: { topicId: 'a', name: 'Topic a', percent: 40 },
    reviewFirst: [],
    incorrectCount: 3,
    isGuest: true,
    canPractice: true,
    ...over,
  };
}

function render(r: ResultResponse, route = '/rw/results/a1', signedIn = false) {
  if (signedIn) localStorage.setItem('jobprep.session', '1');
  mockFetch((url) => {
    if (url === '/api/attempts/a1/result') return { body: r };
    if (url === '/api/me') return { body: testSession() };
    if (url === '/api/countries') return { body: { countries: [] } };
    return undefined;
  });
  return renderWithProviders(
    <Routes>
      <Route path="/:country/results/:attemptId" element={<ResultsPage />} />
    </Routes>,
    { route },
  );
}

describe('results edge states (C6)', () => {
  it('a normal full test: Practice Weak Areas, guest banner, no practice wording', async () => {
    render(result());
    expect(await screen.findByRole('link', { name: 'Save my result' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Your results' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Practice Weak Areas' })).toBeInTheDocument();
    expect(screen.queryByTestId('auto-submitted')).not.toBeInTheDocument();
    expect(screen.queryByText('Practice answers do not change your mock test scores.')).not.toBeInTheDocument();
  });

  it('the save link remembers to say "Saved." afterwards', async () => {
    render(result());
    const link = await screen.findByRole('link', { name: 'Save my result' });
    expect(decodeURIComponent(link.getAttribute('href')!)).toBe('/sign-up?next=/rw/results/a1?saved=1');
  });

  it('a signed-in person has no "Save my result" banner', async () => {
    render(result({ isGuest: false }), '/rw/results/a1', true);
    expect(await screen.findByRole('button', { name: 'Practice Weak Areas' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Save my result' })).not.toBeInTheDocument();
  });

  it('after Save my result the person sees "Saved." with a link to My progress', async () => {
    render(result({ isGuest: false }), '/rw/results/a1?saved=1', true);
    const note = await screen.findByText('Saved.');
    expect(note.closest('[role="status"]')).toHaveTextContent('Find this result under My progress.');
    expect(screen.getAllByRole('link', { name: 'Go to My progress' })[0]).toHaveAttribute('href', '/rw/progress');
  });

  it('auto-submitted: says it was submitted when time ran out', async () => {
    render(result({ attempt: { ...result().attempt, autoSubmitted: true, status: 'AUTO_SUBMITTED' } }));
    expect(await screen.findByTestId('auto-submitted')).toHaveTextContent('Submitted automatically when time ran out.');
  });

  it('no weak areas: a positive line, no Practice Weak Areas button and no Weak area badge', async () => {
    render(result({ topics: [topic('a', 70), topic('b', 90)], weakestTopic: null, canPractice: false }));
    expect(await screen.findByTestId('results-summary-line')).toHaveTextContent('No weak areas this time: every topic is at 60% or above.');
    expect(screen.queryByRole('button', { name: 'Practice Weak Areas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Weak area')).not.toBeInTheDocument();
  });

  it('zero answered and perfect score have their own line', async () => {
    const { unmount } = render(result({ counts: { total: 10, correct: 0, incorrect: 0, unanswered: 10 }, score: { marks: 0, totalMarks: 10, percent: 0 }, topics: [topic('a', 0)] }));
    expect(await screen.findByTestId('results-summary-line')).toHaveTextContent('You did not answer any questions, so the score is 0%.');
    unmount();
    vi.unstubAllGlobals();
    render(result({ counts: { total: 10, correct: 10, incorrect: 0, unanswered: 0 }, score: { marks: 10, totalMarks: 10, percent: 100 }, topics: [topic('a', 100)], weakestTopic: null, canPractice: false }));
    expect(await screen.findByTestId('results-summary-line')).toHaveTextContent('Perfect score. Every answer was correct.');
  });
});

describe('practice results (C2)', () => {
  const practice = (over: Partial<ResultResponse> = {}) =>
    result({
      attempt: { ...result().attempt, kind: 'PRACTICE' },
      comparison: { previousAttemptId: 'p', previousPercent: 20, previousSubmittedAt: null, deltaPoints: 30, previousTimeSpentSeconds: 60 },
      history: [{ attemptId: 'p', submittedAt: null, percent: 20, current: false }, { attemptId: 'a1', submittedAt: null, percent: 50, current: true }],
      isGuest: false,
      ...over,
    });

  it('reuses the results screen with no comparison, a practice note, Practice again and Back to my progress', async () => {
    render(practice(), '/rw/results/a1', true);
    expect((await screen.findAllByRole('heading', { name: 'Practice results' })).length).toBeGreaterThan(0);
    expect(screen.getByText('Practice answers do not change your mock test scores.')).toBeInTheDocument();
    expect(screen.queryByText(/from your last attempt/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Compared with/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Practice again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to my progress' })).toHaveAttribute('href', '/rw/progress');
    expect(screen.getByRole('link', { name: 'Review Answers' })).toBeInTheDocument();
  });
});
