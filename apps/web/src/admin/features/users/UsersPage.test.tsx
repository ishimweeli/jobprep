import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { UsersPage } from './UsersPage';

afterEach(() => vi.unstubAllGlobals());

const user = (id: string, name: string, state: 'active' | 'free' | 'expired' | 'suspended') => ({
  id, name, email: 'aline@example.com', countryCode: 'RW', goal: 'Accountant', testsTaken: 2, lastActiveAt: '2026-10-29T10:00:00Z', joinedAt: '2026-10-01T10:00:00Z', status: 'ACTIVE',
  access: { state, endsAt: null, daysLeft: null, expiredAt: null },
});
const overview = { asOf: '2026-11-01T10:00:00Z', kpis: { registeredUsers: 4218, fullAccessActive: 612 } };

function setup(route: string, desktop = true) {
  stubViewport(desktop);
  const api = mockFetch((url) => {
    if (url.startsWith('/api/admin/overview')) return { body: overview };
    if (url.startsWith('/api/admin/payments')) return { body: { summary: { pendingNow: 0 }, results: [] } };
    if (url.startsWith('/api/admin/users?')) {
      const f = new URL(url, 'http://x').searchParams.get('filter');
      return { body: { total: f === 'expired' ? 1 : 2, page: 1, pageSize: 25, filter: f, results: f === 'expired' ? [user('u3', 'Jean Claude Mugisha', 'expired')] : [user('u1', 'Aline Uwase', 'active'), user('u2', 'Eric Habimana', 'free')] } };
    }
    if (url.startsWith('/api/admin/users/')) {
      return { body: { user: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.com', countryCode: 'RW', joinedAt: '2026-10-17T10:00:00Z', lastSeenAt: null, status: 'ACTIVE', suspendedReason: null, goal: null, language: 'en' }, access: { state: 'active', endsAt: '2026-11-24T10:00:00Z', daysLeft: 23, expiredAt: null, pendingPaymentSince: null, lastPaymentFailed: false }, attempts: [{ id: 'a1', kind: 'FULL', title: 'Sec. Mathematics — Mock 1', submittedAt: '2026-11-01T10:00:00Z', percent: 72, attemptNumber: 2 }], payments: [{ id: 'p1', createdAt: '2026-10-25T10:00:00Z', status: 'SUCCESSFUL', provider: 'MTN_MOMO', providerLabel: 'MTN MoMo', priceLabel: 'RWF 2,000', reference: 'MP261025.1840.A10' }], adminHistory: [] } };
    }
    return undefined;
  });
  const r = renderAdminRoutes([{ path: '/admin/users', element: <UsersPage /> }, { path: '/admin/users/:id', element: <UsersPage /> }], { route, me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });
  return { api, ...r };
}

describe('Users: filters live in the query string', () => {
  it('opens already filtered from the URL', async () => {
    const { api } = setup('/admin/users?filter=expired');
    expect(await screen.findByText('Jean Claude Mugisha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expired' })).toHaveAttribute('aria-pressed', 'true');
    expect(api.calls.some((c) => c.url.includes('/users?') && c.url.includes('filter=expired'))).toBe(true);
  });

  it('clicking a chip changes the URL and the request; All clears it', async () => {
    const { router } = setup('/admin/users');
    expect(await screen.findByText('Aline Uwase')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expired' }));
    await waitFor(() => expect(router.state.location.search).toBe('?filter=expired'));
    expect(await screen.findByText('Jean Claude Mugisha')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('typing in the search box puts q in the URL after a pause', async () => {
    const { router } = setup('/admin/users');
    await screen.findByText('Aline Uwase');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name or email' }), 'alin');
    await waitFor(() => expect(router.state.location.search).toBe('?q=alin'), { timeout: 2000 });
  });

  it('chips and header numbers as drawn: five chips, candidates and Full Access counts', async () => {
    setup('/admin/users');
    expect(await screen.findByText('4,218 candidates · 612 with Full Access')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: undefined }).map((b) => b.textContent)).toEqual(expect.arrayContaining(['All', 'Full Access', 'Free only', 'Expired', 'Suspended']));
  });

  it('the detail panel shows access, attempts with "attempt 2", payments with the reference, and inert actions', async () => {
    setup('/admin/users');
    expect(await screen.findByText('23 days left · until 24 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('1 Nov · attempt 2')).toBeInTheDocument();
    expect(screen.getByText(/MP261025\.1840\.A10/)).toBeInTheDocument();
    const grant = screen.getByRole('button', { name: 'Grant / extend 30 days' });
    expect(grant).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Access changes ask for a reason and are recorded in the audit log.')).toBeInTheDocument();
  });

  it('phone: the list shows "N users · showing latest" and cards link to the user page', async () => {
    setup('/admin/users', false);
    expect(await screen.findByText('4,218 users · showing latest'.replace('4,218', '2'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Aline Uwase/ })).toHaveAttribute('href', '/admin/users/u1');
  });
});
