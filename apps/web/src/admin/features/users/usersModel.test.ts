import { describe, expect, it } from 'vitest';
import { parseDays, summaryLine } from './usersModel';

describe('grant access: days', () => {
  it('accepts whole numbers from 1 to 365', () => {
    expect(parseDays('30')).toBe(30);
    expect(parseDays(' 1 ')).toBe(1);
    expect(parseDays('365')).toBe(365);
    for (const bad of ['', '0', '366', '2.5', '-3', 'abc']) expect(parseDays(bad)).toBeNull();
  });
});

describe('"Access will run until"', () => {
  const preview = { days: 30, startsAt: '2026-11-04T10:00:00Z', endsAt: '2026-12-04T10:00:00Z', currentEndsAt: null };
  it('uses the server preview', () => {
    expect(summaryLine(30, preview)).toBe('Access will run until 4 Dec 2026');
  });
  it('says the new days are added after current access', () => {
    expect(summaryLine(30, { ...preview, currentEndsAt: '2026-11-20T10:00:00Z' })).toBe(
      'Access will run until 4 Dec 2026 (it is added after their current access, which ends 20 Nov 2026)',
    );
  });
  it('falls back to a plain sentence when there is no preview, or it is for other days', () => {
    expect(summaryLine(30, undefined)).toBe('Access will run for 30 days, added after any access they still have.');
    expect(summaryLine(7, preview)).toBe('Access will run for 7 days, added after any access they still have.');
    expect(summaryLine(1, undefined)).toContain('1 day,');
    expect(summaryLine(null, undefined)).toMatch(/Enter the number of days/);
  });
});
