import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { SignInPage } from './SignInPage';

const countries = {
  countries: [{ code: 'RW', slug: 'rw', name: 'Rwanda', status: 'LIVE', dialCode: '+250', currencyCode: 'RWF', languages: ['en', 'rw'], selectable: true }],
};
const user = { id: 'u1', name: 'Aline Uwase', phone: '+250788123456', countryCode: 'RW', goalCategoryId: null, language: 'en' };

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}</div>;
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
function server(opts: { request?: Reply[]; verify?: Reply[] }) {
  const request = [...(opts.request ?? [{ body: { cooldownSeconds: 45, expiresInSeconds: 300 } }])];
  const verify = [...(opts.verify ?? [])];
  return mockFetch((url, init) => {
    if (url === '/api/countries') return { body: countries };
    if (url === '/api/auth/otp/request') return request.length > 1 ? request.shift()! : request[0]!;
    if (url === '/api/auth/sign-in' && init?.method === 'POST') return verify.length > 1 ? verify.shift()! : verify[0]!;
    if (url === '/api/me') return { body: { user, country: { code: 'RW', name: 'Rwanda', currencyCode: 'RWF', languages: ['en'] }, access: { current: null, expired: null, otherCountries: [] } } };
    return undefined;
  });
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function toCodeStep(u: ReturnType<typeof userEvent.setup>) {
  await u.type(await screen.findByLabelText('Phone number'), '788123456');
  await u.click(screen.getByRole('button', { name: 'Send code' }));
  await screen.findByRole('heading', { name: 'Enter your code' });
}
const type = (code: string) => fireEvent.paste(screen.getByLabelText('Digit 1'), { clipboardData: { getData: () => code } });
const verifyBtn = () => screen.getByRole('button', { name: 'Verify and sign in' });

describe('sign-in screen (SignIn.dc)', () => {
  it('rejects a short number inline without calling the API', async () => {
    const { calls } = server({});
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn();
    await u.type(await screen.findByLabelText('Phone number'), '78812');
    await u.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter a 9-digit Rwanda number, like 788 123 456.')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/auth/otp/request')).toBe(false);
  });

  it('asks for a sign-in code, shows the real lifetime, and counts down the API resend wait', async () => {
    const { calls } = server({});
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn();
    await toCodeStep(u);
    const req = calls.find((c) => c.url === '/api/auth/otp/request');
    expect(JSON.parse(String(req?.init?.body))).toEqual({ purpose: 'sign_in', phone: '+250788123456', countryCode: 'RW' });
    expect(screen.getByText(/has a JobPrep account, a code is on its way by SMS\. It works for 5 minutes\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend code in 0:45' })).toBeDisabled();
    act(() => void vi.advanceTimersByTime(46_000));
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
  });

  it('a wrong code shows the tries left from the API and clears the boxes', async () => {
    server({ verify: [{ status: 400, body: { error: 'invalid_code', triesLeft: 3 } }] });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn();
    await toCodeStep(u);
    type('123456');
    await u.click(verifyBtn());
    expect(await screen.findByText('That code is not right')).toBeInTheDocument();
    expect(screen.getByText('Check the SMS and try again. 3 tries left.')).toBeInTheDocument();
    expect((screen.getByLabelText('Digit 1') as HTMLInputElement).value).toBe('');
  });

  it('too_many_attempts: "Request a new code", Verify is locked, resend follows the normal countdown', async () => {
    const { calls } = server({ verify: [{ status: 400, body: { error: 'too_many_attempts', triesLeft: 0 } }] });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn();
    await toCodeStep(u);
    type('123456');
    await u.click(verifyBtn());
    expect(await screen.findByText('Too many tries')).toBeInTheDocument();
    expect(screen.getByText('Request a new code.')).toBeInTheDocument();
    expect(verifyBtn()).toHaveAttribute('aria-disabled', 'true');
    const verifyCalls = () => calls.filter((c) => c.url === '/api/auth/sign-in').length;
    const before = verifyCalls();
    type('654321');
    await u.click(verifyBtn());
    expect(verifyCalls()).toBe(before); // locked: no request goes out
    expect(screen.getByRole('button', { name: /Resend code in/ })).toBeDisabled();
    act(() => void vi.advanceTimersByTime(46_000));
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
  });

  it('code_expired: its own message with the real lifetime, and a new code unlocks everything', async () => {
    server({ verify: [{ status: 400, body: { error: 'code_expired' } }] });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn();
    await toCodeStep(u);
    type('123456');
    await u.click(verifyBtn());
    expect(await screen.findByText('This code has expired')).toBeInTheDocument();
    expect(screen.getByText('Codes work for 5 minutes. Send a new one below.')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(46_000));
    await u.click(screen.getByRole('button', { name: 'Send a new code' }));
    await waitFor(() => expect(screen.queryByText('This code has expired')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Resend code in/ })).toBeDisabled();
  });

  it('a 429 on resend becomes a friendly wait and restarts the countdown from the API seconds', async () => {
    server({
      request: [{ body: { cooldownSeconds: 1, expiresInSeconds: 300 } }, { status: 429, body: { error: 'otp_cooldown', retryAfterSeconds: 30 } }],
    });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn();
    await toCodeStep(u);
    act(() => void vi.advanceTimersByTime(2000));
    await u.click(screen.getByRole('button', { name: 'Resend code' }));
    expect(await screen.findByText('You can ask for another code in 0:30.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend code in 0:(29|30)/ })).toBeDisabled();
  });

  it('too many codes in an hour says to try later', async () => {
    server({ request: [{ status: 429, body: { error: 'otp_hourly_limit', retryAfterSeconds: 2400 } }] });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn();
    await u.type(await screen.findByLabelText('Phone number'), '788123456');
    await u.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('You have asked for too many codes. Try again in about 40 minutes.')).toBeInTheDocument();
  });

  it('offline: "You seem to be offline", tap Verify again', async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url === '/api/countries') return { body: countries };
      if (url === '/api/auth/otp/request') return { body: { cooldownSeconds: 45, expiresInSeconds: 300 } };
      return undefined;
    });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn();
    await toCodeStep(u);
    type('123456');
    await u.click(verifyBtn()); // the stub throws for /api/auth/sign-in: a network failure
    expect(await screen.findByText('You seem to be offline')).toBeInTheDocument();
    expect(screen.getByText('Check your connection, then tap Verify again.')).toBeInTheDocument();
  });

  it('a right code signs in and goes to the user\'s dashboard, or to a same-site ?next=', async () => {
    server({ verify: [{ body: { user, claimedAttempts: 0 } }] });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn('/sign-in?next=%2Frw%2Fcheckout%3Ftest%3Dx');
    await toCodeStep(u);
    type('123456');
    await u.click(verifyBtn());
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/checkout'));
    expect(localStorage.getItem('jobprep.session')).toBe('1');
  });

  it('ignores an off-site ?next=', async () => {
    server({ verify: [{ body: { user, claimedAttempts: 0 } }] });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn('/sign-in?next=https%3A%2F%2Fevil.example');
    await toCodeStep(u);
    type('123456');
    await u.click(verifyBtn());
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/rw/progress'));
  });

  it('"Use a different number" goes back, and the page links to sign-up', async () => {
    server({});
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSignIn();
    expect(await screen.findByRole('link', { name: 'Create a free account' })).toHaveAttribute('href', '/sign-up');
    await toCodeStep(u);
    await u.click(screen.getByRole('button', { name: 'Use a different number' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
