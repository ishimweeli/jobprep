import { describe, expect, it } from 'vitest';
import { currentRole, parseDays, roleChange, summaryLine } from './usersModel';

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

describe('role change (users list and panel)', () => {
  const who = { id: 'u1', name: 'Abel Kwizera', email: 'Abel@Example.com' };
  it('reads the current role from the roles the list sends', () => {
    expect(currentRole(undefined)).toBe('NONE');
    expect(currentRole([])).toBe('NONE');
    expect(currentRole(['SUPPORT'])).toBe('SUPPORT');
  });
  it('candidate → role is an invite for their address, role → role moves the assignment, role → candidate removes it', () => {
    expect(roleChange(who, 'NONE', 'SYSTEM_ADMIN', 'because')).toEqual({ kind: 'invite', body: { name: 'Abel Kwizera', email: 'abel@example.com', role: 'SYSTEM_ADMIN', countryScope: [], reason: 'because' } });
    expect(roleChange(who, 'SUPPORT', 'CONTENT_EDITOR', 'because')).toEqual({ kind: 'patch', id: 'u1', body: { role: 'SUPPORT', newRole: 'CONTENT_EDITOR', reason: 'because' } });
    expect(roleChange(who, 'SUPPORT', 'NONE', 'because')).toEqual({ kind: 'patch', id: 'u1', body: { role: 'SUPPORT', active: false, reason: 'because' } });
  });
  it('does nothing when the role is unchanged', () => {
    expect(roleChange(who, 'SUPPORT', 'SUPPORT', 'because')).toBeNull();
    expect(roleChange(who, 'NONE', 'NONE', 'because')).toBeNull();
  });
});
