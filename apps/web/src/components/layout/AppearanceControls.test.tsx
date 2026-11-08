import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { AppearanceControls } from './AppearanceControls';

const rwanda = { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true };

function server() {
  return mockFetch((url) => {
    if (url === '/api/countries') return { body: { countries: [rwanda] } };
    if (url.startsWith('/api/countries/')) return { body: rwanda };
    return undefined;
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('dark mode and language on every page', () => {
  it.each(['/rw', '/sign-in', '/sign-up', '/rw/checkout', '/rw/pricing', '/help'])('is on %s for a guest', async (route) => {
    server();
    renderWithProviders(<AppearanceControls />, { route });
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Language: English/ })).toBeInTheDocument();
  });

  it('toggles dark mode and remembers it', async () => {
    server();
    renderWithProviders(<AppearanceControls />, { route: '/rw' });
    const toggle = screen.getByRole('button', { name: 'Dark mode' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    toggle.click();
    expect(await screen.findByRole('button', { name: 'Dark mode', pressed: true })).toBeInTheDocument();
    expect(localStorage.getItem('jobprep.theme')).toBe('dark');
    localStorage.removeItem('jobprep.theme');
  });

  it('is left off the admin area and the exam, review and live interview screens', () => {
    server();
    for (const route of ['/admin/users', '/rw/exam/abc', '/rw/review/abc', '/rw/interview-live/abc']) {
      const { unmount } = renderWithProviders(<AppearanceControls />, { route });
      expect(screen.queryByRole('button', { name: 'Dark mode' })).not.toBeInTheDocument();
      unmount();
    }
  });
});
