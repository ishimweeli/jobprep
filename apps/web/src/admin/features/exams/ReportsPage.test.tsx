import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_PERMS, SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { ReportsPage } from './ReportsPage';

afterEach(() => vi.unstubAllGlobals());

const group = {
  question: { id: 'q31', number: 31, stem: 'The median of 3, 8, 5, 12, 7 and 10 is…' }, mockTest: { id: 'm1', title: 'Secondary Mathematics Mock 1', countryCode: 'RW' },
  count: 4, latestMessage: 'Option B looks wrong', latestAt: '2026-11-01T10:00:00Z', messages: [],
};
const closed = (status: string) => ({
  id: 'r1', message: 'Typo in the stem', createdAt: '2026-10-30T10:00:00Z', status, reporter: { name: 'Aline Uwase', email: 'aline@example.com' }, resolutionNote: 'The question is fine',
  question: { id: 'q31', number: 31, stem: 'The median of 3, 8, 5, 12, 7 and 10 is…' }, mockTest: { id: 'm1', title: 'Secondary Mathematics Mock 1' },
});

function setup(route = '/admin/exams/reports', opts: { phone?: boolean; perms?: typeof SYSTEM_PERMS; empty?: boolean } = {}) {
  stubViewport(!opts.phone);
  const api = mockFetch((url, init) => {
    if (url.startsWith('/api/admin/questions/q31/reports/close') && init?.method === 'POST') return { body: { ok: true, closed: 4 } };
    if (url.startsWith('/api/admin/reports')) {
      const sp = new URL(url, 'http://x').searchParams;
      const status = sp.get('status') ?? 'OPEN';
      if (opts.empty) return { body: { total: 0, page: 1, status, results: [] } };
      if (sp.get('group') === 'question') return { body: { total: 1, page: 1, status, results: [group] } };
      return { body: { total: 1, page: 1, status, results: [closed(status)] } };
    }
    return undefined;
  });
  const r = renderAdminRoutes([{ path: '/admin/exams/reports', element: <ReportsPage /> }], { route, me: admin('SYSTEM_ADMIN', opts.perms ?? SYSTEM_PERMS) });
  return { api, ...r };
}

describe('Reports queue', () => {
  it('lists the reported questions grouped, most reported first, with the latest message', async () => {
    const { api } = setup();
    expect(await screen.findByText('Secondary Mathematics Mock 1')).toBeInTheDocument();
    expect(screen.getByText('Reported 4 times')).toBeInTheDocument();
    expect(screen.getByText('“Option B looks wrong”')).toBeInTheDocument();
    expect(screen.getByText('1 question with open reports')).toBeInTheDocument();
    expect(api.calls.find((c) => c.url.startsWith('/api/admin/reports'))!.url).toContain('group=question');
    expect(screen.getByRole('link', { name: 'Open question' })).toHaveAttribute('href', '/admin/exams/m1/q/q31');
  });

  it('the filter is in the URL and Resolved asks for the ungrouped closed reports with who reported and the note', async () => {
    const { api, router } = setup();
    await screen.findByText('Reported 4 times');
    await userEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    await waitFor(() => expect(router.state.location.search).toBe('?status=resolved'));
    expect(await screen.findByText('Aline Uwase')).toBeInTheDocument();
    expect(screen.getByText('Note: The question is fine')).toBeInTheDocument();
    const last = api.calls[api.calls.length - 1]!.url;
    expect(last).toContain('status=RESOLVED');
    expect(last).not.toContain('group=');
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('dismiss needs a reason, then closes the whole group with it', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    const dialog = await screen.findByRole('dialog', { name: 'Dismiss these reports?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dismiss reports' }));
    expect(within(dialog).getByText(/Write a reason/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.init?.method === 'POST')).toBe(false);
    await userEvent.type(within(dialog).getByLabelText('Why are you dismissing them?'), 'The question is correct');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dismiss reports' }));
    await waitFor(() => expect(api.calls.some((c) => c.init?.method === 'POST')).toBe(true));
    const call = api.calls.find((c) => c.init?.method === 'POST')!;
    expect(call.url).toBe('/api/admin/questions/q31/reports/close');
    expect(JSON.parse(String(call.init!.body))).toEqual({ status: 'DISMISSED', reason: 'The question is correct' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('"Resolve without changes" needs no reason', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Resolve without changes' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve reports' }));
    await waitFor(() => expect(api.calls.some((c) => c.init?.method === 'POST')).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.init?.method === 'POST')!.init!.body))).toEqual({ status: 'RESOLVED' });
  });

  it('Esc closes the dialog without sending anything', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.calls.some((c) => c.init?.method === 'POST')).toBe(false);
  });

  it('each filter has its own empty state', async () => {
    setup('/admin/exams/reports?status=dismissed', { empty: true });
    expect(await screen.findByText('No dismissed reports.')).toBeInTheDocument();
  });

  it('a content editor may close reports', async () => {
    setup('/admin/exams/reports', { perms: EDITOR_PERMS });
    expect(await screen.findByRole('button', { name: 'Dismiss' })).not.toHaveAttribute('aria-disabled');
  });

  it('a role without reports:resolve sees the buttons disabled with the reason', async () => {
    setup('/admin/exams/reports', { perms: ['overview:read', 'exams:read'] });
    expect(await screen.findByRole('button', { name: 'Dismiss' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(/Only a Content editor or System admin can close reports/).length).toBeGreaterThan(0);
  });

  it('phone: cards with the same actions', async () => {
    setup('/admin/exams/reports', { phone: true });
    expect(await screen.findByRole('article')).toHaveTextContent('Reported 4 times');
    expect(screen.getByRole('link', { name: 'Open question' })).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    stubViewport(true);
    mockFetch(() => ({ status: 500, body: { error: 'internal_error' } }));
    renderAdminRoutes([{ path: '/admin/exams/reports', element: <ReportsPage /> }], { route: '/admin/exams/reports', me: admin('SYSTEM_ADMIN', SYSTEM_PERMS) });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
