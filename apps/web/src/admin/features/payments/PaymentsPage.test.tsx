import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { SUPPORT_PERMS, SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { PaymentDetailPage } from './PaymentDetailPage';
import { PaymentsPage } from './PaymentsPage';

afterEach(() => vi.unstubAllGlobals());

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p1', createdAt: '2026-11-01T10:00:00Z', user: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.com' }, countryCode: 'RW', provider: 'MTN_MOMO', providerLabel: 'MTN MoMo',
  msisdn: '+250789123456', amountMinor: 2000, priceLabel: 'RWF 2,000', status: 'PENDING', stuck: true, waitingMinutes: 42, accessUntil: null, failureReason: null, reference: 'MP1', actions: ['check', 'grant'], ...over,
});
const list = (results: unknown[]) => ({ total: results.length, page: 1, pageSize: 25, status: 'all', stuckAfterMinutes: 10, summary: { paidToday: [], successfulToday: 0, pendingNow: results.length, failedOrExpiredToday: 0 }, results });

type Handler = (url: string, init?: RequestInit) => { status?: number; body?: unknown } | undefined;
function setup(opts: { desktop?: boolean; perms?: typeof SYSTEM_PERMS; rows?: unknown[]; extra?: Handler } = {}) {
  stubViewport(opts.desktop ?? true);
  const api = mockFetch((url, init) => {
    const x = opts.extra?.(url, init);
    if (x) return x;
    if (url.startsWith('/api/admin/payments?')) return { body: list(opts.rows ?? [row()]) };
    if (url.startsWith('/api/admin/countries')) return { body: { countries: [], counts: {} } };
    if (url.startsWith('/api/admin/overview')) return { body: {} };
    return undefined;
  });
  const role = opts.perms === SUPPORT_PERMS ? 'SUPPORT' : 'SYSTEM_ADMIN';
  renderAdminRoutes([{ path: '/admin/payments', element: <ToastProvider><PaymentsPage /></ToastProvider> }], { route: '/admin/payments', me: admin(role, opts.perms ?? SYSTEM_PERMS) });
  return api;
}
const post = (api: ReturnType<typeof setup>, suffix: string) => api.calls.find((c) => c.init?.method === 'POST' && c.url.endsWith(suffix));

describe('the payments list', () => {
  it('shows a Stuck badge in words next to the status, desktop and phone', async () => {
    setup();
    const tr = (await screen.findByText('Aline Uwase')).closest('tr')!;
    expect(within(tr).getByText('Stuck')).toBeInTheDocument();
    expect(within(tr).getByText('Pending')).toBeInTheDocument();
  });

  it('phone card has the badge and a Details link', async () => {
    setup({ desktop: false });
    const card = (await screen.findByText('Aline Uwase')).closest('article')!;
    expect(within(card).getByText('Stuck')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Details of the payment by Aline Uwase/ })).toHaveAttribute('href', '/admin/payments/p1');
  });

  it('a payment that is not stuck has no badge', async () => {
    setup({ rows: [row({ stuck: false, actions: ['check'] })] });
    await screen.findByText('Aline Uwase');
    expect(screen.queryByText('Stuck')).toBeNull();
    expect(screen.queryByRole('button', { name: /Grant access manually/ })).toBeNull();
  });

  it('the time links to the payment detail', async () => {
    setup();
    expect(await screen.findByRole('link', { name: /Payment details, 1 Nov/ })).toHaveAttribute('href', '/admin/payments/p1');
  });

  it('an empty list says so and offers to clear the filters', async () => {
    setup({ rows: [] });
    await screen.findByText('No payments match.');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull(); // nothing is filtered
  });
});

describe('Check status shows the answer in a dialog (A4)', () => {
  it.each([
    ['PENDING', 'Still pending'],
    ['SUCCESSFUL', 'Approved: now paid'],
    ['DECLINED', 'Declined'],
    ['EXPIRED', 'Expired'],
  ])('%s', async (status, title) => {
    setup({ extra: (url, init) => (url.endsWith('/check') && init?.method === 'POST' ? { body: { id: 'p1', status, changed: status !== 'PENDING' } } : undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Check status' }));
    const dlg = await screen.findByRole('dialog', { name: 'Result of the check' });
    expect(within(dlg).getByText(title)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a failed check says so in a toast', async () => {
    setup({ extra: (url, init) => (url.endsWith('/check') && init?.method === 'POST' ? { status: 502, body: { error: 'provider_error' } } : undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Check status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side');
  });
});

describe('Grant access manually (A4)', () => {
  it('shows amount, method, payer number and age; needs a transaction ID and a reason', async () => {
    const api = setup({ extra: (url, init) => (url.endsWith('/manual-grant') && init?.method === 'POST' ? { status: 201, body: { id: 'p1', status: 'SUCCESSFUL', accessUntil: '2026-12-01T00:00:00Z' } } : undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Grant access manually to Aline Uwase' }));
    const dlg = await screen.findByRole('dialog', { name: 'Grant access manually' });
    for (const t of ['RWF 2,000', 'MTN MoMo', '078 912 3456', '42 min']) expect(within(dlg).getByText(t)).toBeInTheDocument();

    await userEvent.click(within(dlg).getByRole('button', { name: 'Grant access' }));
    expect(await within(dlg).findByText('Enter the provider transaction ID.')).toBeInTheDocument();
    expect(post(api, '/manual-grant')).toBeUndefined();

    await userEvent.type(within(dlg).getByLabelText('Provider transaction ID'), 'ab');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Grant access' }));
    expect(await within(dlg).findByText('The transaction ID has at least 4 characters.')).toBeInTheDocument();

    await userEvent.clear(within(dlg).getByLabelText('Provider transaction ID'));
    await userEvent.type(within(dlg).getByLabelText('Provider transaction ID'), 'MP261101.1000.X1');
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Callback never arrived');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Grant access' }));
    await waitFor(() => expect(post(api, '/manual-grant')).toBeDefined());
    expect(JSON.parse(String(post(api, '/manual-grant')!.init!.body))).toEqual({ transactionId: 'MP261101.1000.X1', reason: 'Callback never arrived' });
    expect(await screen.findByText('Access granted to Aline Uwase.')).toBeInTheDocument();
  });

  it.each([
    ['transaction_id_in_use', 'already used for another payment'],
    ['already_paid', 'already paid'],
    ['payment_declined', 'declined'],
    ['payment_not_eligible', 'cannot be granted by hand'],
  ])('says %s in words inside the dialog', async (code, words) => {
    setup({ extra: (url, init) => (url.endsWith('/manual-grant') && init?.method === 'POST' ? { status: 409, body: { error: code } } : undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Grant access manually to Aline Uwase' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText('Provider transaction ID'), 'MP261101.1000.X1');
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Callback never arrived');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Grant access' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent(words);
  });

  it('Support sees the button disabled with the explanation, and the dialog does not open', async () => {
    setup({ perms: SUPPORT_PERMS });
    const b = await screen.findByRole('button', { name: 'Grant access manually to Aline Uwase' });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Only a System admin can grant access by hand.')).toBeInTheDocument();
    await userEvent.click(b);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Check status' })).toBeInTheDocument(); // Support may still check
  });
});

describe('Export for accounting (A16)', () => {

  it('checks the dates, downloads, and reports the row count', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Export for accounting' }));
    const dlg = await screen.findByRole('dialog', { name: 'Export for accounting' });
    expect(within(dlg).getByLabelText('Format')).toHaveValue('csv');
    expect(within(dlg).getByLabelText('Status')).toHaveValue('paid');

    await userEvent.type(within(dlg).getByLabelText(/^From/), '2026-10-31');
    await userEvent.type(within(dlg).getByLabelText(/^To/), '2026-10-01');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Download CSV' }));
    expect(await within(dlg).findByText('The end date is before the start date.')).toBeInTheDocument();

    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      seen.push(String(url));
      return new Response('date,id\n2026-10-02,p1\n2026-10-03,p2\n', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="payments-oct.csv"' } });
    }));
    await userEvent.clear(within(dlg).getByLabelText(/^From/));
    await userEvent.type(within(dlg).getByLabelText(/^From/), '2026-10-01');
    await userEvent.clear(within(dlg).getByLabelText(/^To/));
    await userEvent.type(within(dlg).getByLabelText(/^To/), '2026-10-31');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Download CSV' }));
    expect(await within(dlg).findByText('Downloaded payments-oct.csv, 2 rows.')).toBeInTheDocument();
    expect(seen[0]).toBe('/api/admin/payments/export?from=2026-10-01&to=2026-10-31&status=paid');
  });

  it('shows the server refusal and offers to try again', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Export for accounting' }));
    const dlg = await screen.findByRole('dialog');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Download CSV' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Could not reach the server');
    expect(within(dlg).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('a country-restricted admin can only choose their country', async () => {
    stubViewport(true);
    mockFetch((url) => (url.startsWith('/api/admin/payments?') ? { body: list([]) } : url.startsWith('/api/admin/countries') ? { body: { countries: [], counts: {} } } : undefined));
    const me = { ...admin('SYSTEM_ADMIN', SYSTEM_PERMS), countryScope: ['RW'] };
    renderAdminRoutes([{ path: '/admin/payments', element: <PaymentsPage /> }], { route: '/admin/payments', me });
    await userEvent.click(await screen.findByRole('button', { name: 'Export for accounting' }));
    const country = within(await screen.findByRole('dialog')).getByLabelText('Country');
    expect(country).toHaveValue('RW');
    expect(within(country).queryByRole('option', { name: /All my countries/ })).toBeNull();
  });
});

describe('payment detail (A4)', () => {
  const detail = {
    payment: { id: 'p1', status: 'SUCCESSFUL', provider: 'MTN_MOMO', msisdn: '+250789123456', createdAt: '2026-11-01T10:00:00Z', expiresAt: '2026-11-01T10:03:00Z', confirmedAt: '2026-11-01T10:05:00Z', priceLabel: 'RWF 2,000', reference: 'MP1', transactionId: 'TX-99', failureReason: null, countryCode: 'RW', stuck: false, canCheck: false, canManualGrant: false, ageMinutes: 300 },
    user: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.com' },
    events: [{ id: 'e1', source: 'webhook', status: 'provider_success', at: '2026-11-01T10:05:00Z' }],
    grant: { id: 'g1', source: 'PAYMENT', startsAt: '2026-11-01T10:05:00Z', endsAt: '2026-12-01T10:05:00Z', grantedBy: null, reason: null },
  };
  it('shows the facts, the timeline and the grant; no actions on a paid payment', async () => {
    stubViewport(true);
    mockFetch((url) => (url === '/api/admin/payments/p1' ? { body: detail } : url.startsWith('/api/admin/payments?') ? { body: list([]) } : undefined));
    renderAdminRoutes([{ path: '/admin/payments/:id', element: <ToastProvider><PaymentDetailPage /></ToastProvider> }], { route: '/admin/payments/p1', me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });
    expect(await screen.findByRole('heading', { level: 2, name: 'Timeline' })).toBeInTheDocument();
    const list_ = screen.getByRole('list');
    expect(within(list_).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Payment request sent to MTN MoMo'),
      expect.stringContaining('The operator confirmed the payment'),
      expect.stringContaining('Full Access granted'),
    ]);
    expect(screen.getByText('TX-99')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aline Uwase' })).toHaveAttribute('href', '/admin/users/u1');
    expect(screen.queryByRole('button', { name: 'Check status' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grant access manually' })).toBeNull();
  });

  it('a stuck pending payment can be checked and granted', async () => {
    stubViewport(false);
    const stuck = { ...detail, payment: { ...detail.payment, status: 'PENDING', stuck: true, canCheck: true, canManualGrant: true, confirmedAt: null }, events: [], grant: null };
    mockFetch((url) => (url === '/api/admin/payments/p1' ? { body: stuck } : undefined));
    renderAdminRoutes([{ path: '/admin/payments/:id', element: <ToastProvider><PaymentDetailPage /></ToastProvider> }], { route: '/admin/payments/p1', me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });
    expect(await screen.findByText('Stuck')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check status' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant access manually' }));
    expect(await screen.findByRole('dialog', { name: 'Grant access manually' })).toBeInTheDocument();
  });
});
