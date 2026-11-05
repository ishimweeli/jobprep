import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { getStoredTheme } from '../../lib/theme';
import { TopBar } from './TopBar';
import type { RouteHandle } from './SiteLayout';

const rwanda = { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true };

function renderAt(route: string, handle: RouteHandle) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createMemoryRouter(
    [{ path: '/:country', children: [{ path: 'tests/:slug', handle, element: <TopBar /> }, { path: 'tests', handle, element: <TopBar /> }, { path: 'progress', handle, element: <TopBar /> }] }],
    { initialEntries: [route] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function server() {
  return mockFetch((url, init) => {
    if (url === '/api/countries') return { body: { countries: [rwanda] } };
    if (url === '/api/me' && init?.method === 'PATCH') return { body: testSession({ language: 'rw' }).user };
    if (url === '/api/me') return { body: testSession() };
    return undefined;
  });
}

beforeEach(() => {
  localStorage.setItem('jobprep.session', '1');
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('TopBar (the signed-in desktop top bar)', () => {
  it('shows the route\'s title', async () => {
    server();
    renderAt('/rw/progress', { title: 'Dashboard' });
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('shows a back arrow to Mock tests on the exam-detail page instead of a plain title', async () => {
    server();
    renderAt('/rw/tests/some-exam', { title: 'Mock test', backTo: 'tests' });
    const back = await screen.findByRole('link', { name: 'Back to mock tests' });
    expect(back).toHaveAttribute('href', '/rw/tests');
    expect(back).toHaveTextContent('Mock test');
  });

  it('the dark-mode toggle persists the choice (the html class itself is wired by SiteShell, see theme.test.tsx)', async () => {
    server();
    const user = userEvent.setup();
    renderAt('/rw/progress', { title: 'Dashboard' });
    const toggle = await screen.findByRole('button', { name: 'Dark mode' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(getStoredTheme()).toBeNull();
    await user.click(toggle);
    expect(getStoredTheme()).toBe('dark');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('the language button lists the offered languages and saves a choice to the account', async () => {
    const { calls } = server();
    const user = userEvent.setup();
    renderAt('/rw/progress', { title: 'Dashboard' });
    const langButton = await screen.findByRole('button', { name: /English/ });
    await user.click(langButton);
    const option = await screen.findByRole('menuitem', { name: 'Ikinyarwanda' });
    await user.click(option);
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.init?.method === 'PATCH');
    expect(JSON.parse(String(patch!.init!.body))).toEqual({ language: 'rw' });
  });

  it('the account chip links to /account with the first name', async () => {
    server();
    renderAt('/rw/progress', { title: 'Dashboard' });
    const chip = await screen.findByRole('link', { name: /Aline/ });
    expect(chip).toHaveAttribute('href', '/account');
  });
});
