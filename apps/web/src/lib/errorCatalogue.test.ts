import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { authErrorMessage } from './errorCopy';
import { CATALOGUED_CODES, errorCopy, errorMessage } from './errorCatalogue';

const err = (code: string, status = 400, retry: number | null = null) => new ApiError(status, code, {}, retry);

describe('error catalogue (C28)', () => {
  it('every catalogued code has a friendly line and never shows the raw code', () => {
    for (const code of CATALOGUED_CODES) {
      const c = errorCopy(err(code, 400, 40));
      expect(c.message.length).toBeGreaterThan(10);
      expect(c.message).not.toContain('_');
      expect(c.message.endsWith('.')).toBe(true);
    }
  });
  it('wait before resending names the time', () => {
    expect(errorCopy(err('too_many_attempts', 429, 40)).message).toBe('Too many wrong tries. Try again in 40 s.');
    expect(errorCopy(err('otp_cooldown', 429, 31)).message).toBe('Please wait 0:31 before asking for another code.');
    expect(errorCopy(err('other', 429, 125)).message).toBe('Try again in 2:05.');
  });
  it('account exists offers sign in; full access offers Full Access; exam ended offers the results', () => {
    expect(errorCopy(err('account_exists', 409))).toEqual({ message: 'This email address already has an account.', action: 'sign_in' });
    expect(errorCopy(err('full_access_required', 402)).action).toBe('full_access');
    expect(errorCopy(err('attempt_closed', 409)).action).toBe('results');
    expect(errorCopy(err('sign_in_required', 401)).action).toBe('sign_in');
  });
  it('every payment ending says the person was not charged', () => {
    for (const code of ['payment_method_unavailable', 'checkout_unavailable', 'provider_unavailable', 'payment_declined']) {
      expect(errorMessage(err(code))).toContain('You were not charged.');
    }
  });
  it('unknown codes fall back by status, a non-API error is generic', () => {
    expect(errorMessage(err('weird', 500))).toBe('Something went wrong on our side. Please try again in a moment.');
    expect(errorMessage(err('weird', 404))).toBe('Something went wrong. Please try again.');
    expect(errorMessage(new Error('x'))).toBe('Something went wrong. Please try again.');
  });
  it('the older authErrorMessage goes through the catalogue', () => {
    expect(authErrorMessage(err('full_access_required', 402))).toBe(errorMessage(err('full_access_required', 402)));
    expect(authErrorMessage(err('account_exists', 409))).toBe('This email address already has an account.');
  });
});
