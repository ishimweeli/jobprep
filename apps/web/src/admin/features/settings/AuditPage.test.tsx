import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { AuditPage } from './AuditPage';

afterEach(() => vi.unstubAllGlobals());

const entry = { id: 'e1', at: '2026-11-01T10:00:00Z', actor: { id: 'u1', name: 'Jean Bosco N.' }, action: 'country.plan.set', entityType: 'country', entityId: 'RW', countryCode: 'RW', reason: 'Market change', summary: 'changed the Rwanda Full Access price from RWF 2,000 to RWF 2,500 — reason: Market change', metadata: { from: 'RWF 2,000', to: 'RWF 2,500' } };

function setup(desktop = true) {
  stubViewport(desktop);
  const api = mockFetch((url) => {
    if (url.startsWith('/api/admin/audit/filters')) return { body: { actions: ['country.plan.set'], entityTypes: ['country'], actors: [{ id: 'u1', name: 'Jean Bosco N.' }] } };
    if (url.startsWith('/api/admin/audit/e1')) return { body: { entry: { ...entry, actor: { id: 'u1', name: 'Jean Bosco N.', email: 'j@example.com' } } } };
    if (url.startsWith('/api/admin/audit')) return { body: { total: 1, page: 1, pageSize: 25, results: [entry] } };
    if (url.startsWith('/api/admin/payments')) return { body: { summary: { pendingNow: 0 }, results: [] } };
    if (url.startsWith('/api/admin/countries')) return { body: { countries: [], counts: {} } };
    return undefined;
  });
  const r = renderAdminRoutes([{ path: '/admin/settings/audit', element: <AuditPage /> }], { route: '/admin/settings/audit', me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });
  return { api, ...r };
}

describe('Audit log screen', () => {
  it('lists entries with who, what and reason, and says who may see it', async () => {
    setup();
    expect(await screen.findByText(/changed the Rwanda Full Access price/)).toBeInTheDocument();
    expect(screen.getByText(/Only System admins can see this page/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reason' })).toBeInTheDocument();
  });

  it('a filter goes into the URL and the request', async () => {
    const { api, router } = setup();
    await screen.findByText(/changed the Rwanda/);
    await userEvent.selectOptions(screen.getByLabelText('Action'), 'country.plan.set');
    await waitFor(() => expect(router.state.location.search).toBe('?action=country.plan.set'));
    await waitFor(() => expect(api.calls.some((c) => c.url.includes('/audit?') && c.url.includes('action=country.plan.set'))).toBe(true));
  });

  it('a backwards date range is explained and not requested', async () => {
    const { api } = setup();
    await screen.findByText(/changed the Rwanda/);
    await userEvent.type(screen.getByLabelText('From'), '2026-10-05');
    await userEvent.type(screen.getByLabelText('To'), '2026-10-01');
    expect(await screen.findByText('The end date is before the start date.')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.url.includes('/audit?') && c.url.includes('from=') && c.url.includes('to=')).length).toBe(0);
  });

  it('Details opens the entry with before and after, closes with Esc', async () => {
    setup();
    await screen.findByText(/changed the Rwanda/);
    await userEvent.click(screen.getByRole('button', { name: /Details of/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Audit entry' });
    expect(await screen.findByText('RWF 2,500', { selector: 'div' })).toBeInTheDocument();
    expect(dlg).toHaveTextContent('Market change');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('phone: cards, no table', async () => {
    setup(false);
    expect(await screen.findByText(/changed the Rwanda/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
