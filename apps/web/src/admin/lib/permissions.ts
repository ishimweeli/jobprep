import type { AdminRole, Permission, TeamMember } from '../api/types';

/**
 * What an admin sees follows their permissions (never the role's name): the API sends `permissions[]` with the
 * session and enforces the same rules again on every call. The role label is only for the sidebar's name block.
 */

export const ROLE_LABEL: Record<AdminRole, string> = { SYSTEM_ADMIN: 'System admin', CONTENT_EDITOR: 'Content editor', SUPPORT: 'Support' };

/** Where the admin area lives inside the web app. Every admin link and redirect starts here. */
export const ADMIN_BASE = '/admin';
/** The Overview: the admin home. */
export const ADMIN_HOME = ADMIN_BASE;

/**
 * One account can hold several roles: show every label, comma-separated, in the single role slot (sidebar, team list).
 * Falls back to the role code's own label when the API sent no label.
 */
export function rolesLabel(roles: readonly { code: string; label?: string }[] | undefined): string {
  return (roles ?? []).map((r) => r.label || ROLE_LABEL[r.code as AdminRole] || r.code).join(', ');
}

export type NavKey = 'overview' | 'users' | 'exams' | 'payments' | 'countries' | 'settings';

export interface NavItem {
  key: NavKey;
  label: string;
  /** The bottom bar's shorter word. */
  phoneLabel: string;
  to: string;
  permission: Permission;
  /** Stroke paths of the artboard icons (24x24 viewBox). */
  icon: string;
  phoneIcon: string;
}

const SETTINGS_ICON =
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z';
const COUNTRIES_ICON = 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20';

export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview', phoneLabel: 'Overview', to: ADMIN_HOME, permission: 'overview:read', icon: 'M3 13h8V3H3z M13 21h8V11h-8z M3 21h8v-6H3z M13 9h8V3h-8z', phoneIcon: 'M3 13h8V3H3z M13 21h8V11h-8z M3 21h8v-6H3z M13 9h8V3h-8z' },
  { key: 'users', label: 'Users', phoneLabel: 'Users', to: '/admin/users', permission: 'users:read', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8', phoneIcon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9' },
  { key: 'exams', label: 'Exams & questions', phoneLabel: 'Exams', to: '/admin/exams', permission: 'exams:read', icon: 'M9 3h6v3H9z M7 5H5v16h14V5h-2 M8 11h8 M8 15h5', phoneIcon: 'M9 3h6v3H9z M7 5H5v16h14V5h-2 M8 11h8 M8 15h5' },
  { key: 'payments', label: 'Payments', phoneLabel: 'Payments', to: '/admin/payments', permission: 'payments:read', icon: 'M3 6h18v13H3z M3 10h18', phoneIcon: 'M3 6h18v13H3z M3 10h18' },
  { key: 'countries', label: 'Countries', phoneLabel: 'Countries', to: '/admin/countries', permission: 'countries:read', icon: COUNTRIES_ICON, phoneIcon: COUNTRIES_ICON },
  { key: 'settings', label: 'Settings', phoneLabel: 'Settings', to: '/admin/settings', permission: 'settings:write', icon: SETTINGS_ICON, phoneIcon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 2v3 M12 19v3 M4.2 4.2l2.1 2.1 M17.7 17.7l2.1 2.1 M2 12h3 M19 12h3 M4.2 19.8l2.1-2.1 M17.7 6.3l2.1-2.1' },
];

export const can = (permissions: readonly Permission[], p: Permission): boolean => permissions.includes(p);

/**
 * The navigation an admin gets. Desktop: every allowed item. Phone: the artboard's five (Overview, Users, Exams,
 * Payments, Settings); Countries is reached from Settings there, so it only appears in the bar for an admin who
 * cannot open Settings.
 */
export function visibleNav(permissions: readonly Permission[], mode: 'desktop' | 'phone'): NavItem[] {
  const allowed = NAV_ITEMS.filter((i) => can(permissions, i.permission));
  if (mode === 'desktop') return allowed;
  const canSettings = can(permissions, 'settings:write');
  return allowed.filter((i) => i.key !== 'countries' || !canSettings);
}

/** The nav item a path belongs to (`/admin/users/abc` -> users). */
export function navItemFor(pathname: string): NavItem | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === ADMIN_HOME || path === '' || path === '/') return NAV_ITEMS[0];
  return NAV_ITEMS.find((i) => i.to !== ADMIN_HOME && (path === i.to || path.startsWith(`${i.to}/`)));
}

export function canOpen(pathname: string, permissions: readonly Permission[]): boolean {
  const item = navItemFor(pathname);
  return !!item && can(permissions, item.permission);
}

/** Where a direct URL the role cannot use goes: the first page it may use (the "no access" screen is undesigned). */
export function firstAllowedPath(permissions: readonly Permission[]): string | null {
  return NAV_ITEMS.find((i) => can(permissions, i.permission))?.to ?? null;
}

/** The role slot of a team row: every active role's label, comma-separated; the legacy single-role label as a fallback. */
export function teamRoleLabel(member: Pick<TeamMember, 'role' | 'roleLabel' | 'roles'>): string {
  const roles = member.roles ?? [];
  const active = roles.filter((r) => r.active);
  const shown = rolesLabel(active.length ? active : roles);
  return shown || member.roleLabel || ROLE_LABEL[member.role];
}

export const hasSeveralRoles = (member: Pick<TeamMember, 'roles'>): boolean => (member.roles ?? []).filter((r) => r.active).length > 1;

/** The nav item a role lands on (the "Go to ..." link of the no-access page). */
export function firstAllowedItem(permissions: readonly Permission[]): NavItem | undefined {
  return NAV_ITEMS.find((i) => can(permissions, i.permission));
}

/** Which roles hold which permission (mirrors the API's table in apps/api/src/domain/permissions.ts; the API still decides). */
const ROLE_HAS: Record<AdminRole, readonly Permission[]> = {
  SYSTEM_ADMIN: ['overview:read', 'users:read', 'users:manage', 'otp:resend', 'exams:read', 'exams:write', 'reports:resolve', 'payments:read', 'payments:check', 'payments:grant', 'countries:read', 'countries:write', 'settings:write', 'audit:read', 'admins:manage'],
  CONTENT_EDITOR: ['overview:read', 'exams:read', 'exams:write', 'reports:resolve'],
  SUPPORT: ['overview:read', 'users:read', 'otp:resend', 'payments:read', 'payments:check'],
};

/** "System admin" or "Content editor or System admin": the roles that may do this. */
export function rolesThatCan(p: Permission): string {
  const order: AdminRole[] = ['SUPPORT', 'CONTENT_EDITOR', 'SYSTEM_ADMIN'];
  return order.filter((r) => ROLE_HAS[r].includes(p)).map((r) => ROLE_LABEL[r]).join(' or ');
}

/**
 * The words under a button this role may not use (A17): "Only a System admin can do this." Returns undefined when the
 * permission is held, so `whyDisabled={denyHint(admin.permissions, 'users:manage')}` is all a screen needs.
 */
export function denyHint(held: readonly Permission[], p: Permission, what = 'do this'): string | undefined {
  if (can(held, p)) return undefined;
  const who = rolesThatCan(p);
  return `Only ${/^[AEIOU]/i.test(who) ? 'an' : 'a'} ${who} can ${what}.`;
}
