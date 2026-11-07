import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testSession, testUser } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { SignInPage } from './SignInPage';

function Where() {
  const l = useLocation();
  return <div data-testid="where">{`${l.pathname}${l.search}`}</div>;
}

function renderSignIn(route = '/sign-in') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
function server(opts: { google?: boolean; signIn?: Reply; resend?: Reply; user?: Parameters<typeof testUser>[0] } = {}) {
  return mockFetch((url, init) => {
    if (url === '/api/auth/providers') return { body: { google: opts.google ?? false } };
    if (url === '/api/auth/sign-in' && init?.method === 'POST') return opts.signIn ?? { body: { user: testUser(opts.user), claimedAttempts: 0 } };
    if (url === '/api/auth/verify-email/resend' && init?.method === 'POST') return opts.resend ?? { body: { cooldownSeconds: 45, expiresInSeconds: 600 } };
    if (url === '/api/me') return { body: testSession(opts.user) };
    return undefined;
  });
}

afterEach(() => vi.unstubAllGlobals());

const fill = async (u: ReturnType<typeof userEvent.setup>, email = ' Aline@Example.test ', password = 'Password123!') => {
  await u.type(await screen.findByLabelText('Email address'), email);
  await u.type(screen.getByLabelText('Password'), password);
};
const body = (calls: { url: string; init?: RequestInit }[], url: string) => JSON.parse(String(calls.find((c) => c.url === url)?.init?.body));

describe('sign-in screen (SignIn.dc)', () => {
  it('draws the designed form: heading, fields, Forgot password, Remember me, Resend verification, Create an account', async () => {
    server();
    renderSignIn();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Welcome back. Your practice is waiting.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByLabelText('Remember me')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Resend verification' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/sign-up');
  });

  it('always draws Continue with Google and its divider, and Back to home (Sign in, top right)', async () => {
    server({ google: false });
    renderSignIn();
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByText('or sign in with email')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/rw');
  });

  it('Google not set up: pressing it stays here and says so', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    server({ google: false });
    const u = userEvent.setup();
    renderSignIn();
    await u.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByText('Google sign-in isn’t available yet. Use your email instead.')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('Google set up: pressing it leaves for the API with next', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    server({ google: true });
    const u = userEvent.setup();
    renderSignIn('/sign-in?next=%2Frw%2Ftests');
    await screen.findByRole('button', { name: 'Continue with Google' });
    await waitFor(async () => {
      await u.click(screen.getByRole('button', { name: 'Continue with Google' }));
      expect(assign).toHaveBeenCalledWith('/api/auth/google/start?next=%2Frw%2Ftests&intent=sign_in');
    });
  });

  it('rejects a malformed email and an empty password inline without calling the API', async () => {
    const { calls } = server();
    const u = userEvent.setup();
    renderSignIn();
    await u.type(await screen.findByLabelText('Email address'), 'aline@');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address, like name@example.com.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/auth/sign-in')).toBe(false);
  });

  it('signs in with the normalised email, remember me and the guest tokens, then opens the dashboard', async () => {
    localStorage.setItem('jobprep.guestTokens', JSON.stringify(['guesttoken-12345']));
    const { calls } = server();
    const u = userEvent.setup();
    renderSignIn();
    await fill(u);
    await u.click(screen.getByLabelText('Remember me'));
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/progress'));
    expect(body(calls, '/api/auth/sign-in')).toEqual({ email: 'aline@example.test', password: 'Password123!', remember: true, guestTokens: ['guesttoken-12345'] });
    expect(localStorage.getItem('jobprep.session')).toBe('1');
  });

  it('goes to ?next= when setup is done', async () => {
    server();
    const u = userEvent.setup();
    renderSignIn('/sign-in?next=%2Frw%2Ftests');
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/tests'));
  });

  it('goes to the setup step the API names, keeping ?next=', async () => {
    server({ user: { onboarding: { done: false, nextStep: 'category' } } });
    const u = userEvent.setup();
    renderSignIn('/sign-in?next=%2Frw%2Fcheckout%3Ftest%3Dx');
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/setup/category?next=%2Frw%2Fcheckout%3Ftest%3Dx'));
  });

  it('401 invalid_credentials: "Email or password is incorrect", fields are kept', async () => {
    server({ signIn: { status: 401, body: { error: 'invalid_credentials' } } });
    const u = userEvent.setup();
    renderSignIn();
    await fill(u, 'aline@example.test');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect')).toBeInTheDocument();
    expect(screen.getByText('Check them and try again, or reset your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('aline@example.test');
  });

  it('429 too_many_attempts: "Too many tries" with the wait', async () => {
    server({ signIn: { status: 429, body: { error: 'too_many_attempts', retryAfterSeconds: 900 } } });
    const u = userEvent.setup();
    renderSignIn();
    await fill(u, 'aline@example.test');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Too many tries')).toBeInTheDocument();
    expect(screen.getByText('For your security, wait 15 minutes, or reset your password.')).toBeInTheDocument();
  });

  it('403 email_not_verified, then Resend verification sends a code and opens the Check your email screen', async () => {
    const { calls } = server({ signIn: { status: 403, body: { error: 'email_not_verified' } } });
    const u = userEvent.setup();
    renderSignIn('/sign-in?next=%2Frw%2Ftests');
    await fill(u, 'aline@example.test');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Please verify your email first')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Resend verification' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/verify-email?email=aline%40example.test&next=%2Frw%2Ftests'));
    expect(body(calls, '/api/auth/verify-email/resend')).toEqual({ email: 'aline@example.test' });
  });

  it('Resend verification while a code was just sent opens its screen with the wait', async () => {
    server({ resend: { status: 429, body: { error: 'otp_cooldown' }, headers: { 'Retry-After': '31' } } });
    const u = userEvent.setup();
    renderSignIn();
    await u.type(await screen.findByLabelText('Email address'), 'aline@example.test');
    await u.click(screen.getByRole('button', { name: 'Resend verification' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/verify-email?email=aline%40example.test'));
  });

  it('Resend verification needs a valid email first', async () => {
    const { calls } = server();
    const u = userEvent.setup();
    renderSignIn();
    await u.click(await screen.findByRole('button', { name: 'Resend verification' }));
    expect(await screen.findByText('Enter a valid email address, like name@example.com.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('resend'))).toBe(false);
  });

  it('a failed Google round trip shows a plain message (no artboard)', async () => {
    server();
    renderSignIn('/sign-in?error=google_failed');
    expect(await screen.findByText('Google sign-in did not work')).toBeInTheDocument();
  });

  it('?reason=admin_stale keeps the screen open for a signed-in admin and says why', async () => {
    localStorage.setItem('jobprep.session', '1');
    server();
    renderSignIn('/sign-in?next=%2Fadmin%2Fusers&reason=admin_stale');
    expect(await screen.findByText('Please sign in again to use the admin area')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('a signed-in person is sent on (to setup if it is unfinished)', async () => {
    localStorage.setItem('jobprep.session', '1');
    server({ user: { onboarding: { done: false, nextStep: 'goal' } } });
    renderSignIn('/sign-in');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/setup/goal'));
  });
});
