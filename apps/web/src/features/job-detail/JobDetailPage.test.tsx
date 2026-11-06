import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobDetail } from '../../api/types';
import { PREFERRED_JOB_KEY } from '../../lib/preferredJob';
import { testSession } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { JobDetailPage } from './JobDetailPage';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

const JOB_SLUG = 'rw-cpd-coordination-officer';

function job(over: Partial<JobDetail> = {}): JobDetail {
  return {
    exam: { id: 'ex1', slug: JOB_SLUG, name: 'CPD Coordination Officer' },
    category: { slug: 'government-administration', name: 'Government administration' },
    profession: { name: 'CPD Coordination Officer' },
    jobDeadlineAt: null,
    freeCount: 1,
    totalMockTests: 2,
    mockTests: [
      { id: 'm1', slug: 'cpd-mock-1', title: 'CPD Coordination Officer — Mock 1', isFree: true, accessTag: 'FREE', difficulty: 'STANDARD', languages: ['en'], durationMinutes: 120, questionCount: 100, jobDeadlineAt: null, publishedAt: null, access: { state: 'FREE', canStart: true, needsFullAccess: false, accessEndsAt: null, daysLeft: null } },
      { id: 'm2', slug: 'cpd-mock-2', title: 'CPD Coordination Officer — Mock 2', isFree: false, accessTag: 'FULL_ACCESS', difficulty: 'STANDARD', languages: ['en'], durationMinutes: 120, questionCount: 100, jobDeadlineAt: null, publishedAt: null, access: { state: 'LOCKED', canStart: false, needsFullAccess: true, accessEndsAt: null, daysLeft: null } },
    ],
    ...over,
  };
}

function render({ signedIn = false } = {}) {
  if (signedIn) localStorage.setItem('jobprep.session', '1');
  const server = mockFetch((url, init) => {
    if (url === `/api/countries/rw/jobs/${JOB_SLUG}`) return { body: job() };
    if (url === '/api/me' && init?.method === 'PATCH') return { body: { user: testSession().user, preferredJob: null } };
    if (url === '/api/me') return signedIn ? { body: testSession() } : { status: 401, body: { error: 'not_authenticated' } };
    return undefined;
  });
  return {
    ...renderWithProviders(
      <>
        <Routes>
          <Route path="/:country/tests/jobs/:jobSlug" element={<JobDetailPage />} />
          <Route path="/:country/tests" element={<div>CATALOG</div>} />
        </Routes>
        <Where />
      </>,
      { route: `/rw/tests/jobs/${JOB_SLUG}` },
    ),
    server,
  };
}

describe('job detail page', () => {
  it('lists every mock test under the job with its own access state', async () => {
    render();
    expect(await screen.findByRole('heading', { name: 'CPD Coordination Officer' })).toBeInTheDocument();
    expect(screen.getByText('CPD Coordination Officer — Mock 1')).toBeInTheDocument();
    expect(screen.getByText('CPD Coordination Officer — Mock 2')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('a guest landing on the page remembers it in localStorage, and Change job clears it and leaves', async () => {
    const u = userEvent.setup();
    render();
    await screen.findByRole('heading', { name: 'CPD Coordination Officer' });
    await waitFor(() => expect(localStorage.getItem(PREFERRED_JOB_KEY)).toBe(JOB_SLUG));

    await u.click(screen.getAllByRole('button', { name: 'Change job' })[0]!);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/tests'));
    expect(localStorage.getItem(PREFERRED_JOB_KEY)).toBeNull();
  });

  it('a signed-in user’s pick is saved server-side on load', async () => {
    const { server } = render({ signedIn: true });
    await screen.findByRole('heading', { name: 'CPD Coordination Officer' });
    await waitFor(() => expect(server.calls.some((c) => c.url === '/api/me' && c.init?.method === 'PATCH')).toBe(true));
  });
});
