import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch } from '../test/utils';
import { checkResetToken, googleStartUrl, resendVerification, signIn, signUp, verifyEmail } from './auth';

afterEach(() => vi.unstubAllGlobals());

describe('googleStartUrl (browser navigation to /api/auth/google/start)', () => {
  it('carries next and the country code', () => {
    expect(googleStartUrl({ next: '/rw/checkout?test=a', countryCode: 'rw' })).toBe('/api/auth/google/start?next=%2Frw%2Fcheckout%3Ftest%3Da&countryCode=RW');
    expect(googleStartUrl({})).toBe('/api/auth/google/start');
  });
});

describe('auth calls', () => {
  it('sign-up does not remember a session (no cookie yet); verify-email and sign-in do', async () => {
    mockFetch((url) => {
      if (url === '/api/auth/sign-up') return { status: 201, body: { status: 'verification_required', email: 'a@b.test', cooldownSeconds: 45, expiresInSeconds: 600 } };
      return { body: { user: { id: 'u' }, claimedAttempts: 0 } };
    });
    await signUp({ name: 'A B', email: 'a@b.test', password: 'Password123!', guestTokens: [] });
    expect(localStorage.getItem('jobprep.session')).toBeNull();
    await verifyEmail({ email: 'a@b.test', code: '123456', guestTokens: [] });
    expect(localStorage.getItem('jobprep.session')).toBe('1');
    localStorage.clear();
    await signIn({ email: 'a@b.test', password: 'x', remember: false, guestTokens: [] });
    expect(localStorage.getItem('jobprep.session')).toBe('1');
  });

  it('uses the contract paths and bodies', async () => {
    const { calls } = mockFetch(() => ({ body: { email: 'a@b.test', cooldownSeconds: 1, expiresInSeconds: 2 } }));
    await resendVerification('a@b.test');
    await checkResetToken('t k');
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual(['POST /api/auth/verify-email/resend', 'GET /api/auth/reset-password/check?token=t+k']);
  });
});
