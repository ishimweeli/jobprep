import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testSession, testUser } from '../../test/fixtures';
import { mockFetch } from '../../test/utils';
import { VerifyEmailPage } from './VerifyEmailPage';

function Where() {
  const l = useLocation();
  return <div data-testid="where">{`${l.pathname}${l.search}`}</div>;
}

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
function server(opts: { verify?: Reply[]; resend?: Reply; user?: Parameters<typeof testUser>[0] } = {}) {
  const verify = [...(opts.verify ?? [{ body: { user: testUser(opts.user), claimedAttempts: 0 } }])];
  return mockFetch((url, init) => {
    if (url === '/api/auth/verify-email' && init?.method === 'POST') return verify.length > 1 ? verify.shift()! : verify[0]!;
    if (url === '/api/auth/verify-email/resend' && init?.method === 'POST') return opts.resend ?? { body: { cooldownSeconds: 45, expiresInSeconds: 600 } };
    if (url === '/api/me') return { body: testSession(opts.user) };
    return undefined;
  });
}

function renderVerify(entry: string | { pathname: string; search: string; state: unknown } = '/verify-email?email=aline%40example.test') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const paste = (code: string) => fireEvent.paste(screen.getByLabelText('Digit 1'), { clipboardData: { getData: () => code } });
const verifyBtn = () => screen.getByRole('button', { name: 'Verify' });
const sent = { pathname: '/verify-email', search: '?email=aline%40example.test', state: { cooldownSeconds: 45, expiresInSeconds: 600 } };

describe('Check your email (VerifyEmail.dc)', () => {
  it('draws the heading with the address, six boxes, Verify, the two links and the footnote', () => {
    server();
    renderVerify(sent);
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/We sent a 6-digit code to/)).toHaveTextContent('We sent a 6-digit code to aline@example.test.');
    for (let i = 1; i <= 6; i++) expect(screen.getByLabelText(`Digit ${i}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use a different email' })).toHaveAttribute('href', '/sign-up');
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/sign-up');
    expect(screen.getByText('The code works for 10 minutes. Check your spam folder if you don’t see it.')).toBeInTheDocument();
  });

  it('the footnote uses the real lifetime from the API', () => {
    server();
    renderVerify({ ...sent, state: { cooldownSeconds: 45, expiresInSeconds: 300 } });
    expect(screen.getByText('The code works for 5 minutes. Check your spam folder if you don’t see it.')).toBeInTheDocument();
  });

  it('without an address it goes back to sign-up', () => {
    server();
    renderVerify('/verify-email');
    expect(screen.getByTestId('where')).toHaveTextContent('/sign-up');
  });

  it('asks for all six digits before calling the API', async () => {
    const { calls } = server();
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderVerify(sent);
    paste('123');
    await u.click(verifyBtn());
    expect(await screen.findByText('Enter all 6 digits of the code.')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/auth/verify-email')).toBe(false);
  });

  it('verifies, signs in and continues to the setup step the API names', async () => {
    localStorage.setItem('jobprep.guestTokens', JSON.stringify(['guesttoken-12345']));
    const { calls } = server({ user: { onboarding: { done: false, nextStep: 'country' } } });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderVerify({ ...sent, search: '?email=aline%40example.test&next=%2Frw%2Fcheckout%3Ftest%3Dx' });
    paste('482913');
    await u.click(verifyBtn());
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/setup/country?next=%2Frw%2Fcheckout%3Ftest%3Dx'));
    expect(JSON.parse(String(calls.find((c) => c.url === '/api/auth/verify-email')?.init?.body))).toEqual({ email: 'aline@example.test', code: '482913', guestTokens: ['guesttoken-12345'] });
    expect(localStorage.getItem('jobprep.session')).toBe('1');
  });

  it('a wrong code shows the tries left from the API and clears the boxes', async () => {
    server({ verify: [{ status: 400, body: { error: 'invalid_code', triesLeft: 3 } }] });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderVerify(sent);
    paste('123456');
    await u.click(verifyBtn());
    expect(await screen.findByText('That code is not right')).toBeInTheDocument();
    expect(screen.getByText('Check your email and try again. 3 tries left.')).toBeInTheDocument();
    expect(screen.getByLabelText('Digit 1')).toHaveValue('');
    expect(screen.getByLabelText('Digit 1')).toHaveAttribute('aria-invalid', 'true');
  });

  it('too many tries locks Verify until a new code is requested', async () => {
    const { calls } = server({ verify: [{ status: 429, body: { error: 'too_many_attempts' } }] });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderVerify(sent);
    paste('123456');
    await u.click(verifyBtn());
    expect(await screen.findByText('Too many tries')).toBeInTheDocument();
    expect(verifyBtn()).toHaveAttribute('aria-disabled', 'true');
    paste('654321');
    await u.click(verifyBtn());
    expect(calls.filter((c) => c.url === '/api/auth/verify-email')).toHaveLength(1);
  });

  it('an expired code says so and asks for a new one', async () => {
    server({ verify: [{ status: 400, body: { error: 'code_expired' } }] });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderVerify(sent);
    paste('123456');
    await u.click(verifyBtn());
    expect(await screen.findByText('This code has expired')).toBeInTheDocument();
    expect(screen.getByText('Codes work for 10 minutes. Send a new one below.')).toBeInTheDocument();
  });

  it('Send a new code waits out the API cooldown, then resends and restarts the wait', async () => {
    const { calls } = server();
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderVerify(sent);
    expect(screen.getByRole('button', { name: 'Send a new code in 0:45' })).toBeDisabled();
    act(() => void vi.advanceTimersByTime(46_000));
    const btn = screen.getByRole('button', { name: 'Send a new code' });
    expect(btn).toBeEnabled();
    await u.click(btn);
    expect(await screen.findByText('We sent you a new code.')).toBeInTheDocument();
    expect(JSON.parse(String(calls.find((c) => c.url === '/api/auth/verify-email/resend')?.init?.body))).toEqual({ email: 'aline@example.test' });
    expect(screen.getByRole('button', { name: 'Send a new code in 0:45' })).toBeDisabled();
  });

  it('a 429 on resend restarts the countdown from Retry-After', async () => {
    server({ resend: { status: 429, body: { error: 'otp_cooldown' }, headers: { 'Retry-After': '31' } } });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderVerify({ ...sent, state: { cooldownSeconds: 0, expiresInSeconds: 600 } });
    await u.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText('You can ask for another code in 0:31.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a new code in 0:31' })).toBeDisabled();
  });
});
