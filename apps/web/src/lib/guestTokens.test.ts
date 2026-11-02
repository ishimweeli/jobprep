import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch } from '../test/utils';
import { api } from '../api/client';
import { addGuestToken, guestTokenHeader, readGuestTokens } from './guestTokens';
import { safeNext, signUpPath } from './next';

afterEach(() => vi.unstubAllGlobals());

describe('guest tokens', () => {
  it('keeps tokens in localStorage as an array, newest first, without duplicates', () => {
    addGuestToken('token-aaaaaaaa');
    addGuestToken('token-bbbbbbbb');
    addGuestToken('token-aaaaaaaa');
    expect(readGuestTokens()).toEqual(['token-aaaaaaaa', 'token-bbbbbbbb']);
    expect(JSON.parse(localStorage.getItem('jobprep.guestTokens')!)).toEqual(['token-aaaaaaaa', 'token-bbbbbbbb']);
  });

  it('caps at 20 and ignores junk', () => {
    for (let i = 0; i < 25; i++) addGuestToken(`token-${String(i).padStart(8, '0')}`);
    expect(readGuestTokens()).toHaveLength(20);
    addGuestToken('short');
    expect(readGuestTokens()).not.toContain('short');
    localStorage.setItem('jobprep.guestTokens', '{not json');
    expect(readGuestTokens()).toEqual([]);
  });

  it('is sent as X-Guest-Token (comma-joined) on API calls, and not at all without tokens', async () => {
    const { calls } = mockFetch(() => ({ body: {} }));
    await api('/x');
    expect((calls[0]?.init?.headers as Record<string, string>)['X-Guest-Token']).toBeUndefined();
    addGuestToken('token-aaaaaaaa');
    addGuestToken('token-bbbbbbbb');
    await api('/x');
    expect((calls[1]?.init?.headers as Record<string, string>)['X-Guest-Token']).toBe('token-bbbbbbbb,token-aaaaaaaa');
    expect(guestTokenHeader()).toBe('token-bbbbbbbb,token-aaaaaaaa');
  });
});

describe('sign-up return path', () => {
  it('round-trips a same-site path', () => {
    expect(signUpPath('/rw/checkout?test=a')).toBe('/sign-up?next=%2Frw%2Fcheckout%3Ftest%3Da');
    expect(safeNext('/rw/checkout?test=a')).toBe('/rw/checkout?test=a');
  });
  it('refuses anything that could leave the site', () => {
    for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/\\evil', 'rw/checkout', '', null, undefined]) {
      expect(safeNext(bad as string | null)).toBeNull();
    }
  });
});
