/**
 * Admin permissions. Enforced in the API (Phase 7) — roles are data, but this map is the
 * source the seed writes and the middleware checks against.
 */
export const PERMISSIONS = [
  'overview:read',
  'users:read',
  'users:manage', // grant / extend / suspend (reason required)
  'otp:resend',
  'exams:read',
  'exams:write', // categories, exams, sections, topics, questions, cases, CSV import
  'reports:resolve',
  'payments:read',
  'payments:check',
  'payments:grant', // manual grant (transaction ID required)
  'countries:read',
  'countries:write', // go-live, price, payment methods
  'settings:write',
  'audit:read',
  'admins:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type AdminRoleCode = 'SYSTEM_ADMIN' | 'CONTENT_EDITOR' | 'SUPPORT';

export const ROLE_PERMISSIONS: Record<AdminRoleCode, readonly Permission[]> = {
  SYSTEM_ADMIN: PERMISSIONS,
  CONTENT_EDITOR: ['overview:read', 'exams:read', 'exams:write', 'reports:resolve'],
  SUPPORT: ['overview:read', 'users:read', 'otp:resend', 'payments:read', 'payments:check'],
};

export const ROLE_LABELS: Record<AdminRoleCode, string> = {
  SYSTEM_ADMIN: 'System admin',
  CONTENT_EDITOR: 'Content editor',
  SUPPORT: 'Support',
};

export function can(role: AdminRoleCode, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Empty scope = all countries. A restricted editor may only touch their listed countries. */
export function inCountryScope(countryScope: string[], countryCode: string): boolean {
  return countryScope.length === 0 || countryScope.includes(countryCode);
}
