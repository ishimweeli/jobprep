import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { AuthCallbackPage } from './AuthCallbackPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';

function Where() {
  const l = useLocation();
  return <div data-testid="where">{`${l.pathname}${l.search}`}</div>;
}

afterEach(() => vi.unstubAllGlobals());

function renderAt(route: string) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

describe('Reset your password (ForgotPassword.dc)', () => {
  it('sends the link request for the normalised email, then shows Check your email', async () => {
    const { calls } = mockFetch((url, init) => (url === '/api/auth/forgot-password' && init?.method === 'POST' ? { body: { ok: true } } : undefined));
    const u = userEvent.setup();
    renderAt('/forgot-password');
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/sign-in');
    await u.type(screen.getByLabelText('Email'), ' Aline@Example.test ');
    await u.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('If an account exists for that address, a reset link is on its way. It works for 1 hour.')).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ email: 'aline@example.test' });
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/sign-in');
    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument();
  });

  it('a bad address is an inline message and nothing is sent', async () => {
    const { calls } = mockFetch(() => undefined);
    const u = userEvent.setup();
    renderAt('/forgot-password');
    await u.type(screen.getByLabelText('Email'), 'aline@');
    await u.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Enter a valid email address, like name@example.com.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});

describe('Choose a new password (ResetPassword.dc)', () => {
  const ok = (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/auth/reset-password/check')) return { body: { email: 'aline@example.test' } };
    if (url === '/api/auth/reset-password' && init?.method === 'POST') return { body: { ok: true } };
    return undefined;
  };

  it('shows "For <email>", the two rules update live, and Save goes to sign-in without signing in', async () => {
    const { calls } = mockFetch(ok);
    const u = userEvent.setup();
    renderAt('/reset-password?token=abc123');
    expect(await screen.findByText('For aline@example.test')).toBeInTheDocument();
    expect(calls[0]?.url).toBe('/api/auth/reset-password/check?token=abc123');
    const rules = screen.getByRole('list', { name: 'Password rules' });
    expect(rules).toHaveTextContent('At least 8 characters');
    expect(rules).toHaveTextContent('Both passwords match');
    expect(rules).toHaveTextContent('At least 8 characters (not yet)');
    await u.type(screen.getByLabelText('New password'), 'Password123!');
    expect(rules).toHaveTextContent('At least 8 characters (done)');
    expect(rules).toHaveTextContent('Both passwords match (not yet)');
    await u.type(screen.getByLabelText('Confirm new password'), 'Password123!');
    expect(rules).toHaveTextContent('Both passwords match (done)');
    await u.click(screen.getByRole('button', { name: 'Save new password' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/sign-in'));
    expect(JSON.parse(String(calls.find((c) => c.url === '/api/auth/reset-password')?.init?.body))).toEqual({ token: 'abc123', password: 'Password123!' });
    expect(localStorage.getItem('jobprep.session')).toBeNull();
  });

  it('does not save while a rule fails', async () => {
    const { calls } = mockFetch(ok);
    const u = userEvent.setup();
    renderAt('/reset-password?token=abc123');
    await u.type(await screen.findByLabelText('New password'), 'Password123!');
    await u.type(screen.getByLabelText('Confirm new password'), 'Password123');
    await u.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(calls.some((c) => c.url === '/api/auth/reset-password')).toBe(false);
  });

  it('a dead or missing link shows the error state with a way to ask again', async () => {
    mockFetch((url) => (url.startsWith('/api/auth/reset-password/check') ? { status: 400, body: { error: 'invalid_or_expired_token' } } : undefined));
    const { unmount } = renderAt('/reset-password?token=old');
    expect(await screen.findByText('This reset link is not valid')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send a new reset link' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    unmount();
    renderAt('/reset-password');
    expect(await screen.findByText('This reset link is not valid')).toBeInTheDocument();
  });
});

describe('Signing you in (AuthCallback.dc)', () => {
  it('loads the user, then goes to the setup step the API names', async () => {
    mockFetch((url) => (url === '/api/me' ? { body: testSession({ onboarding: { done: false, nextStep: 'country' } }) } : undefined));
    renderAt('/auth/callback?next=%2Frw%2Fcheckout%3Ftest%3Dx');
    expect(screen.getByRole('status')).toHaveTextContent('Signing you in');
    expect(screen.getByText('This takes a few seconds.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/setup/country?next=%2Frw%2Fcheckout%3Ftest%3Dx'));
    expect(localStorage.getItem('jobprep.session')).toBe('1');
  });

  it('with setup done it goes to next, else the dashboard', async () => {
    mockFetch((url) => (url === '/api/me' ? { body: testSession() } : undefined));
    const { unmount } = renderAt('/auth/callback?next=%2Frw%2Ftests');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/tests'));
    unmount();
    renderAt('/auth/callback');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/progress'));
  });

  it('no session means Google did not sign the person in: back to sign-in with the failure', async () => {
    mockFetch((url) => (url === '/api/me' ? { status: 401, body: { error: 'unauthenticated' } } : undefined));
    renderAt('/auth/callback?next=%2Frw%2Ftests');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/sign-in?error=google_failed&next=%2Frw%2Ftests'));
    expect(localStorage.getItem('jobprep.session')).toBeNull();
  });
});
