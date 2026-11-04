import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_PERMS, SYSTEM_PERMS, admin } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { RequireAdmin, RequirePermission } from './session';

afterEach(() => vi.unstubAllGlobals());

function renderApp(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <p>sign-in page</p> },
      {
        path: '/admin',
        element: <RequireAdmin />,
        children: [
          { index: true, element: <p>overview page</p> },
          { element: <RequirePermission permission="users:read" />, children: [{ path: 'users', element: <p>users page</p> }] },
        ],
      },
    ],
    { initialEntries: [route] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const meBody = (perms: Parameters<typeof admin>[1]) => admin('CONTENT_EDITOR', perms, 'Marie C.');
const where = (r: ReturnType<typeof renderApp>) => r.state.location.pathname + r.state.location.search;

describe('the admin session guard (normal session + an admin role)', () => {
  it('no session (401 admin_sign_in_required): the normal sign-in, remembering where it was going', async () => {
    localStorage.setItem('jobprep.session', '1');
    mockFetch(() => ({ status: 401, body: { error: 'admin_sign_in_required' } }));
    const router = renderApp('/admin/users?filter=expired');
    expect(await screen.findByText('sign-in page')).toBeInTheDocument();
    expect(where(router)).toBe(`/sign-in?next=${encodeURIComponent('/admin/users?filter=expired')}`);
    // the browser forgets that it was signed in, so the sign-in screen does not bounce back
    expect(localStorage.getItem('jobprep.session')).toBeNull();
  });

  it('the Overview comes back to /admin', async () => {
    mockFetch(() => ({ status: 401, body: { error: 'admin_sign_in_required' } }));
    const router = renderApp('/admin');
    await screen.findByText('sign-in page');
    expect(where(router)).toBe(`/sign-in?next=${encodeURIComponent('/admin')}`);
  });

  it('a session more than 12 hours old (401 admin_session_stale): sign-in again, with the reason and the way back; the session hint stays', async () => {
    localStorage.setItem('jobprep.session', '1');
    mockFetch(() => ({ status: 401, body: { error: 'admin_session_stale' } }));
    const router = renderApp('/admin/users');
    await screen.findByText('sign-in page');
    expect(where(router)).toBe(`/sign-in?next=${encodeURIComponent('/admin/users')}&reason=admin_stale`);
    expect(localStorage.getItem('jobprep.session')).toBe('1');
  });

  it('signed in without a role (403 admin_forbidden): the no-access page, no redirect', async () => {
    mockFetch((url) => (url === '/api/admin/me' ? { status: 403, body: { error: 'admin_forbidden' } } : { body: { countries: [] } }));
    const router = renderApp('/admin/users');
    expect(await screen.findByRole('heading', { level: 1, name: 'You don’t have access to the admin area' })).toBeInTheDocument();
    expect(where(router)).toBe('/admin/users');
  });

  it('a signed-in admin sees the page', async () => {
    mockFetch(() => ({ body: meBody(SYSTEM_PERMS) }));
    renderApp('/admin/users');
    expect(await screen.findByText('users page')).toBeInTheDocument();
  });

  it('the principal may also come wrapped as { admin }', async () => {
    mockFetch(() => ({ body: { admin: meBody(SYSTEM_PERMS) } }));
    renderApp('/admin/users');
    await waitFor(() => expect(screen.getByText('users page')).toBeInTheDocument());
  });

  it('a page the role has no permission for says so (no silent redirect) and offers the first allowed page', async () => {
    mockFetch((url) => (url.startsWith('/api/admin/me') ? { body: meBody(EDITOR_PERMS) } : { body: { summary: { pendingNow: 0 }, results: [] } }));
    const router = renderApp('/admin/users');
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/users');
    expect(screen.getByRole('link', { name: 'Go to Overview' })).toHaveAttribute('href', '/admin');
  });

  it('a server error shows a retry, not a sign-in', async () => {
    mockFetch(() => ({ status: 500, body: { error: 'internal_error' } }));
    renderApp('/admin/users');
    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })).toBeInTheDocument(); // after its one retry
  });
});
