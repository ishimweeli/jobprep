import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '../../api/types';
import { PhoneTabBar } from '../../components/layout/PhoneTabBar';
import { SignedOutNotice } from '../../components/layout/SignedOutNotice';
import { setNotice } from '../../lib/notice';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { AccountMenu } from './AccountMenu';
import { AccountTabPage } from './AccountTabPage';

const session: MeResponse = {
  user: { id: 'u1', name: 'Aline Uwase', phone: '+250788123456', countryCode: 'RW', goalCategoryId: null, language: 'en' },
  country: { code: 'RW', name: 'Rwanda', currencyCode: 'RWF', languages: ['en', 'rw'] },
  access: { current: { endsAt: '2026-11-25T00:00:00Z', daysLeft: 23, endingSoon: false }, expired: null, otherCountries: [] },
};
const running = { id: 'a1', kind: 'FULL', startedAt: '', mockTest: { slug: 's', title: 'Teaching Profession & CBC Pedagogy', countryCode: 'RW' }, total: 40, answered: 3, remainingSeconds: 1265 };

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

beforeEach(() => localStorage.setItem('jobprep.session', '1'));
afterEach(() => {
  vi.unstubAllGlobals();
  setNotice(null);
});

function server(attempts: unknown[]) {
  return mockFetch((url, init) => {
    if (url === '/api/me') return { body: session };
    if (url === '/api/attempts/in-progress') return { body: { attempts } };
    if (url === '/api/auth/sign-out' && init?.method === 'POST') return { status: 204 };
    return undefined;
  });
}

function renderMenu() {
  return renderWithProviders(
    <>
      <AccountMenu session={session} slug="rw" />
      <Where />
      <SignedOutNotice />
    </>,
    { route: '/rw/progress' },
  );
}

describe('account menu (AccountMenu.dc)', () => {
  it('opens from the avatar with the profile and every row, and closes with Escape', async () => {
    server([]);
    const user = userEvent.setup();
    renderMenu();
    const avatar = screen.getByRole('button', { name: 'AU account menu for Aline Uwase' });
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    await user.click(avatar);
    expect(avatar).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('+250 788 123 456')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((e) => e.textContent)).toEqual([
      'My progress', 'My accessFull Access · 23 days left', 'Exam countryRwanda · change', 'LanguageEnglish · Ikinyarwanda', 'Help and support', 'Account settingsName, phone number', 'Sign out',
    ]);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(avatar).toHaveFocus();
  });

  it('Language and Help are drawn but inert (no designs for their follow-ups)', async () => {
    server([]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menuitem', { name: /Language/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: /Help and support/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(/SUPPORT PHONE/)).not.toBeInTheDocument();
  });

  it('navigates from a row and closes the menu', async () => {
    server([]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /Account settings/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/account/settings');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('with no test running, Sign out signs out at once and shows "You’re signed out. Sign in again"', async () => {
    const { calls } = server([]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/auth/sign-out' && c.init?.method === 'POST')).toBe(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText(/You’re signed out\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/sign-in');
    expect(localStorage.getItem('jobprep.session')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/rw');
  });

  it('with a full mock test running it asks first; "Stay signed in" does nothing, "Sign out" signs out', async () => {
    const { calls } = server([running]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign out?' });
    expect(dialog).toHaveTextContent('You have a mock test in progress (Teaching Profession & CBC Pedagogy, 21:05 left).');
    expect(dialog).toHaveTextContent('the timer keeps running while you are signed out');
    expect(calls.some((c) => c.url === '/api/auth/sign-out')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Stay signed in' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/auth/sign-out')).toBe(false);

    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/auth/sign-out')).toBe(true));
    expect(await screen.findByText(/You’re signed out\./)).toBeInTheDocument();
  });

  it('a practice set in progress does not block signing out', async () => {
    const { calls } = server([{ ...running, kind: 'PRACTICE' }]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/auth/sign-out')).toBe(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('phone navigation (NavPhone.dc)', () => {
  it('signed-in tabs: Home, Tests, Progress, Account, with the current one marked', () => {
    renderWithProviders(<PhoneTabBar />, { route: '/rw/tests' });
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Tests', 'Progress', 'Account']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/rw', '/rw/tests', '/rw/progress', '/account']);
    expect(screen.getByRole('link', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('the Account tab page lists the same rows and a Sign out button', async () => {
    server([]);
    renderWithProviders(
      <Routes>
        <Route path="/account" element={<AccountTabPage />} />
      </Routes>,
      { route: '/account' },
    );
    expect(await screen.findByText('Aline Uwase')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My access/ })).toHaveTextContent('Full Access · 23 days left');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByText('JobPrep by Nexvecta · Independent practice platform')).toBeInTheDocument();
  });

  it('the account page sign-out sheet also appears when a test is running', async () => {
    server([running]);
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/account" element={<AccountTabPage />} />
      </Routes>,
      { route: '/account' },
    );
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign out?' });
    expect(dialog).toHaveTextContent('You have a mock test in progress.');
    await act(async () => undefined);
  });
});
