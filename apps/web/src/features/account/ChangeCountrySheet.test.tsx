import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { ChangeCountrySheet } from './ChangeCountrySheet';

afterEach(() => vi.unstubAllGlobals());

const countries = {
  countries: [
    { code: 'KE', slug: 'ke', name: 'Kenya', status: 'PREPARING', dialCode: '+254', currencyCode: 'KES', languages: ['en'], selectable: false },
    { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en'], selectable: true },
  ],
};

describe('ChangeCountrySheet', () => {
  it('previews what changes for a live country and posts the confirmed switch', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch((url, init) => {
      if (url.startsWith('/api/me/country-change')) {
        return {
          body: {
            from: { code: 'RW', name: 'Rwanda' },
            to: { code: 'KE', name: 'Kenya', status: 'LIVE', selectable: true, currencyCode: 'KES', paymentMethods: ['M-Pesa', 'Airtel Money'] },
            currentAccess: { endsAt: '2026-11-25T00:00:00Z', daysLeft: 23 },
            keepsResults: true,
          },
        };
      }
      if (url === '/api/me/country' && init?.method === 'POST') return { body: { user: {} } };
      if (url === '/api/me') return { status: 401, body: { error: 'unauthorized' } };
      if (url === '/api/countries') return { body: countries };
    });
    renderWithProviders(<ChangeCountrySheet open onClose={() => {}} to="KE" />);

    expect(await screen.findByRole('dialog', { name: 'Switch to Kenya?' })).toBeInTheDocument();
    expect(screen.getByText(/prices in KES and M-Pesa or Airtel Money payments/)).toBeInTheDocument();
    expect(screen.getByText(/Your Rwanda Full Access \(23 days left\)/)).toBeInTheDocument();
    expect(screen.getByText(/Your Rwanda results and progress are kept/)).toBeInTheDocument();
    // Nothing is changed before confirming.
    expect(calls.some((c) => c.url === '/api/me/country')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Switch to Kenya' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/me/country')).toBe(true));
    const post = calls.find((c) => c.url === '/api/me/country')!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ countryCode: 'KE', confirm: true });
  });

  it('shows nothing for a country that is not live (no designed sheet)', async () => {
    mockFetch((url) => {
      if (url.startsWith('/api/me/country-change')) {
        return {
          body: {
            from: { code: 'RW', name: 'Rwanda' },
            to: { code: 'KE', name: 'Kenya', status: 'PREPARING', selectable: false, currencyCode: 'KES', paymentMethods: [] },
            currentAccess: null,
            keepsResults: true,
          },
        };
      }
    });
    renderWithProviders(<ChangeCountrySheet open onClose={() => {}} to="KE" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Switch to Kenya/ })).not.toBeInTheDocument();
  });
});
