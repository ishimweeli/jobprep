import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  // A data router (as in the app) so `useMatches` and route `handle`s work; `ui` may contain its own <Routes>.
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [route] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

type Handler = (url: string, init?: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string> } | undefined;

/** Stubs global fetch with a JSON router; unmatched requests fail the test loudly. */
export function mockFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const r = handler(url, init);
    if (!r) throw new Error(`Unexpected fetch ${init?.method ?? 'GET'} ${url}`);
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(r.body ?? {}), { status, headers: r.headers });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}
