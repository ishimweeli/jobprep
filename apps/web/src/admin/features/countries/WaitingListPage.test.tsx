import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { WaitingListPage } from './WaitingListPage';

afterEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

const countries = [
  { code: 'RW', name: 'Rwanda', status: 'LIVE', count: 0, notified: 0 },
  { code: 'KE', name: 'Kenya', status: 'PREPARING', count: 12, notified: 0 },
  { code: 'UG', name: 'Uganda', status: 'LIVE', count: 5, notified: 2 },
];
const entries = [{ id: 'w1', email: 'amina@example.com', interest: 'Teacher recruitment', createdAt: '2026-10-30T10:00:00Z', notifiedAt: null }];

function setup(route: string, phone = false) {
  stubViewport(!phone);
  const api = mockFetch((url, init) => {
    if (url === '/api/admin/demand/waiting-list/notify' && init?.method === 'POST') return { body: { ok: true, notified: 3 } };
    if (url.startsWith('/api/admin/demand/waiting-list/export')) return { body: {}, headers: { 'Content-Disposition': 'attachment; filename="waiting-list-ke.csv"' } };
    if (url.startsWith('/api/admin/demand/waiting-list')) {
      const c = new URL(url, 'http://x').searchParams.get('country');
      return { body: { countries, total: c ? 1 : 0, ...(c ? { entries } : {}) } };
    }
    return undefined;
  });
  const r = renderAdminRoutes([{ path: '/admin/countries/waiting-list', element: <WaitingListPage /> }], { route, me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });
  return { api, ...r };
}

describe('Waiting list', () => {
  it('shows each country with its count and status; choosing one shows the people', async () => {
    const { router } = setup('/admin/countries/waiting-list');
    expect(await screen.findByText('12 people waiting')).toBeInTheDocument();
    expect(screen.getByText('5 people waiting · 2 told')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('region', { name: 'Countries with a waiting list' })).getByRole('button', { name: /Kenya/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?country=KE'));
    expect(await screen.findByText('amina@example.com')).toBeInTheDocument();
    expect(screen.getByText('Teacher recruitment')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
  });

  it('"Tell them it is open" is disabled with the reason while the country is not Live', async () => {
    setup('/admin/countries/waiting-list?country=KE');
    const tell = await screen.findByRole('button', { name: 'Tell them it is open' });
    expect(tell).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Only when Kenya is Live/)).toBeInTheDocument();
  });

  it('a Live country: asks for a reason, then sends and closes', async () => {
    const { api } = setup('/admin/countries/waiting-list?country=UG');
    await userEvent.click(await screen.findByRole('button', { name: 'Tell them it is open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tell the Uganda waiting list' });
    expect(within(dialog).getByText(/\(3\)/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send emails' }));
    expect(within(dialog).getByText(/Write a reason/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Uganda opened today');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send emails' }));
    await waitFor(() => expect(api.calls.some((c) => c.url.endsWith('/notify'))).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.url.endsWith('/notify'))!.init!.body))).toEqual({ countryCode: 'UG', reason: 'Uganda opened today' });
  });

  it('export downloads the CSV and says what was saved', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { api } = setup('/admin/countries/waiting-list?country=KE');
    await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText('Downloaded waiting-list-ke.csv')).toBeInTheDocument();
    expect(api.calls.some((c) => c.url === '/api/admin/demand/waiting-list/export?country=KE')).toBe(true);
  });

  it('phone: a card per country and the list below', async () => {
    setup('/admin/countries/waiting-list?country=KE', true);
    expect(await screen.findByText('amina@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Uganda/ })).toBeInTheDocument();
  });
});
