import { describe, expect, it } from 'vitest';
import { paidTestFromNext, safeNext, setupPath, signInPathFor, signUpPathFor, verifyEmailPath } from './next';

describe('safeNext', () => {
  it('keeps same-site paths only', () => {
    expect(safeNext('/rw/checkout?test=a')).toBe('/rw/checkout?test=a');
    for (const bad of ['//evil.test', 'https://evil.test', '/\\evil', '/javascript:alert(1)', '', null, undefined]) expect(safeNext(bad as string | null)).toBeNull();
  });
});

describe('auth paths keep ?next=', () => {
  it('setup, verify-email, sign-in and sign-up', () => {
    expect(setupPath('goal')).toBe('/setup/goal');
    expect(setupPath('category', '/rw/checkout?test=a')).toBe('/setup/category?next=%2Frw%2Fcheckout%3Ftest%3Da');
    expect(verifyEmailPath('a@b.test')).toBe('/verify-email?email=a%40b.test');
    expect(verifyEmailPath('a@b.test', '/rw/tests')).toBe('/verify-email?email=a%40b.test&next=%2Frw%2Ftests');
    expect(signInPathFor('/rw/tests', { error: 'google_failed' })).toBe('/sign-in?error=google_failed&next=%2Frw%2Ftests');
    expect(signInPathFor(null)).toBe('/sign-in');
    expect(signUpPathFor('//evil.test')).toBe('/sign-up');
  });
});

describe('paidTestFromNext (the fromPaid variants)', () => {
  it('recognises a checkout with a test', () => {
    expect(paidTestFromNext('/rw/checkout?test=accountant-mock-1')).toEqual({ country: 'rw', testSlug: 'accountant-mock-1' });
  });
  it('anything else is not "from a paid test"', () => {
    expect(paidTestFromNext('/rw/checkout')).toBeNull();
    expect(paidTestFromNext('/rw/results/a1')).toBeNull();
    expect(paidTestFromNext('//evil.test/rw/checkout?test=x')).toBeNull();
    expect(paidTestFromNext(null)).toBeNull();
  });
});
