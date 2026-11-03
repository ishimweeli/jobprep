import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role, UserRole } from '@prisma/client';
import { ROLE_LABELS, type AdminRoleCode, type Permission } from '../domain/permissions';
import type { Ctx } from '../http/context';
import { forbidden, HttpError, notFound, unauthorized } from '../http/errors';

/**
 * Admin access is not a separate account type: it is a normal account (normal session cookie, normal email +
 * password or Google sign-in) that holds one or more active role assignments (UserRole). Nothing here creates or reads a
 * session of its own; `attachUser` has already resolved the person and their active assignments.
 */

/** How recently the person must have signed in to use /api/admin (the session is created at sign-in). */
export const ADMIN_SESSION_HOURS = 12;

/** An active role assignment as loaded with the session. */
export type RoleAssignment = UserRole & { role: Role };

export interface AdminPrincipal {
  id: string;
  name: string;
  email: string;
  roles: { code: AdminRoleCode; label: string }[];
  /** Union of the permissions of every active role. */
  permissions: Permission[];
  /** Empty = every country. */
  countryScope: string[];
}

/**
 * The effective country scope across roles: every country if ANY active role is unscoped, otherwise the union
 * of the scopes. (Simplification, DECISIONS 88: scope is not tracked per permission.)
 */
export function effectiveScope(assignments: Pick<UserRole, 'countryScope'>[]): string[] {
  if (assignments.some((a) => a.countryScope.length === 0)) return [];
  return [...new Set(assignments.flatMap((a) => a.countryScope))].sort();
}

export function buildPrincipal(user: { id: string; name: string; email: string }, assignments: RoleAssignment[]): AdminPrincipal {
  const sorted = [...assignments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: sorted.map((a) => ({ code: a.role.name as AdminRoleCode, label: ROLE_LABELS[a.role.name as AdminRoleCode] ?? a.role.label })),
    permissions: [...new Set(sorted.flatMap((a) => a.role.permissions))] as Permission[],
    countryScope: effectiveScope(sorted),
  };
}

/** The shape of GET /api/admin/me. */
export const principalBody = (p: AdminPrincipal) => ({
  id: p.id, name: p.name, email: p.email, roles: p.roles, permissions: p.permissions, countryScope: p.countryScope,
});

/**
 * Gate for everything under /api/admin. Needs: a valid normal session (401 admin_sign_in_required), an active
 * account (a suspended account has no valid session, so it lands here too), at least one active role (403
 * admin_forbidden), and a sign-in no older than ADMIN_SESSION_HOURS (401 admin_session_stale: the person is signed
 * in but must sign in again). Roles are read on every request, so removing a role takes effect immediately.
 */
export function requireAdmin(ctx: Ctx): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !req.sessionCreatedAt) return next(unauthorized('admin_sign_in_required'));
    const assignments = req.userRoles ?? [];
    if (assignments.length === 0) return next(forbidden('admin_forbidden'));
    const age = ctx.now().getTime() - req.sessionCreatedAt.getTime();
    if (age > ADMIN_SESSION_HOURS * 3_600_000) return next(unauthorized('admin_session_stale'));
    req.admin = buildPrincipal(req.user, assignments);
    next();
  };
}

/**
 * CSRF replacement for the old SameSite=Strict admin cookie. The session cookie is SameSite=Lax, so a state-changing
 * admin request is only accepted from the web app's own origin. A request with no Origin header (curl, tests, some
 * same-origin clients) is allowed: browsers always send Origin on cross-site POST/PATCH/PUT/DELETE.
 */
export function requireSameOrigin(ctx: Ctx): RequestHandler {
  const allowed = new URL(ctx.config.WEB_ORIGIN).origin;
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const origin = req.get('origin');
    if (origin !== undefined && origin !== allowed) return next(new HttpError(403, 'bad_origin'));
    next();
  };
}

/** Every listed permission is required. Roles are data; the permission map lives in domain/permissions. */
export function requirePermission(...needed: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.admin) return next(unauthorized('admin_sign_in_required'));
    const missing = needed.filter((p) => !req.admin!.permissions.includes(p));
    if (missing.length > 0) return next(forbidden('admin_forbidden'));
    next();
  };
}

/** The countries this admin may see, or null for all of them. */
export function allowedCountries(admin: AdminPrincipal): string[] | null {
  return admin.countryScope.length === 0 ? null : admin.countryScope;
}

export function canAccessCountry(admin: AdminPrincipal, countryCode: string): boolean {
  return admin.countryScope.length === 0 || admin.countryScope.includes(countryCode);
}

/** 404 rather than 403 for things outside the admin's countries, so scoped admins can't probe other countries. */
export function assertCountry(admin: AdminPrincipal, countryCode: string, notFoundCode = 'not_found') {
  if (!canAccessCountry(admin, countryCode)) throw notFound(notFoundCode);
}
