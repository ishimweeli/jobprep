import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testSession } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { SignUpPage } from './SignUpPage';

function Where() {
  const l = useLocation();
  return (
    <div data-testid="where" data-state={JSON.stringify(l.state)}>
      {`${l.pathname}${l.search}`}
    </div>
  );
}

type Reply = { status?: number; body?: unknown };
function server(opts: { google?: boolean; signUp?: Reply; paidTitle?: string } = {}) {
  return mockFetch((url, init) => {
    if (url === '/api/auth/providers') return { body: { google: opts.google ?? false } };
    if (url === '/api/auth/sign-up' && init?.method === 'POST') {
      return opts.signUp ?? { status: 201, body: { status: 'verification_required', email: 'aline@example.test', cooldownSeconds: 45, expiresInSeconds: 600 } };
    }
    if (url === '/api/countries/rw/mock-tests/accountant-mock-1') return { body: { title: opts.paidTitle ?? 'Accountant (Public Institution) — Mock 1' } };
    if (url === '/api/me') return { body: testSession() };
    return undefined;
  });
}

function renderSignUp(route = '/sign-up') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

afterEach(() => vi.unstubAllGlobals());

const fill = async (u: ReturnType<typeof userEvent.setup>, over: { name?: string; email?: string; password?: string } = {}) => {
  await u.type(await screen.findByLabelText('Your name'), over.name ?? 'Aline Uwase');
  await u.type(screen.getByLabelText('Email'), over.email ?? ' Aline@Example.test ');
  await u.type(screen.getByLabelText('Password'), over.password ?? 'Password123!');
};

describe('sign-up screen (SignUp.dc)', () => {
  it('draws the designed card: name, email, password with its hint, Create account, Sign in link, Terms line', async () => {
    server();
    renderSignUp();
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByText('Free to start. Free sample tests need no account at all.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByText('Use 8 or more characters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    expect(screen.getByText(/By continuing you agree to the/)).toHaveTextContent('By continuing you agree to the Terms and Privacy policy.');
  });

  it('always draws Continue with Google, the "or" divider and Back to home', async () => {
    server({ google: false });
    renderSignUp();
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByText('or')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument();
  });

  it('Google not set up: pressing it stays here and says so', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    server({ google: false });
    const u = userEvent.setup();
    renderSignUp();
    await u.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByText('Google sign-in isn’t available yet. Use your email instead.')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('validates the three fields inline without calling the API', async () => {
    const { calls } = server();
    const u = userEvent.setup();
    renderSignUp();
    await u.type(await screen.findByLabelText('Email'), 'aline@');
    await u.type(screen.getByLabelText('Password'), 'short');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your name (at least 2 letters).')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address, like name@example.com.')).toBeInTheDocument();
    expect(screen.getAllByText('Use 8 or more characters.').length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url === '/api/auth/sign-up')).toBe(false);
  });

  it('creates the account and opens Check your email for that address, keeping next and the API wait', async () => {
    localStorage.setItem('jobprep.country', 'rw');
    localStorage.setItem('jobprep.guestTokens', JSON.stringify(['guesttoken-12345']));
    const { calls } = server();
    const u = userEvent.setup();
    renderSignUp('/sign-up?next=%2Frw%2Ftests');
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/verify-email?email=aline%40example.test&next=%2Frw%2Ftests'));
    expect(JSON.parse(String(calls.find((c) => c.url === '/api/auth/sign-up')?.init?.body))).toEqual({
      name: 'Aline Uwase', email: 'aline@example.test', password: 'Password123!', countryCode: 'RW', guestTokens: ['guesttoken-12345'],
    });
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state') ?? '{}')).toEqual({ cooldownSeconds: 45, expiresInSeconds: 600 });
  });

  it('409 account_exists: says so and keeps the form', async () => {
    server({ signUp: { status: 409, body: { error: 'account_exists' } } });
    const u = userEvent.setup();
    renderSignUp();
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This email address already has an account.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('Aline@Example.test');
  });

  it('the fromPaid variant names the test (next leads to its checkout)', async () => {
    server();
    renderSignUp('/sign-up?next=%2Frw%2Fcheckout%3Ftest%3Daccountant-mock-1');
    expect(await screen.findByRole('note')).toHaveTextContent(
      'After you create your account and finish setup, you’ll go straight to payment for Accountant (Public Institution) — Mock 1.',
    );
  });

  it('no note when the next page is not a payment', async () => {
    server();
    renderSignUp('/sign-up?next=%2Frw%2Ftests');
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('a signed-in person is sent on', async () => {
    localStorage.setItem('jobprep.session', '1');
    server();
    renderSignUp();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/progress'));
  });
});
