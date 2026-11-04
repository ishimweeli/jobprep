import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../test/fixtures';
import { mockFetch, renderWithProviders } from '../test/utils';
import { LanguageSwitcher } from './LanguageSwitcher';

const rw = (languages: string[]) => ({
  code: 'RW', name: 'Rwanda', status: 'LIVE', dialCode: '+250', languages, disclaimer: null, plan: null, paymentMethods: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
beforeEach(() => localStorage.clear());

const renderSwitcher = (variant: 'header' | 'segmented') =>
  renderWithProviders(
    <Routes>
      <Route path="/:country" element={<LanguageSwitcher variant={variant} />} />
    </Routes>,
    { route: '/rw' },
  );

describe('language switcher (C22 / C33)', () => {
  it('lists only the languages the country offers and keeps the choice on this device (guest)', async () => {
    mockFetch((url) => (url === '/api/countries/rw' ? { body: rw(['en', 'rw']) } : undefined));
    const u = userEvent.setup();
    renderSwitcher('segmented');
    const group = await screen.findByRole('group', { name: 'Language' });
    expect(group.querySelectorAll('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Kiswahili' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Ikinyarwanda' }));
    expect(screen.getByRole('button', { name: 'Ikinyarwanda' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('jobprep.language')).toBe('rw');
  });

  it('shows nothing when the country offers a single language', async () => {
    const { fn } = mockFetch((url) => (url === '/api/countries/rw' ? { body: rw(['en']) } : undefined));
    renderSwitcher('segmented');
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(screen.queryByRole('group', { name: 'Language' })).not.toBeInTheDocument();
  });

  it('the header variant is a labelled select', async () => {
    mockFetch((url) => (url === '/api/countries/rw' ? { body: rw(['en', 'rw']) } : undefined));
    renderSwitcher('header');
    expect(await screen.findByRole('combobox', { name: 'Language' })).toHaveValue('en');
  });

  it('a signed-in person saves the language to the account', async () => {
    localStorage.setItem('jobprep.session', '1');
    const { calls } = mockFetch((url, init) => {
      if (url === '/api/me' && init?.method !== 'PATCH') return { body: testSession() };
      if (url === '/api/me' && init?.method === 'PATCH') return { body: { user: testSession({ language: 'rw' }).user } };
      // no country detail: the languages come from the session, so the buttons only appear once the account is loaded
      if (url === '/api/countries/rw') return { status: 404, body: { error: 'country_not_found' } };
      return undefined;
    });
    const u = userEvent.setup();
    renderSwitcher('segmented');
    await u.click(await screen.findByRole('button', { name: 'Ikinyarwanda' }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === 'PATCH')!.init!.body))).toEqual({ language: 'rw' });
  });
});
