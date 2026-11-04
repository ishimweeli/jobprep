import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPPORT_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { CandidateViewPage, candidateAccessLine } from './CandidateViewPage';

afterEach(() => vi.unstubAllGlobals());

const view = {
  readOnly: true,
  user: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.com', countryCode: 'RW' },
  country: { code: 'RW', name: 'Rwanda' },
  access: { state: 'active', endsAt: '2026-11-24T10:00:00Z', daysLeft: 20, expiredAt: null },
  dashboard: {
    goal: { categoryId: 'c1', slug: 'teachers', name: 'Teacher recruitment' }, resume: null,
    recommended: { topicName: 'Statistics', percent: 40, questionCount: 8 },
    scoreHistory: [],
    topics: { strong: [{ topicId: 't1', name: 'Pedagogy', percent: 90 }], needsWork: [{ topicId: 't2', name: 'Statistics', percent: 40 }] },
    recentlyCompleted: [{ attemptId: 'a1', kind: 'FULL', title: 'Sec. Mathematics — Mock 1', submittedAt: '2026-11-01T10:00:00Z', attemptNumber: 1, percent: 72 }],
    access: { current: { endsAt: '2026-11-24T10:00:00Z', daysLeft: 20, endingSoon: false }, expired: null, otherCountries: [] },
    hasActivity: true, pendingPayment: null,
  },
  attempts: [{ id: 'a1', kind: 'FULL', title: 'Sec. Mathematics — Mock 1', status: 'SUBMITTED', percent: 72, submittedAt: '2026-11-01T10:00:00Z' }],
  payments: [{ id: 'p1', createdAt: '2026-10-25T10:00:00Z', status: 'SUCCESSFUL', providerLabel: 'MTN MoMo', priceLabel: 'RWF 2,000', amountMinor: 2000, currencyCode: 'RWF', countryCode: 'RW', transactionId: 'TX-1', accessUntil: '2026-11-24T10:00:00Z' }],
};

function setup(body: unknown = view, status = 200) {
  stubViewport(true);
  mockFetch((url) => (url === '/api/admin/users/u1/candidate-view' ? { status, body } : undefined));
  renderAdminRoutes([{ path: '/admin/users/:id/view', element: <CandidateViewPage /> }], { route: '/admin/users/u1/view', me: admin('SUPPORT', SUPPORT_PERMS) });
}

describe('View as candidate (A5)', () => {
  it('has a read-only banner with Exit back to the user, and shows what the person sees', async () => {
    setup();
    expect(await screen.findByText('Viewing as Aline Uwase — read only')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exit' })).toHaveAttribute('href', '/admin/users/u1');
    expect(screen.getByText('Full Access · 20 days left, until 24 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('Teacher recruitment')).toBeInTheDocument();
    const att = screen.getByRole('heading', { name: 'Attempts' }).closest('section')!;
    expect(within(att).getByText('Sec. Mathematics — Mock 1')).toBeInTheDocument();
    expect(within(att).getByText('72%')).toBeInTheDocument();
    expect(screen.getByText(/TX-1/)).toBeInTheDocument();
    expect(screen.getByText(/recorded in the audit log/)).toBeInTheDocument();
  });

  it('has nothing that acts as the person: no buttons, and no links but Exit and the shell navigation', async () => {
    setup();
    await screen.findByText('Viewing as Aline Uwase — read only');
    const main = screen.getByRole('main');
    expect(within(main).queryAllByRole('button')).toHaveLength(0);
    expect(within(main).getAllByRole('link').map((l) => l.textContent)).toEqual(['Exit']);
  });

  it('says 404 in words when the person is not in the admin’s countries', async () => {
    setup({ error: 'user_not_found' }, 404);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('the access line', () => {
  it('reads current, expired, suspended and free', () => {
    expect(candidateAccessLine({ access: null, dashboard: { access: { current: { endsAt: '2026-11-24T10:00:00Z', daysLeft: 1, endingSoon: true }, expired: null, otherCountries: [] } } as never })).toBe('Full Access · 1 day left, until 24 Nov 2026 (ending soon)');
    expect(candidateAccessLine({ access: null, dashboard: { access: { current: null, expired: { endedAt: '2026-10-01T10:00:00Z' }, otherCountries: [] } } as never })).toBe('No Full Access · it ended 1 Oct 2026');
    expect(candidateAccessLine({ access: { state: 'suspended' }, dashboard: null })).toBe('Account suspended');
    expect(candidateAccessLine({ access: { state: 'free' }, dashboard: null })).toBe('Free: no Full Access yet');
  });
});
