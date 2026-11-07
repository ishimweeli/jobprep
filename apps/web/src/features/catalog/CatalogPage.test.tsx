import { screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobCatalogResponse } from '../../api/types';
import { markPushNavigation, resetPushedThisSession } from '../../lib/navigationHistory';
import { setStoredPreferredJob } from '../../lib/preferredJob';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { CatalogPage } from './CatalogPage';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  resetPushedThisSession();
});

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function jobsResponse(categories: JobCatalogResponse['facets']['categories'] = []): JobCatalogResponse {
  return {
    total: 1,
    page: 1,
    pageSize: 20,
    empty: false,
    canRequestExam: false,
    facets: { categories, subjects: [], difficulties: [], languages: [] },
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

function render(route = '/rw/tests', categories?: JobCatalogResponse['facets']['categories']) {
  mockFetch((url) => (url.startsWith('/api/countries/rw/jobs') ? { body: jobsResponse(categories) } : undefined));
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
    expect(screen.getByRole('link', { name: 'View exams: CPD Coordination Officer' })).toBeInTheDocument();
    expect(screen.getByText('Free to try')).toBeInTheDocument();
    expect(screen.queryByText(/100 questions/)).not.toBeInTheDocument();
    expect(screen.queryByText('JOB PAGE')).not.toBeInTheDocument();
  });

  const categories = [
    { slug: 'government-administration', name: 'Government administration', count: 30 },
    { slug: 'procurement', name: 'Procurement', count: 0 },
  ];

  it('a category with no jobs gets no chip; one with jobs does', async () => {
    render('/rw/tests', categories);
    await screen.findByText('CPD Coordination Officer');
    expect(screen.getAllByRole('button', { name: 'Government administration' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Procurement' })).not.toBeInTheDocument();
  });

  it('an empty category opened by link keeps its chip, shown as selected', async () => {
    render('/rw/tests?category=procurement', categories);
    await screen.findByText('CPD Coordination Officer');
    for (const chip of screen.getAllByRole('button', { name: 'Procurement' })) expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('a guest with a saved job is redirected straight to its page', async () => {
    setStoredPreferredJob('rw-cpd-coordination-officer');
    render();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/tests/jobs/rw-cpd-coordination-officer'));
    expect(screen.getByText('JOB PAGE')).toBeInTheDocument();
  });

  it('browser Back out of the job page is not treated as a fresh visit, so it does not re-redirect', async () => {
    setStoredPreferredJob('rw-cpd-coordination-officer');
    // A POP straight to /tests with nothing pushed first (this test's own render) is a fresh load/direct Back out
    // of the app — still redirects. Only a POP *after* an in-app PUSH (simulated here) is "escaping" the job page.
    markPushNavigation();
    render();
    expect(await screen.findByText('CPD Coordination Officer')).toBeInTheDocument();
    expect(screen.queryByText('JOB PAGE')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/rw/tests');
  });
});
