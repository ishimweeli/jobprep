import type { AdminRole, InviteBody, TeamMember, TeamMemberRole, TeamPatch } from '../../api/types';
import { COUNTRY_NAMES } from '../../lib/format';
import { ROLE_LABEL } from '../../lib/permissions';

/** The admin team dialogs as a plain model (A13): invite, change a role or its countries, remove or bring back a role. */

export const ROLE_CHOICES: { value: AdminRole; label: string; help: string }[] = [
  { value: 'SYSTEM_ADMIN', label: 'System admin', help: 'Everything, in every country.' },
  { value: 'CONTENT_EDITOR', label: 'Content editor', help: 'Exams, questions and candidate reports only. Can be limited to some countries.' },
  { value: 'SUPPORT', label: 'Support', help: 'View users, send password resets, check payments. Can be limited to some countries.' },
];

export const scopeLabel = (scope: string[]): string => (scope.length === 0 ? 'All countries' : scope.map((c) => COUNTRY_NAMES[c] ?? c).join(', '));

/** Only these roles may be limited to countries (the API refuses it for a System admin). */
export const canScope = (role: AdminRole): boolean => role !== 'SYSTEM_ADMIN';

export interface InviteForm { name: string; email: string; role: AdminRole; countries: string[]; reason: string }
export const emptyInvite: InviteForm = { name: '', email: '', role: 'CONTENT_EDITOR', countries: [], reason: '' };

export interface InviteProblems { name?: string; email?: string }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInvite(f: Pick<InviteForm, 'name' | 'email'>): InviteProblems {
  const out: InviteProblems = {};
  if (f.name.trim().length < 2) out.name = 'Enter the person’s name (at least 2 characters).';
  if (!EMAIL.test(f.email.trim())) out.email = 'Enter a valid email address, like name@example.com.';
  return out;
}

export function inviteBody(f: InviteForm, reason: string): InviteBody {
  return { name: f.name.trim(), email: f.email.trim().toLowerCase(), role: f.role, countryScope: canScope(f.role) ? f.countries : [], reason };
}

/** The role assignments of a person, falling back to the legacy single-role fields of an older API. */
export function assignments(m: Pick<TeamMember, 'roles' | 'role' | 'roleLabel' | 'countryScope' | 'active'>): TeamMemberRole[] {
  if (m.roles && m.roles.length) return m.roles;
  return [{ code: m.role, label: m.roleLabel || ROLE_LABEL[m.role], countryScope: m.countryScope, active: m.active }];
}

/** `null` when nothing changed (the API refuses an empty change). */
export function editPatch(a: TeamMemberRole, next: { role: AdminRole; countries: string[] }, reason: string): TeamPatch | null {
  const patch: TeamPatch = { role: a.code, reason };
  const scope = canScope(next.role) ? next.countries : [];
  const same = scope.length === a.countryScope.length && scope.every((c) => a.countryScope.includes(c));
  let changed = false;
  if (next.role !== a.code) { patch.newRole = next.role; changed = true; }
  if (!same) { patch.countryScope = scope; changed = true; }
  return changed ? patch : null;
}

export const removePatch = (a: TeamMemberRole, reason: string): TeamPatch => ({ role: a.code, active: false, reason });
export const restorePatch = (a: TeamMemberRole, reason: string): TeamPatch => ({ role: a.code, active: true, reason });

export const TEAM_ERRORS: Record<string, string> = {
  already_has_role: 'This person already has that role.',
  system_admin_has_all_countries: 'A System admin always covers every country. Choose another role or clear the countries.',
  cannot_change_own_role: 'You cannot take the System admin role from yourself. Ask another System admin.',
  cannot_deactivate_self: 'You cannot remove your own System admin role. Ask another System admin.',
  last_system_admin: 'There must always be one active System admin. Make someone else a System admin first.',
  nothing_to_change: 'Nothing was changed.',
  admin_not_found: 'This person is not on the team any more.',
  role_not_assigned: 'This person does not hold that role.',
  invalid_email: 'Enter a valid email address, like name@example.com.',
};
