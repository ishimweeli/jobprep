import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import {
  afterSetupPath, categoryCode, formatExamDate, parseExamDate, passwordAcceptable, passwordRules, postAuthPath, setupPaidText, signInError, signUpPaidText,
} from './authModel';

describe('password rules (ResetPassword.dc)', () => {
  it('two live rules: at least 8 characters, both passwords match', () => {
    expect(passwordRules('', '')).toEqual([
      { id: 'length', label: 'At least 8 characters', ok: false },
      { id: 'match', label: 'Both passwords match', ok: false },
    ]);
    expect(passwordRules('abcdefgh', '').map((r) => r.ok)).toEqual([true, false]);
    expect(passwordRules('abcdefg', 'abcdefg').map((r) => r.ok)).toEqual([false, true]);
    expect(passwordRules('abcdefgh', 'abcdefgh').map((r) => r.ok)).toEqual([true, true]);
  });
  it('is acceptable only when both rules pass', () => {
    expect(passwordAcceptable('abcdefgh', 'abcdefgx')).toBe(false);
    expect(passwordAcceptable('short', 'short')).toBe(false);
    expect(passwordAcceptable('Password123!', 'Password123!')).toBe(true);
  });
});

describe('sign-in error boxes (SignIn.dc)', () => {
  it('401 invalid_credentials: "Email or password is incorrect"', () => {
    expect(signInError(new ApiError(401, 'invalid_credentials'))).toEqual({
      kind: 'invalid_credentials',
      title: 'Email or password is incorrect',
      body: 'Check them and try again, or reset your password.',
    });
  });
  it('403 email_not_verified: "Please verify your email first"', () => {
    expect(signInError(new ApiError(403, 'email_not_verified'))).toEqual({
      kind: 'email_not_verified',
      title: 'Please verify your email first',
      body: 'We sent a code when you signed up. Tap “Resend verification” to get a new one.',
    });
  });
  it('429 too_many_attempts: 15 minutes unless the API says otherwise', () => {
    expect(signInError(new ApiError(429, 'too_many_attempts'))).toMatchObject({ title: 'Too many tries', body: 'For your security, wait 15 minutes, or reset your password.' });
    expect(signInError(new ApiError(429, 'too_many_attempts', {}, 900)).body).toBe('For your security, wait 15 minutes, or reset your password.');
    expect(signInError(new ApiError(429, 'too_many_attempts', {}, 241)).body).toBe('For your security, wait 5 minutes, or reset your password.');
    expect(signInError(new ApiError(429, 'too_many_attempts', {}, 30)).body).toBe('For your security, wait 1 minute, or reset your password.');
  });
  it('suspended, offline, server and unknown failures', () => {
    expect(signInError(new ApiError(403, 'account_suspended')).title).toBe('This account is suspended');
    expect(signInError(new ApiError(0, 'network_error')).title).toBe('You seem to be offline');
    expect(signInError(new ApiError(500, 'internal_error')).body).toMatch(/on our side/);
    expect(signInError(new Error('x')).title).toBe('Something went wrong');
  });
  it('never says whether an account exists', () => {
    for (const code of ['invalid_credentials', 'email_not_verified']) {
      const b = signInError(new ApiError(401, code));
      expect(`${b.title} ${b.body}`).not.toMatch(/no account|not registered|does not exist/i);
    }
  });
});

describe('where to go after signing in (setup step routing)', () => {
  const user = (nextStep: 'country' | 'category' | 'goal' | null) => ({ countryCode: 'RW', onboarding: { done: nextStep === null, nextStep } });
  it('goes to the setup step the API says is next', () => {
    expect(postAuthPath(user('country'), null)).toBe('/setup/country');
    expect(postAuthPath(user('category'), null)).toBe('/setup/category');
    expect(postAuthPath(user('goal'), null)).toBe('/setup/goal');
  });
  it('keeps ?next= through the steps', () => {
    expect(postAuthPath(user('country'), '/rw/checkout?test=a-b')).toBe('/setup/country?next=%2Frw%2Fcheckout%3Ftest%3Da-b');
  });
  it('with setup done: next, or the dashboard of the person’s country', () => {
    expect(postAuthPath(user(null), '/rw/tests')).toBe('/rw/tests');
    expect(postAuthPath(user(null), null)).toBe('/rw/progress');
    expect(postAuthPath({ countryCode: 'KE', onboarding: { done: true, nextStep: null } }, null)).toBe('/ke/progress');
  });
  it('after the last step: next (the paid test’s checkout) or the dashboard', () => {
    expect(afterSetupPath({ countryCode: 'RW' }, '/rw/checkout?test=x')).toBe('/rw/checkout?test=x');
    expect(afterSetupPath({ countryCode: 'RW' }, null)).toBe('/rw/progress');
  });
});

describe('"from a paid test" copy (SignUp.dc, OnboardGoal.dc)', () => {
  it('uses the artboard sentences with the real test title', () => {
    expect(signUpPaidText('Accountant (Public Institution) — Mock 1')).toBe(
      'After you create your account and finish setup, you’ll go straight to payment for Accountant (Public Institution) — Mock 1.',
    );
    expect(setupPaidText('Accountant (Public Institution) — Mock 1')).toBe('Next: payment for Accountant (Public Institution) — Mock 1. You can change these choices later.');
  });
});

describe('exam date (OnboardGoal.dc: "e.g. 14 Dec 2026")', () => {
  it('turns what people type into YYYY-MM-DD', () => {
    expect(parseExamDate('14 Dec 2026')).toBe('2026-12-14');
    expect(parseExamDate(' 4 december 2026 ')).toBe('2026-12-04');
    expect(parseExamDate('2026-12-14')).toBe('2026-12-14');
    expect(parseExamDate('')).toBeNull();
  });
  it('rejects what is not a real date', () => {
    expect(parseExamDate('31 Feb 2026')).toBe('invalid');
    expect(parseExamDate('soon')).toBe('invalid');
    expect(parseExamDate('14 Foo 2026')).toBe('invalid');
  });
  it('formats a saved date back for the box', () => {
    expect(formatExamDate('2026-12-14')).toBe('14 Dec 2026');
    expect(formatExamDate(null)).toBe('');
  });
});

describe('category badge', () => {
  it('is the first two letters', () => {
    expect(categoryCode('Teaching positions')).toBe('TE');
    expect(categoryCode('Accounting & finance')).toBe('AC');
  });
});
