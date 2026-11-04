import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { SUPPORT_PERMS, SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { UserDetailView } from './UserDetail';

afterEach(() => vi.unstubAllGlobals());

const detail = (over: { status?: 'ACTIVE' | 'SUSPENDED'; reason?: string | null } = {}) => ({
  user: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.com', countryCode: 'RW', joinedAt: '2026-10-17T10:00:00Z', lastSeenAt: null, status: over.status ?? 'ACTIVE', suspendedReason: over.reason ?? null, goal: null, language: 'en' },
  access: { state: over.status === 'SUSPENDED' ? 'suspended' : 'active', endsAt: '2026-11-24T10:00:00Z', daysLeft: 20, expiredAt: null, pendingPaymentSince: null, lastPaymentFailed: false },
  attempts: [], payments: [],
  adminHistory: over.status === 'SUSPENDED' ? [{ id: 'h1', action: 'user.suspend', actor: 'Jean Bosco N.', reason: 'abuse', at: '2026-11-02T10:00:00Z' }] : [],
});

type Handler = (url: string, init?: RequestInit) => { status?: number; body?: unknown } | undefined;

function setup(opts: { desktop?: boolean; perms?: typeof SYSTEM_PERMS; user?: ReturnType<typeof detail>; extra?: Handler } = {}) {
  stubViewport(opts.desktop ?? true);
  const api = mockFetch((url, init) => {
    const extra = opts.extra?.(url, init);
    if (extra) return extra;
    if (url.startsWith('/api/admin/users/u1/access-preview')) return { body: { days: 30, startsAt: '2026-11-04T10:00:00Z', endsAt: '2026-12-04T10:00:00Z', currentEndsAt: null } };
    if (url === '/api/admin/users/u1' && init?.method === 'GET') return { body: opts.user ?? detail() };
    if (url.startsWith('/api/admin/users')) return { body: { total: 0, results: [] } };
    if (url.startsWith('/api/admin/overview')) return { body: {} };
    return undefined;
  });
  const role = opts.perms === SUPPORT_PERMS ? 'SUPPORT' : 'SYSTEM_ADMIN';
  renderAdminRoutes([{ path: '/', element: <ToastProvider><UserDetailView id="u1" phone={!(opts.desktop ?? true)} /></ToastProvider> }], { route: '/', me: admin(role, opts.perms ?? SYSTEM_PERMS) });
  return api;
}

const post = (api: ReturnType<typeof setup>, suffix: string) => api.calls.find((c) => c.init?.method === 'POST' && c.url.endsWith(suffix));

describe('grant or extend access (A2)', () => {
  it('asks for a reason, shows when the access will run until, sends the grant and says so', async () => {
    const api = setup({ extra: (url, init) => (url.endsWith('/users/u1/access') && init?.method === 'POST' ? { status: 201, body: { grantId: 'g1', endsAt: '2026-12-04T10:00:00Z', access: {} } } : undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Grant / extend 30 days' }));
    const dlg = await screen.findByRole('dialog', { name: /Grant or extend Full Access for Aline Uwase/ });
    expect(await within(dlg).findByText('Access will run until 4 Dec 2026')).toBeInTheDocument();
    expect(within(dlg).getByLabelText('Country')).toHaveValue('RW');
    expect(within(dlg).getByLabelText('Days')).toHaveValue(30);
    expect(within(dlg).getByText(/recorded in the audit log/)).toBeInTheDocument();

    await userEvent.click(within(dlg).getByRole('button', { name: 'Grant access' }));
    expect(await within(dlg).findByText('Write a reason. It is recorded in the audit log.')).toBeInTheDocument();
    expect(post(api, '/access')).toBeUndefined();

    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Payment problem, confirmed');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Grant access' }));
    await waitFor(() => expect(post(api, '/access')).toBeDefined());
    expect(JSON.parse(String(post(api, '/access')!.init!.body))).toEqual({ days: 30, countryCode: 'RW', reason: 'Payment problem, confirmed' });
    expect(await screen.findByText('Full Access for Aline Uwase now runs until 4 Dec 2026.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('falls back to a plain sentence when the preview fails, blocks bad days, and shows an API error inside the dialog', async () => {
    setup({
      extra: (url, init) => {
        if (url.includes('/access-preview')) return { status: 500, body: { error: 'internal_error' } };
        if (url.endsWith('/users/u1/access') && init?.method === 'POST') return { status: 409, body: { error: 'no_plan_for_country' } };
        return undefined;
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Grant / extend 30 days' }));
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByText('Access will run for 30 days, added after any access they still have.')).toBeInTheDocument();
    await userEvent.clear(within(dlg).getByLabelText('Days'));
    await userEvent.type(within(dlg).getByLabelText('Days'), '400');
    expect(within(dlg).getByText('Enter a whole number of days from 1 to 365.')).toBeInTheDocument();
    await userEvent.clear(within(dlg).getByLabelText('Days'));
    await userEvent.type(within(dlg).getByLabelText('Days'), '10');
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Goodwill for a failed payment');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Grant access' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('There is no Full Access plan for that country yet');
    expect(within(dlg).getByLabelText('Reason')).toHaveValue('Goodwill for a failed payment'); // kept
  });

  it('closes with Escape', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Grant / extend 30 days' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('suspend and un-suspend (A3)', () => {
  it('says what will happen, needs a reason, confirms in the destructive style and posts it', async () => {
    const api = setup({ extra: (url, init) => (url.endsWith('/suspend') && init?.method === 'POST' ? { body: { ok: true } } : undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));
    const dlg = await screen.findByRole('dialog', { name: 'Suspend Aline Uwase?' });
    expect(within(dlg).getByText('They will be signed out everywhere and cannot sign in.')).toBeInTheDocument();
    const confirm = within(dlg).getByRole('button', { name: 'Suspend account' });
    expect(confirm.className).toContain('bg-incorrect');
    await userEvent.click(confirm);
    expect(await within(dlg).findByText('Write a reason. It is recorded in the audit log.')).toBeInTheDocument();
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Shared the account');
    await userEvent.click(confirm);
    await waitFor(() => expect(post(api, '/suspend')).toBeDefined());
    expect(JSON.parse(String(post(api, '/suspend')!.init!.body))).toEqual({ reason: 'Shared the account' });
    expect(await screen.findByText('Aline Uwase is suspended.')).toBeInTheDocument();
  });

  it('names the conflicts in words', async () => {
    setup({ extra: (url, init) => (url.endsWith('/suspend') && init?.method === 'POST' ? { status: 409, body: { error: 'last_system_admin' } } : undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Testing the guard');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Suspend account' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('last active System admin');
  });

  it('a suspended account shows a banner with the reason and an Un-suspend button that posts a reason', async () => {
    const api = setup({ user: detail({ status: 'SUSPENDED', reason: 'abuse' }), extra: (url, init) => (url.endsWith('/unsuspend') && init?.method === 'POST' ? { body: { ok: true } } : undefined) });
    expect(await screen.findByText('This account is suspended since 2 Nov')).toBeInTheDocument();
    expect(screen.getByText(/Reason: abuse\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend account' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Un-suspend account' }));
    const dlg = await screen.findByRole('dialog', { name: 'Un-suspend Aline Uwase?' });
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Resolved with the person');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Un-suspend account' }));
    await waitFor(() => expect(post(api, '/unsuspend')).toBeDefined());
    expect(await screen.findByText('Aline Uwase can sign in again.')).toBeInTheDocument();
  });
});

describe('password reset (A5)', () => {
  it('confirms who gets the email, asks no reason, and reports the result', async () => {
    const api = setup({ extra: (url, init) => (url.endsWith('/send-password-reset') && init?.method === 'POST' ? { body: { cooldownSeconds: 45, expiresInSeconds: 3600 } } : undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Send password reset' }));
    const dlg = await screen.findByRole('dialog', { name: 'Send a password reset email?' });
    expect(within(dlg).getByText('aline@example.com')).toBeInTheDocument();
    expect(within(dlg).queryByLabelText('Reason')).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send email' }));
    await waitFor(() => expect(post(api, '/send-password-reset')).toBeDefined());
    expect(await screen.findByText(/Reset email sent to aline@example.com\. The link works for 60 minutes\. Another can be sent in 45 s\./)).toBeInTheDocument();
  });

  it('says how long to wait when it is too soon', async () => {
    setup({ extra: (url, init) => (url.endsWith('/send-password-reset') && init?.method === 'POST' ? { status: 429, body: { error: 'otp_cooldown', retryAfterSeconds: 37 } } : undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Send password reset' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Send email' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Wait 37 seconds');
  });

  it('is disabled with the reason for a suspended account', async () => {
    setup({ user: detail({ status: 'SUSPENDED', reason: 'abuse' }) });
    const b = await screen.findByRole('button', { name: 'Send password reset' });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('A suspended account cannot get an email. Un-suspend it first.')).toBeInTheDocument();
  });
});

describe('roles that may not (A17)', () => {
  it('Support sees grant and suspend disabled with the reason, and can still send a reset and view the candidate', async () => {
    setup({ perms: SUPPORT_PERMS });
    const grant = await screen.findByRole('button', { name: 'Grant / extend 30 days' });
    expect(grant).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Only a System admin can change access or suspend accounts.').length).toBe(2);
    await userEvent.click(grant);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Send password reset' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('link', { name: 'View as candidate' })).toBeInTheDocument();
  });
});
