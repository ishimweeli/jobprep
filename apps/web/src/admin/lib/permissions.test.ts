import { describe, expect, it } from 'vitest';
import type { Permission } from '../api/types';
import { canOpen, firstAllowedPath, navItemFor, visibleNav } from './permissions';

// What the API sends for each seeded role (apps/api/src/domain/permissions.ts).
const SYSTEM: Permission[] = ['overview:read', 'users:read', 'users:manage', 'otp:resend', 'exams:read', 'exams:write', 'reports:resolve', 'payments:read', 'payments:check', 'payments:grant', 'countries:read', 'countries:write', 'settings:write', 'audit:read', 'admins:manage'];
const EDITOR: Permission[] = ['overview:read', 'exams:read', 'exams:write', 'reports:resolve'];
const SUPPORT: Permission[] = ['overview:read', 'users:read', 'otp:resend', 'payments:read', 'payments:check'];

const labels = (p: Permission[], mode: 'desktop' | 'phone') => visibleNav(p, mode).map((i) => i.label);

describe('navigation follows the permissions', () => {
  it('system admin sees all six on desktop', () => {
    expect(labels(SYSTEM, 'desktop')).toEqual(['Overview', 'Users', 'Exams & questions', 'Payments', 'Countries', 'Settings']);
  });
  it('content editor: Overview and Exams & questions', () => {
    expect(labels(EDITOR, 'desktop')).toEqual(['Overview', 'Exams & questions']);
    expect(labels(EDITOR, 'phone')).toEqual(['Overview', 'Exams & questions']);
  });
  it('support: Overview, Users, Payments', () => {
    expect(labels(SUPPORT, 'desktop')).toEqual(['Overview', 'Users', 'Payments']);
  });
  it('the phone bar is the five of the artboard (Countries is reached from Settings)', () => {
    expect(visibleNav(SYSTEM, 'phone').map((i) => i.phoneLabel)).toEqual(['Overview', 'Users', 'Exams', 'Payments', 'Settings']);
  });
  it('an admin who can read countries but not open Settings still gets Countries in the phone bar', () => {
    expect(labels(['overview:read', 'countries:read'], 'phone')).toEqual(['Overview', 'Countries']);
  });
  it('is driven by permissions, not by a role name', () => {
    expect(labels(['overview:read', 'payments:read'], 'desktop')).toEqual(['Overview', 'Payments']);
  });
});

describe('direct URLs', () => {
  it('finds the page of a path', () => {
    expect(navItemFor('/admin')?.key).toBe('overview');
    expect(navItemFor('/admin/users/abc')?.key).toBe('users');
    expect(navItemFor('/admin/exams/t1/q/q1')?.key).toBe('exams');
    expect(navItemFor('/admin/settings/audit')?.key).toBe('settings');
    expect(navItemFor('/nope')).toBeUndefined();
  });
  it('a role cannot open what it has no permission for', () => {
    expect(canOpen('/admin/users', EDITOR)).toBe(false);
    expect(canOpen('/admin/exams/t1', EDITOR)).toBe(true);
    expect(canOpen('/admin/payments', EDITOR)).toBe(false);
    expect(canOpen('/admin/settings', SUPPORT)).toBe(false);
    expect(canOpen('/admin/countries', SUPPORT)).toBe(false);
    expect(canOpen('/admin/payments', SUPPORT)).toBe(true);
  });
  it('a forbidden URL goes to the first allowed page', () => {
    expect(firstAllowedPath(SYSTEM)).toBe('/admin');
    expect(firstAllowedPath(EDITOR)).toBe('/admin');
    expect(firstAllowedPath(['exams:read'])).toBe('/admin/exams');
    expect(firstAllowedPath([])).toBeNull();
  });
});
