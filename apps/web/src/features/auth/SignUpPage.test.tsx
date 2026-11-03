import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { SignUpPage } from './SignUpPage';

const rwanda = { code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true };

function server() {
  return mockFetch((url, init) => {
    if (url === '/api/countries') return { body: { countries: [rwanda] } };
    if (url === '/api/countries/rw') return { body: { ...rwanda, paymentMethods: [] } };
    if (url === '/api/auth/otp/request' && init?.method === 'POST') return { body: { cooldownSeconds: 45, expiresInSeconds: 300 } };
    return undefined;
  });
}

function renderSignUp() {
  return renderWithProviders(
    <Routes>
      <Route path="/sign-up" element={<SignUpPage />} />
    </Routes>,
    { route: '/sign-up' },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('sign-up details step (email replaces phone)', () => {
  it('asks for a name and an email address, with no dial-code chip', async () => {
    server();
    const u = userEvent.setup();
    renderSignUp();
    await u.click(await screen.findByRole('button', { name: 'Continue with Rwanda' }));
    expect(screen.getByRole('heading', { name: 'Your email address' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
    expect(screen.queryByText('+250')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument();
  });

  it('refuses a bad email before any request', async () => {
    const { calls } = server();
    const u = userEvent.setup();
    renderSignUp();
    await u.click(await screen.findByRole('button', { name: 'Continue with Rwanda' }));
    await u.type(screen.getByLabelText('Full name'), 'Aline Uwase');
    await u.type(screen.getByLabelText('Email address'), 'aline@');
    await u.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter a valid email address, like name@example.com.')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/auth/otp/request')).toBe(false);
  });

  it('requests a sign-up code with the country already chosen and a normalised email, then shows where it was sent', async () => {
    const { calls } = server();
    const u = userEvent.setup();
    renderSignUp();
    await u.click(await screen.findByRole('button', { name: 'Continue with Rwanda' }));
    await u.type(screen.getByLabelText('Full name'), 'Aline Uwase');
    await u.type(screen.getByLabelText('Email address'), '  Aline@Example.test ');
    await u.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    const req = calls.find((c) => c.url === '/api/auth/otp/request');
    expect(JSON.parse(String(req?.init?.body))).toEqual({ purpose: 'sign_up', email: 'aline@example.test', countryCode: 'RW' });
    expect(screen.getByText(/We sent a code to/)).toHaveTextContent('Check your email. We sent a code to aline@example.test.');
  });

  it('an existing account is told so', async () => {
    mockFetch((url, init) => {
      if (url === '/api/countries') return { body: { countries: [rwanda] } };
      if (url === '/api/countries/rw') return { body: { ...rwanda, paymentMethods: [] } };
      if (url === '/api/auth/otp/request' && init?.method === 'POST') return { status: 409, body: { error: 'account_exists' } };
      return undefined;
    });
    const u = userEvent.setup();
    renderSignUp();
    await u.click(await screen.findByRole('button', { name: 'Continue with Rwanda' }));
    await u.type(screen.getByLabelText('Full name'), 'Aline Uwase');
    await u.type(screen.getByLabelText('Email address'), 'aline@example.test');
    await u.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('This email address already has an account.')).toBeInTheDocument();
  });
});
