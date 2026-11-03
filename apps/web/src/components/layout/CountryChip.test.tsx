import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { CountryChip } from './CountryChip';

const rwanda = { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true };

afterEach(() => vi.unstubAllGlobals());

describe('country chip (ba8f27b: no currency beside the country)', () => {
  it('shows the code chip and the name only, and is named "Country: RW Rwanda. Change country"', async () => {
    mockFetch((url) => (url === '/api/countries' ? { body: { countries: [rwanda] } } : undefined));
    renderWithProviders(<CountryChip />, { route: '/rw' });
    const link = await screen.findByRole('link', { name: 'Country: RW Rwanda. Change country' });
    expect(link).toHaveTextContent('RW Rwanda');
    expect(link).not.toHaveTextContent('RWF');
    expect(link).toHaveAttribute('href', '/choose-country');
  });
});
