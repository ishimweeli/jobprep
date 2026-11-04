import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { ChangeGoalPage } from './ChangeGoalPage';

beforeEach(() => localStorage.setItem('jobprep.session', '1'));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const cat = (id: string, name: string) => ({ id, slug: id, name, description: null, icon: null, featured: false, mockTestCount: 4 });

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function server(goalCategoryId: string | null) {
  return mockFetch((url, init) => {
    if (url === '/api/me' && init?.method === 'PATCH') return { body: { user: testSession({ goalCategoryId: 'c2' }).user } };
    if (url === '/api/me') return { body: testSession({ goalCategoryId }) };
    if (url === '/api/countries/rw/categories') return { body: { categories: [cat('c1', 'Teaching positions'), cat('c2', 'Accounting and finance')] } };
    return undefined;
  });
}

const renderPage = () =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/account/goal" element={<ChangeGoalPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </>,
    { route: '/account/goal' },
  );

describe('change goal (C15)', () => {
  it('marks the current goal, keeps Save disabled until another is picked, then saves and goes to the dashboard', async () => {
    const { calls } = server('c1');
    const u = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Change your goal' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: /Teaching positions/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Current goal/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save goal' })).toBeDisabled();
    await u.click(screen.getByRole('radio', { name: /Accounting and finance/ }));
    await u.click(screen.getByRole('button', { name: 'Save goal' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/progress'));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === 'PATCH')!.init!.body))).toEqual({ goalCategoryId: 'c2' });
  });

  it('with no goal (after a country switch) it is the "Choose your goal" prompt with nothing pre-selected', async () => {
    server(null);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Choose your goal' })).toBeInTheDocument();
    expect(await screen.findAllByRole('radio')).toHaveLength(2);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Not now' })).toHaveAttribute('href', '/account/settings');
  });
});
