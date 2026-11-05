import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { Sidebar } from './Sidebar';

const rwanda = { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true };

function server() {
  return mockFetch((url) => {
    if (url === '/api/countries') return { body: { countries: [rwanda] } };
    if (url === '/api/me') return { body: testSession() };
    return undefined;
  });
}

beforeEach(() => localStorage.setItem('jobprep.session', '1'));
afterEach(() => vi.unstubAllGlobals());

describe('Sidebar (the signed-in desktop chrome)', () => {
  it('shows the country as a plain display, not a language control', async () => {
    server();
    renderWithProviders(<Sidebar />, { route: '/rw/tests' });
    expect(await screen.findByText('Rwanda')).toBeInTheDocument();
    expect(screen.getByText('Public-service exams')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Country: RW Rwanda/ })).toHaveAttribute('href', '/choose-country');
    // Language lives only in the top bar now.
    expect(screen.queryByText('Ikinyarwanda')).not.toBeInTheDocument();
  });

  it('lists Dashboard, Mock tests, Pricing and Account, with the current one marked', async () => {
    server();
    renderWithProviders(<Sidebar />, { route: '/rw/tests' });
    await screen.findByText('Rwanda');
    const main = screen.getByRole('navigation', { name: 'Main' });
    const links = main.querySelectorAll('a');
    const labels = Array.from(links).map((l) => l.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Mock tests', 'Pricing', 'Account']));
    expect(screen.getByRole('link', { name: 'Mock tests' })).toHaveAttribute('aria-current', 'page');
  });

  it('has a Support section with Help and support', async () => {
    server();
    renderWithProviders(<Sidebar />, { route: '/rw/tests' });
    await screen.findByText('Rwanda');
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Help and support/ })).toHaveAttribute('href', '/help');
  });

  it('shows the account block and a Sign out button', async () => {
    server();
    renderWithProviders(<Sidebar />, { route: '/rw/tests' });
    expect(await screen.findByText('Aline Uwase')).toBeInTheDocument();
    expect(screen.getByText('aline@example.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeInTheDocument();
  });
});
