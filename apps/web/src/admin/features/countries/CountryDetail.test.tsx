import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CountryDetailX } from '../../api/governance';
import { EDITOR_PERMS, SUPPORT_PERMS, SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { CountryDetailPanel } from './CountryDetail';

afterEach(() => vi.unstubAllGlobals());

const detail = (over: Partial<CountryDetailX['country']> = {}, checklistOk = false): CountryDetailX => ({
  country: { code: 'KE', name: 'Kenya', status: 'PREPARING', currencyCode: 'KES', dialCode: '+254', slug: 'ke', url: 'jobprep.nexvecta.com/ke', disclaimer: 'JobPrep is independent of the exam bodies.', users: 0, mockTests: 3, waitingList: 12, ...over },
  plan: { priceMinor: null, priceLabel: null, durationDays: 30, autoRenew: false },
  paymentMethods: [{ provider: 'MPESA', label: 'M-Pesa', mode: 'SANDBOX', hint: null, providerStatus: { adapter: 'pawapay', credentialsConfigured: false, callbackUrl: 'https://x.test/cb', lastPaymentAt: null, lastSuccessAt: null } }],
  languages: [{ code: 'en', completionPercent: 100 }],
  categories: [],
  checklist: [{ key: 'price', label: 'Set the Full Access price', ok: checklistOk }, { key: 'legal', label: 'Legal review of terms and refund policy', ok: false }],
  readyToLaunch: checklistOk,
});

function setup(d: CountryDetailX, perms = SYSTEM_PERMS) {
  stubViewport(true);
  const api = mockFetch((url, init) => {
    if (url.includes('/status-impact')) return { body: { from: 'LIVE', to: 'PREPARING', users: 4218, activeAccessGrants: 612, attemptsInProgress: 3, publishedTests: 90, checklist: [], readyToLaunch: true } };
    if (init?.method === 'PATCH') return { body: { ok: true } };
    return undefined;
  });
  renderAdminRoutes([{ path: '/', element: <CountryDetailPanel d={d} phone={false} /> }], { route: '/', me: admin('SYSTEM_ADMIN', perms) });
  return api;
}

describe('Country actions (A14)', () => {
  it('shows the provider status without secrets', () => {
    setup(detail());
    expect(screen.getByText('Connected through pawaPay')).toBeInTheDocument();
    expect(screen.getByText('Credentials are missing: payments cannot be taken')).toBeInTheDocument();
    expect(screen.getByText('Callback address: https://x.test/cb')).toBeInTheDocument();
  });

  it('set price: validates, says new payments only, sends minor units with the reason', async () => {
    const api = setup(detail());
    await userEvent.click(screen.getByRole('button', { name: 'Set price…' }));
    const dlg = await screen.findByRole('dialog', { name: /Set the Full Access price in Kenya/ });
    expect(dlg).toHaveTextContent('never shortened');
    await userEvent.type(within(dlg).getByLabelText('Price (KES)'), '1500.50');
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Launch price');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save price' }));
    await waitFor(() => expect(api.calls.some((c) => c.init?.method === 'PATCH')).toBe(true));
    const c = api.calls.find((x) => x.init?.method === 'PATCH')!;
    expect(c.url).toBe('/api/admin/countries/KE/plan');
    expect(JSON.parse(String(c.init!.body))).toEqual({ priceMinor: 150050, durationDays: 30, reason: 'Launch price' });
  });

  it('go live with open items is blocked until the override is ticked', async () => {
    const api = setup(detail());
    await userEvent.click(screen.getByRole('button', { name: 'Go live…' }));
    const dlg = await screen.findByRole('dialog', { name: /Open Kenya to candidates/ });
    expect(dlg).toHaveTextContent('2 items still open');
    await userEvent.type(within(dlg).getByLabelText('Reason'), 'Soft launch');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Go live anyway' }));
    expect(await within(dlg).findByText(/Finish the open items/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.init?.method === 'PATCH')).toBe(false);
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Open anyway/ }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Go live anyway' }));
    await waitFor(() => expect(api.calls.some((c) => c.init?.method === 'PATCH')).toBe(true));
    expect(JSON.parse(String(api.calls.find((x) => x.init?.method === 'PATCH')!.init!.body))).toEqual({ status: 'LIVE', reason: 'Soft launch', force: true });
  });

  it('move back shows who is affected and confirms in the destructive style', async () => {
    setup(detail({ status: 'LIVE', code: 'RW', name: 'Rwanda' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move back to Preparing…' }));
    const dlg = await screen.findByRole('dialog', { name: /Move Rwanda back to Preparing/ });
    expect(await within(dlg).findByText(/4,218 people registered/)).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Move back to Preparing' }).className).toContain('bg-incorrect');
  });

  it('a role without countries:write sees the buttons disabled with the reason', () => {
    setup(detail(), [...EDITOR_PERMS, ...SUPPORT_PERMS]);
    expect(screen.getByRole('button', { name: 'Set price…' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Only a System admin can change the price.').length).toBeGreaterThan(0);
  });
});
