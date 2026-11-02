import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_PERMS, SYSTEM_PERMS } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { RequireAdmin, RequirePermission, safeNext } from './session';

afterEach(() => vi.unstubAllGlobals());

function renderApp(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <p>sign-in page</p> },
      {
        element: <RequireAdmin />,
        children: [
          { path: '/', element: <p>overview page</p> },
          { element: <RequirePermission permission="users:read" />, children: [{ path: '/users', element: <p>users page</p> }] },
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

const me = (permissions: string[]) => ({ admin: { id: 'a', name: 'Marie C.', role: 'CONTENT_EDITOR', permissions, countryScope: ['RW'] } });

describe('the admin session guard', () => {
  it('no session (401): goes to sign-in and remembers where it was going', async () => {
    mockFetch((url) => (url.endsWith('/auth/me') ? { status: 401, body: { error: 'admin_sign_in_required' } } : undefined));
    const router = renderApp('/users?filter=expired');
    expect(await screen.findByText('sign-in page')).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe(`/sign-in?next=${encodeURIComponent('/users?filter=expired')}`);
  });

  it('the Overview needs no next', async () => {
    mockFetch(() => ({ status: 401, body: { error: 'admin_sign_in_required' } }));
    const router = renderApp('/');
    await screen.findByText('sign-in page');
    expect(router.state.location.search).toBe('');
  });

  it('a signed-in admin sees the page', async () => {
    mockFetch(() => ({ body: me(SYSTEM_PERMS) }));
    renderApp('/users');
    expect(await screen.findByText('users page')).toBeInTheDocument();
  });

  it('a page the role has no permission for goes to the first allowed page', async () => {
    mockFetch(() => ({ body: me(EDITOR_PERMS) }));
    const router = renderApp('/users');
    expect(await screen.findByText('overview page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('a server error shows a retry, not a sign-in', async () => {
    mockFetch(() => ({ status: 500, body: { error: 'internal_error' } }));
    renderApp('/users');
    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })).toBeInTheDocument(); // after its one retry
  });
});

describe('?next=', () => {
  it('only same-site paths are followed', () => {
    expect(safeNext('/users?filter=expired')).toBe('/users?filter=expired');
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('/sign-in')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
