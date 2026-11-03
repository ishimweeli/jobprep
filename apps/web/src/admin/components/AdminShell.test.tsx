import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_PERMS, SUPPORT_PERMS, SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../test/fixtures';
import { mockFetch } from '../test/utils';
import { AdminShell } from './AdminShell';

afterEach(() => vi.unstubAllGlobals());

const page = <AdminShell title="Overview">content</AdminShell>;
const payments = { summary: { pendingNow: 3, paidToday: [], successfulToday: 0, failedOrExpiredToday: 0 }, results: [], total: 0, page: 1, pageSize: 1, status: 'all', stuckAfterMinutes: 10 };

function render(role: Parameters<typeof admin>[0], perms: Parameters<typeof admin>[1], desktop: boolean) {
  stubViewport(desktop);
  mockFetch((url) => (url.includes('/payments') ? { body: payments } : undefined));
  return renderAdminRoutes([{ path: '/admin', element: page }], { route: '/admin', me: admin(role, perms, 'Marie C.') });
}

describe('admin chrome per role', () => {
  it('system admin: six items in the sidebar, the name and the role, and the pending count on Payments', async () => {
    render('SYSTEM_ADMIN', SYSTEM_PERMS, true);
    const nav = within(screen.getByRole('navigation', { name: 'Admin' }));
    expect(nav.getAllByRole('link').map((a) => a.textContent?.replace(/\d+ pending|\d+$/, '').trim())).toEqual(['Overview', 'Users', 'Exams & questions', 'Payments', 'Countries', 'Settings']);
    expect(screen.getByText('System admin')).toBeInTheDocument();
    expect(screen.getByText('Marie C.')).toBeInTheDocument();
    expect(await nav.findByText('pending')).toBeInTheDocument();
    expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('content editor: only Overview and Exams & questions', () => {
    render('CONTENT_EDITOR', EDITOR_PERMS, true);
    const links = within(screen.getByRole('navigation', { name: 'Admin' })).getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual(['Overview', 'Exams & questions']);
    expect(screen.getByText('Content editor')).toBeInTheDocument();
  });

  it('support: Overview, Users, Payments', () => {
    render('SUPPORT', SUPPORT_PERMS, true);
    const links = within(screen.getByRole('navigation', { name: 'Admin' })).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, '').replace('pending', '').trim());
    expect(links).toEqual(['Overview', 'Users', 'Payments']);
  });

  it('one account with two roles (content editor + support): the union of both navigations and both labels in the role slot', () => {
    render(['CONTENT_EDITOR', 'SUPPORT'], [...new Set([...EDITOR_PERMS, ...SUPPORT_PERMS])], true);
    const links = within(screen.getByRole('navigation', { name: 'Admin' })).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, '').replace('pending', '').trim());
    expect(links).toEqual(['Overview', 'Users', 'Exams & questions', 'Payments']);
    expect(screen.getByText('Content editor, Support')).toBeInTheDocument();
  });

  it('phone: header with the ADMIN mark and the bottom bar of the artboard', () => {
    render('SYSTEM_ADMIN', SYSTEM_PERMS, false);
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    const links = within(screen.getByRole('navigation', { name: 'Admin' })).getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual(['Overview', 'Users', 'Exams', 'Payments', 'Settings']);
  });
});
