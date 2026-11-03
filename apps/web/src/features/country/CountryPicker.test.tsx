import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { CountryPickerBody } from './CountryPicker';

const rwanda = { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true };
const kenya = { code: 'KE', slug: 'ke', name: 'Kenya', status: 'LIVE', dialCode: '+254', currencyCode: 'KES', languages: ['en'], selectable: true };
const uganda = { code: 'UG', slug: 'ug', name: 'Uganda', status: 'PREPARING', dialCode: '+256', currencyCode: 'UGX', languages: ['en'], selectable: false };
const detail = (code: string, methods: string[]) => ({
  code, name: code, status: 'LIVE', dialCode: '', languages: ['en'], disclaimer: null, plan: null,
  paymentMethods: methods.map((label) => ({ provider: label, label, hint: null })),
});

function server() {
  return mockFetch((url) => {
    if (url === '/api/countries') return { body: { countries: [rwanda, kenya, uganda] } };
    if (url === '/api/countries/rw') return { body: detail('RW', ['MTN MoMo', 'Airtel Money']) };
    if (url === '/api/countries/ke') return { body: detail('KE', ['M-Pesa', 'Airtel Money']) };
    if (url === '/api/countries/ug') return { body: detail('UG', []) };
    if (url === '/api/countries/rw/categories') return { body: { categories: [{ id: 'a', slug: 'a', name: 'A', description: null, icon: null, featured: false, mockTestCount: 90 }] } };
    if (url === '/api/countries/ke/categories') return { body: { categories: [{ id: 'b', slug: 'b', name: 'B', description: null, icon: null, featured: false, mockTestCount: 24 }] } };
    return undefined;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('country list (CountryPicker.dc / CountryPickerPhone.dc): no currency, tests and payment methods instead', () => {
  it('desktop: "90 mock tests · MTN MoMo, Airtel Money", "Join the waiting list" and a "Coming soon" tag', async () => {
    server();
    const { container } = renderWithProviders(<CountryPickerBody currentSlug="rw" onContinue={() => undefined} showLanguage desktop />);
    expect(await screen.findByText('90 mock tests · MTN MoMo, Airtel Money')).toBeInTheDocument();
    expect(await screen.findByText('24 mock tests · M-Pesa, Airtel Money')).toBeInTheDocument();
    expect(screen.getByText('Join the waiting list')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/RWF|KES|UGX|TZS/);
  });

  it('phone: only the payment methods, and "Coming soon" for a country that is not live', async () => {
    server();
    const { container } = renderWithProviders(<CountryPickerBody currentSlug="rw" onContinue={() => undefined} />);
    expect(await screen.findByText('MTN MoMo, Airtel Money')).toBeInTheDocument();
    expect(await screen.findByText('M-Pesa, Airtel Money')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/RWF|KES|UGX|TZS|mock tests/);
  });
});
