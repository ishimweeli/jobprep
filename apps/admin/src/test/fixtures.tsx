import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { vi } from 'vitest';
import type { AdminMe, Permission } from '../api/types';
import { AdminProvider } from '../features/auth/session';

export const SYSTEM_PERMS: Permission[] = ['overview:read', 'users:read', 'users:manage', 'otp:resend', 'exams:read', 'exams:write', 'reports:resolve', 'payments:read', 'payments:check', 'payments:grant', 'countries:read', 'countries:write', 'settings:write', 'audit:read', 'admins:manage'];
export const EDITOR_PERMS: Permission[] = ['overview:read', 'exams:read', 'exams:write', 'reports:resolve'];
export const SUPPORT_PERMS: Permission[] = ['overview:read', 'users:read', 'otp:resend', 'payments:read', 'payments:check'];

export const admin = (role: AdminMe['role'], permissions: Permission[], name = 'Jean Bosco N.'): AdminMe => ({ id: 'a1', name, role, permissions, countryScope: [] });

/** Makes `matchMedia` answer for a desktop (>= 900px) or a phone screen. */
export function stubViewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop && query.includes('min-width'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** Renders routes inside the providers the app has (query client, data router) and a signed-in admin. */
export function renderAdminRoutes(routes: RouteObject[], { route, me }: { route: string; me: AdminMe }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createMemoryRouter(routes.map((r) => ({ ...r, element: <AdminProvider admin={me}>{r.element}</AdminProvider> })), { initialEntries: [route] });
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router };
}
