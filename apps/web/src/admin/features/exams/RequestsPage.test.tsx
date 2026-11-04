import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { RequestsPage } from './RequestsPage';

afterEach(() => vi.unstubAllGlobals());

const row = (over: Record<string, unknown> = {}) => ({
  key: 'veterinary officer|RW', query: 'Veterinary officer', countryCode: 'RW', count: 7, withEmail: 3, firstAt: '2026-10-20T10:00:00Z', lastAt: '2026-11-01T10:00:00Z',
  status: 'OPEN', doneAt: null, doneNote: null, doneBy: null, ...over,
});

function setup(route = '/admin/exams/requests', opts: { phone?: boolean; empty?: boolean; withEmail?: number } = {}) {
  stubViewport(!opts.phone);
  const api = mockFetch((url, init) => {
    if (url === '/api/admin/demand/exam-requests/done' && init?.method === 'POST') return { body: { ok: true, marked: 7, notified: 3 } };
    if (url.startsWith('/api/admin/demand/exam-requests')) {
      const status = new URL(url, 'http://x').searchParams.get('status') ?? 'open';
      return { body: { total: opts.empty ? 0 : 1, page: 1, results: opts.empty ? [] : [status === 'done' ? row({ status: 'DONE', doneAt: '2026-11-02T10:00:00Z', doneBy: 'Jean', doneNote: 'Added' }) : row({ withEmail: opts.withEmail ?? 3 })] } };
    }
    if (url.startsWith('/api/admin/country-options')) return { body: { countries: [{ code: 'RW', name: 'Rwanda', status: 'LIVE' }, { code: 'KE', name: 'Kenya', status: 'PREPARING' }] } };
    if (url.startsWith('/api/admin/exams')) return { body: { total: 1, page: 1, pageSize: 100, totals: {}, results: [{ id: 'm9', title: 'Veterinary Officer Mock 1', slug: 'v', countryCode: 'RW', category: { name: 'Vet', slug: 'vet' }, isFree: false, status: 'DRAFT', questionCount: 0, durationMinutes: 60, openReports: 0 }] } };
    return undefined;
  });
  const r = renderAdminRoutes([{ path: '/admin/exams/requests', element: <RequestsPage /> }], { route, me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });
  return { api, ...r };
}

describe('Exam requests', () => {
  it('groups by search with the count, the last date and how many left an email', async () => {
    setup();
    expect(await screen.findByText('Veterinary officer')).toBeInTheDocument();
    expect(screen.getByText('3 left an email address')).toBeInTheDocument();
    expect(screen.getByText('1 Nov')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('Plan exam links to the new mock test form with the search as the title', async () => {
    setup();
    expect(await screen.findByRole('link', { name: 'Plan exam' })).toHaveAttribute('href', '/admin/exams/new?title=Veterinary+officer&country=RW');
  });

  it('Mark done sends the group, the chosen test and the email choice, and closes', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark this request done' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Email the people who left an address \(3\)/ }));
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Veterinary Officer Mock 1' })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/Mock test that answers it/), 'm9');
    await userEvent.type(within(dialog).getByLabelText(/Note/), 'The test now exists');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(api.calls.some((c) => c.url.endsWith('/exam-requests/done'))).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.url.endsWith('/done'))!.init!.body))).toEqual({
      countryCode: 'RW', query: 'Veterinary officer', reason: 'The test now exists', notify: true, mockTestId: 'm9',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('with nobody to email, the email box is off and says why', async () => {
    setup('/admin/exams/requests', { withEmail: 0 });
    await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /Email the people who left an address/ })).toBeDisabled();
    expect(within(dialog).getByText(/Nobody left an email address/)).toBeInTheDocument();
  });

  it('Done shows who closed it; the filter is in the URL', async () => {
    const { router } = setup();
    await screen.findByText('Veterinary officer');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(router.state.location.search).toBe('?status=done'));
    expect(await screen.findByText('Done 2 Nov by Jean · Added')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
  });

  it('the country list is the admin’s own (country options)', async () => {
    setup();
    const sel = await screen.findByRole('combobox', { name: 'Country' });
    await waitFor(() => expect(within(sel).getByRole('option', { name: 'Kenya' })).toBeInTheDocument());
  });

  it('empty state', async () => {
    setup('/admin/exams/requests', { empty: true });
    expect(await screen.findByText('No open exam requests.')).toBeInTheDocument();
  });

  it('phone: cards', async () => {
    setup('/admin/exams/requests', { phone: true });
    const card = await screen.findByRole('article');
    expect(card).toHaveTextContent('Veterinary officer');
    expect(within(card).getByRole('link', { name: 'Plan exam' })).toBeInTheDocument();
  });
});
