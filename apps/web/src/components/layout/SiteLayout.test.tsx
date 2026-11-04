import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { CountryLayout } from './SiteLayout';

const rwanda = { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true };

/**
 * A router shaped like the real `/:country` block in routes.tsx (index = landing, `tests` = the catalog), with
 * stub pages: the two tests here care only about which one CountryLayout renders, not their real content.
 */
function renderAt(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createMemoryRouter(
    [
      {
        path: '/:country',
        element: <CountryLayout />,
        children: [
          { index: true, handle: { landing: true, tabs: true }, element: <div>LANDING PAGE</div> },
          { path: 'tests', handle: { tabs: true }, element: <div>MOCK TESTS</div> },
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

afterEach(() => vi.unstubAllGlobals());

describe("CountryLayout: a signed-in visitor's home is Mock tests, not the marketing landing page", () => {
  beforeEach(() => {
    mockFetch((url) => {
      if (url === '/api/countries') return { body: { countries: [rwanda] } };
      if (url === '/api/me') return { body: testSession() };
      return undefined;
    });
  });

  it('a signed-out visitor at /rw still sees the landing page', async () => {
    localStorage.removeItem('jobprep.session'); // no hint: getSession() never even calls /api/me
    renderAt('/rw');
    expect(await screen.findByText('LANDING PAGE')).toBeInTheDocument();
    expect(screen.queryByText('MOCK TESTS')).not.toBeInTheDocument();
  });

  it('a signed-in user at /rw is sent straight to /rw/tests', async () => {
    localStorage.setItem('jobprep.session', '1');
    renderAt('/rw');
    expect(await screen.findByText('MOCK TESTS')).toBeInTheDocument();
    expect(screen.queryByText('LANDING PAGE')).not.toBeInTheDocument();
  });

  it('a signed-in user who goes straight to /rw/tests sees it directly (no redirect loop)', async () => {
    localStorage.setItem('jobprep.session', '1');
    renderAt('/rw/tests');
    expect(await screen.findByText('MOCK TESTS')).toBeInTheDocument();
  });
});
