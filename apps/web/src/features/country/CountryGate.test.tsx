import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CountrySummary, MeResponse } from '../../api/types';
import { SystemPageBody } from '../system/SystemPage';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { CountryNotOpen, WrongCountry } from './CountryGate';

const uganda: CountrySummary = { code: 'UG', slug: 'ug', name: 'Uganda', status: 'PREPARING', dialCode: '+256', currencyCode: 'UGX', languages: ['en'], selectable: false };
const session = (access: boolean): MeResponse => ({
  user: { id: 'u', name: 'Aline Uwase', phone: '+250788123456', countryCode: 'RW', goalCategoryId: null, language: 'en' },
  country: { code: 'RW', name: 'Rwanda', currencyCode: 'RWF', languages: ['en'] },
  access: { current: access ? { endsAt: '2026-11-25T00:00:00Z', daysLeft: 20, endingSoon: false } : null, expired: null, otherCountries: [] },
});

afterEach(() => vi.unstubAllGlobals());

describe('country not open (CountryGate.dc)', () => {
  it('shows the waiting-list form for the country, with its dial code', () => {
    renderWithProviders(<CountryNotOpen country={uganda} />);
    expect(screen.getByRole('heading', { name: 'JobPrep isn’t open in Uganda yet' })).toBeInTheDocument();
    expect(screen.getByText('+256')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('placeholder', '7XX XXX XXX');
    expect(screen.getByRole('link', { name: 'Choose a different country' })).toHaveAttribute('href', '/choose-country');
  });

  it('joins the list: POST the number, then "You’re on the list" with that number', async () => {
    const { calls } = mockFetch((url, init) => (url === '/api/countries/ug/waiting-list' && init?.method === 'POST' ? { status: 201, body: { ok: true } } : undefined));
    const u = userEvent.setup();
    renderWithProviders(<CountryNotOpen country={uganda} />);
    await u.type(screen.getByLabelText('Phone number'), '712345678');
    await u.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(await screen.findByRole('status')).toHaveTextContent('You’re on the list');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ phone: '+256712345678' });
    expect(screen.getByText(/We’ll send one SMS to \+256 712 345 678 when Uganda opens\./)).toBeInTheDocument();
  });

  it('a bad number is refused before any request', async () => {
    const { calls } = mockFetch(() => undefined);
    const u = userEvent.setup();
    renderWithProviders(<CountryNotOpen country={uganda} />);
    await u.type(screen.getByLabelText('Phone number'), '7123');
    await u.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(await screen.findByText(/Enter a 9-digit Uganda number/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});

describe('wrong country (CountryGate.dc)', () => {
  it('says the link is for Kenya, the account is for Rwanda, and offers Stay or Switch', () => {
    renderWithProviders(<WrongCountry linkCountry={{ code: 'KE', name: 'Kenya' }} session={session(true)} />);
    expect(screen.getByRole('heading', { name: 'This test is for Kenya' })).toBeInTheDocument();
    expect(screen.getByText(/Your account is set to/)).toHaveTextContent('so your Rwanda Full Access does not cover it.');
    expect(screen.getByRole('link', { name: 'See similar tests in Rwanda' })).toHaveAttribute('href', '/rw/tests');
    expect(screen.getByRole('link', { name: 'Switch my account to Kenya' })).toHaveAttribute('href', '/account/settings?switch=KE');
    expect(screen.getByText('Switching keeps your Rwanda results. Your Rwanda Full Access stays with Rwanda.')).toBeInTheDocument();
  });
  it('without access it does not talk about Full Access', () => {
    renderWithProviders(<WrongCountry linkCountry={{ code: 'KE', name: 'Kenya' }} session={session(false)} />);
    expect(screen.queryByText(/Full Access/)).not.toBeInTheDocument();
  });
});

describe('error page reference (SystemPages.dc)', () => {
  it('shows the request id as the Reference and retries', async () => {
    const onClick = vi.fn();
    const u = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/" element={<SystemPageBody kind="error" reference="7f3a21c9" cta={{ onClick }} alt={{ to: '/' }} />} />
      </Routes>,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong on our side' })).toBeInTheDocument();
    expect(screen.getByText('If you were taking a test, your answers are saved.')).toBeInTheDocument();
    expect(screen.getByText(/Reference: JP-7F3A-21C9 — share this with support if it keeps happening\./)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onClick).toHaveBeenCalled();
  });
  it('no reference line without a request id; the 404 page has its code and links', () => {
    renderWithProviders(<SystemPageBody kind="not_found" cta={{ to: '/rw/tests' }} alt={{ to: '/rw' }} />);
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
    expect(screen.getByText('Error 404')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find mock tests' })).toHaveAttribute('href', '/rw/tests');
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/rw');
  });
});
