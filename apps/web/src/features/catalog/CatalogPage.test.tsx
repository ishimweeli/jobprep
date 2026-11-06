import { screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobCatalogResponse } from '../../api/types';
import { setStoredPreferredJob } from '../../lib/preferredJob';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { CatalogPage } from './CatalogPage';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function jobsResponse(): JobCatalogResponse {
  return {
    total: 1,
    page: 1,
    pageSize: 20,
    empty: false,
    canRequestExam: false,
    facets: { categories: [], subjects: [], difficulties: [], languages: [] },
    results: [
      {
        examId: 'ex1', jobSlug: 'rw-cpd-coordination-officer', jobName: 'CPD Coordination Officer',
        category: { slug: 'government-administration', name: 'Government administration' },
        mockTestCount: 2, freeCount: 1, difficulties: ['STANDARD'], durationMinutes: 120, durationRange: null,
        questionCount: 100, questionCountRange: null, languages: ['en'], jobDeadlineAt: null, publishedAt: null,
      },
    ],
  };
}

function render(route = '/rw/tests') {
  mockFetch((url) => (url.startsWith('/api/countries/rw/jobs') ? { body: jobsResponse() } : undefined));
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/:country/tests" element={<CatalogPage />} />
        <Route path="/:country/tests/jobs/:jobSlug" element={<div>JOB PAGE</div>} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

describe('catalog page (job-first)', () => {
  it('shows one card per job when no preferred job is saved', async () => {
    render();
    expect(await screen.findByText('CPD Coordination Officer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View 2 exams/ })).toBeInTheDocument();
    expect(screen.queryByText('JOB PAGE')).not.toBeInTheDocument();
  });

  it('a guest with a saved job is redirected straight to its page', async () => {
    setStoredPreferredJob('rw-cpd-coordination-officer');
    render();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/tests/jobs/rw-cpd-coordination-officer'));
    expect(screen.getByText('JOB PAGE')).toBeInTheDocument();
  });
});
