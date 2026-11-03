import { describe, expect, it } from 'vitest';
import type { ExamDetail } from '../api/types';
import { ApiError } from '../api/client';
import { authErrorMessage } from './errorCopy';
import { attemptScore, initials, languageList, mmss, passMarkDisplay, plural } from './format';
import { readGuestTokens } from './guestTokens';
import { isValidEmail, normalizeEmail } from './email';
import { formatPhone, groupNational, nationalDigits } from './phone';

describe('pass mark display rule', () => {
  it('shows an official pass mark only with percent AND source', () => {
    expect(passMarkDisplay({ passMark: { percent: 50, source: 'REB circular 2025' } })).toEqual({
      kind: 'official',
      percent: 50,
      source: 'REB circular 2025',
    });
  });
  it('never invents one', () => {
    expect(passMarkDisplay({ passMark: null })).toEqual({ kind: 'none' });
    expect(passMarkDisplay({ passMark: { percent: 50, source: '  ' } } as Pick<ExamDetail, 'passMark'>)).toEqual({ kind: 'none' });
  });
});

describe('format helpers', () => {
  it('formats lists, plurals, scores', () => {
    expect(languageList(['en', 'rw'])).toBe('English · Kinyarwanda');
    expect(plural(1, 'mock test')).toBe('1 mock test');
    expect(plural(12, 'mock test')).toBe('12 mock tests');
    expect(attemptScore({ id: 'a', submittedAt: null, scoreMarks: 31, totalMarks: 50, percent: 62, minutesUsed: 54 })).toBe('31 / 50 · 62%');
    expect(attemptScore({ id: 'a', submittedAt: null, scoreMarks: null, totalMarks: null, percent: null, minutesUsed: null })).toBe('—');
    expect(initials('Aline Uwase')).toBe('AU');
    expect(mmss(42)).toBe('0:42');
    expect(mmss(3600)).toBe('60:00');
  });
});

describe('phone helpers', () => {
  it('normalises national input', () => {
    expect(nationalDigits('0788 123 456', '+250')).toBe('788123456');
    expect(nationalDigits('+250 788 123 456', '+250')).toBe('788123456');
    expect(nationalDigits('788-123-456', '+250')).toBe('788123456');
  });
  it('formats a payer number for display', () => {
    expect(formatPhone('+250788123456', '+250')).toBe('+250 788 123 456');
    expect(groupNational('788123')).toBe('788 123');
  });
});

describe('email helpers', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Aline.Uwase@Example.COM ')).toBe('aline.uwase@example.com');
  });
  it('accepts plain addresses and rejects obvious mistakes', () => {
    expect(isValidEmail('aline@example.com')).toBe(true);
    expect(isValidEmail('  a.b+tag@mail.example.co.rw ')).toBe(true);
    for (const bad of ['', 'aline', 'aline@', '@example.com', 'aline@example', 'ali ne@example.com', 'a@b@example.com', 'aline@example.c']) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });
});

describe('auth error copy', () => {
  it('has friendly text for every auth error code', () => {
    for (const code of ['invalid_code', 'too_many_attempts', 'otp_cooldown', 'otp_hourly_limit', 'account_exists', 'invalid_email', 'country_required', 'account_suspended']) {
      const msg = authErrorMessage(new ApiError(400, code));
      expect(msg).not.toContain('_');
      expect(msg.length).toBeGreaterThan(10);
    }
    expect(authErrorMessage(new ApiError(429, 'otp_cooldown', {}, 42))).toContain('0:42');
  });
});

describe('guest tokens', () => {
  it('reads a clean array from jobprep.guestTokens', () => {
    expect(readGuestTokens()).toEqual([]);
    localStorage.setItem('jobprep.guestTokens', JSON.stringify(['abcdefgh1', 5, 'short']));
    expect(readGuestTokens()).toEqual(['abcdefgh1']);
    localStorage.setItem('jobprep.guestTokens', '{not json');
    expect(readGuestTokens()).toEqual([]);
  });
});
