import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { getStoredTheme } from '../../lib/theme';
import { PhoneTopBar } from './PhoneTopBar';
import type { RouteHandle } from './SiteLayout';

const rwanda = { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true };

function renderAt(route: string, handle: RouteHandle) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createMemoryRouter(
    [
      {
        path: '/:country',
        children: [
          { path: 'tests', handle, element: <PhoneTopBar /> },
          { path: 'progress', handle, element: <PhoneTopBar /> },
          { path: 'pricing', handle: { title: 'Pricing' }, element: <PhoneTopBar /> },
        ],
      },
    ],
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
    if (url === '/api/attempts/in-progress') return { body: { attempts: [] } };
    if (url === '/api/auth/sign-out' && init?.method === 'POST') return { status: 204 };
    if (url === '/api/me') return { body: testSession() };
    return undefined;
  });
}

beforeEach(() => localStorage.setItem('jobprep.session', '1'));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem('jobprep.session');
  localStorage.removeItem('jobprep.theme');
  document.documentElement.classList.remove('dark');
});

describe('PhoneTopBar + PhoneMenu (the hamburger drawer that replaces the bottom tab bar)', () => {
  it('the 56px header has a hamburger, the page title, and an avatar linking to /account', async () => {
    server();
    renderAt('/rw/progress', { title: 'Dashboard' });
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /account: Aline Uwase/ })).toHaveAttribute('href', '/account');
  });

  it('opens the drawer with the same nav items as the desktop sidebar, plus Settings and Sign out', async () => {
    server();
    const user = userEvent.setup();
    renderAt('/rw/tests', { title: 'Mock tests' });
    await screen.findByText('Mock tests');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    expect(dialog).toHaveTextContent('Dashboard');
    expect(dialog).toHaveTextContent('Pricing');
    expect(dialog).toHaveTextContent('Account');
    expect(dialog).toHaveTextContent('Help and support');
    expect(dialog).toHaveTextContent('Settings');
    expect(dialog).toHaveTextContent('Dark mode');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    server();
    const user = userEvent.setup();
    renderAt('/rw/tests', { title: 'Mock tests' });
    await user.click(await screen.findByRole('button', { name: 'Open menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    await user.keyboard('{Escape}');
    expect(dialog).not.toBeInTheDocument();
  });

  it('closes on a backdrop tap', async () => {
    server();
    const user = userEvent.setup();
    renderAt('/rw/tests', { title: 'Mock tests' });
    await user.click(await screen.findByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog', { name: 'Menu' });
    await user.click(screen.getByTestId('phone-menu-overlay'));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('closes on the X button', async () => {
    server();
    const user = userEvent.setup();
    renderAt('/rw/tests', { title: 'Mock tests' });
    await user.click(await screen.findByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog', { name: 'Menu' });
    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('closes when navigating to a new route', async () => {
    server();
    const user = userEvent.setup();
    renderAt('/rw/tests', { title: 'Mock tests' });
    await user.click(await screen.findByRole('button', { name: 'Open menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    await user.click(screen.getByRole('link', { name: /Pricing/ }));
    expect(dialog).not.toBeInTheDocument();
    expect(await screen.findByText('Pricing')).toBeInTheDocument();
  });

  it('the dark-mode row persists the same theme store the top bar\'s toggle uses', async () => {
    server();
    const user = userEvent.setup();
    renderAt('/rw/tests', { title: 'Mock tests' });
    await user.click(await screen.findByRole('button', { name: 'Open menu' }));
    expect(getStoredTheme()).toBeNull();
    await user.click(screen.getByRole('button', { name: /Dark mode/ }));
    expect(getStoredTheme()).toBe('dark');
  });
});
