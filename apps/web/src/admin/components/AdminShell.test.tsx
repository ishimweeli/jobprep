import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_PERMS, SUPPORT_PERMS, SYSTEM_PERMS, admin, renderAdminRoutes, stubViewport } from '../test/fixtures';
import { mockFetch } from '../test/utils';
import { AdminShell } from './AdminShell';

afterEach(() => vi.unstubAllGlobals());

const page = <AdminShell title="Overview">content</AdminShell>;
const countries = {
  countries: [
    { code: 'RW', name: 'Rwanda', status: 'LIVE', currencyCode: 'RWF', users: 4218, publishedTests: 20, draftTests: 2, waitingList: 0, priceLabel: 'RWF 2,000' },
    { code: 'KE', name: 'Kenya', status: 'PREPARING', currencyCode: 'KES', users: 0, publishedTests: 0, draftTests: 4, waitingList: 12, priceLabel: null },
  ],
  counts: { live: 1, preparing: 1, planned: 0 },
};
const payments = { summary: { pendingNow: 3, paidToday: [], successfulToday: 0, failedOrExpiredToday: 0 }, results: [], total: 0, page: 1, pageSize: 1, status: 'all', stuckAfterMinutes: 10 };

function render(role: Parameters<typeof admin>[0], perms: Parameters<typeof admin>[1], desktop: boolean) {
  stubViewport(desktop);
  mockFetch((url) => (url.includes('/payments') ? { body: payments } : url.includes('/countries') ? { body: countries } : undefined));
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

describe('desktop sidebar (AdminOverview.dc)', () => {
  afterEach(() => localStorage.clear());

  it('draws the Admin pill, the Country selector and the signed-in admin card', async () => {
    render('SYSTEM_ADMIN', SYSTEM_PERMS, true);
    const aside = within(screen.getByRole('complementary', { name: 'Admin navigation' }));
    expect(aside.getByText('Admin')).toBeInTheDocument();
    expect(aside.getByText('Country')).toBeInTheDocument();
    const button = aside.getByRole('button', { name: /Country filter:.*All countries/ });
    expect(within(button).getByText('ALL')).toBeInTheDocument();
    expect(await within(button).findByText('Rwanda live · Kenya preparing')).toBeInTheDocument();
    expect(aside.getByText('MC')).toBeInTheDocument();
  });

  it('choosing a country sets ?country= and is remembered; All countries clears it', async () => {
    const u = userEvent.setup();
    const { router } = render('SYSTEM_ADMIN', SYSTEM_PERMS, true);
    await u.click(screen.getByRole('button', { name: /Country filter/ }));
    const menu = within(await screen.findByRole('menu', { name: 'Country' }));
    expect(menu.getAllByRole('menuitemradio').map((i) => i.textContent)).toEqual(['ALLAll countries', 'RWRwandalive', 'KEKenyapreparing']);
    await u.click(menu.getByRole('menuitemradio', { name: /Rwanda/ }));
    expect(router.state.location.search).toBe('?country=RW');
    expect(localStorage.getItem('jobprep.admin.country')).toBe('RW');
    expect(screen.getByRole('button', { name: /Country filter:.*Rwanda/ })).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: /Country filter/ }));
    await u.click(screen.getByRole('menuitemradio', { name: /All countries/ }));
    expect(router.state.location.search).toBe('');
    expect(localStorage.getItem('jobprep.admin.country')).toBe('ALL');
  });

  it('an admin limited to one country has only that country to choose, no All countries', async () => {
    const u = userEvent.setup();
    stubViewport(true);
    mockFetch((url) => (url.includes('/countries') ? { body: countries } : url.includes('/payments') ? { body: payments } : undefined));
    renderAdminRoutes([{ path: '/admin', element: page }], { route: '/admin', me: { ...admin('CONTENT_EDITOR', EDITOR_PERMS, 'Marie C.'), countryScope: ['RW'] } });
    await u.click(screen.getByRole('button', { name: /Country filter:.*Rwanda/ }));
    expect(screen.getAllByRole('menuitemradio').map((i) => i.textContent)).toEqual(['RWRwanda']);
  });

  it('the phone has no country selector (AdminOverviewPhone.dc)', () => {
    render('SYSTEM_ADMIN', SYSTEM_PERMS, false);
    expect(screen.queryByRole('button', { name: /Country filter/ })).not.toBeInTheDocument();
  });
});
