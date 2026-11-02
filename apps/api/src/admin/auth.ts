import { createHmac, randomBytes } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AdminRoleCode, Permission } from '../domain/permissions';
import type { Ctx } from '../http/context';
import { forbidden, notFound, unauthorized } from '../http/errors';
import { parseCookies } from '../services/session';

export const ADMIN_COOKIE = 'jp_admin';
/** Admin sessions are short: a forgotten laptop should not stay signed in for a month. */
export const ADMIN_SESSION_HOURS = 12;

export interface AdminPrincipal {
  id: string;
  name: string;
  phone: string;
  role: AdminRoleCode;
  permissions: Permission[];
  /** Empty = every country. */
  countryScope: string[];
}

const hash = (secret: string, token: string) => createHmac('sha256', `admin:${secret}`).update(token).digest('hex');

export async function createAdminSession(prisma: PrismaClient, secret: string, adminId: string, now: Date, userAgent?: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_HOURS * 3_600_000);
  await prisma.session.create({
    data: { tokenHash: hash(secret, token), adminUserId: adminId, expiresAt, userAgent: userAgent?.slice(0, 200) },
  });
  return { token, expiresAt };
}

export async function findAdminSession(prisma: PrismaClient, secret: string, token: string, now: Date): Promise<AdminPrincipal | null> {
  const s = await prisma.session.findUnique({
    where: { tokenHash: hash(secret, token) },
    include: { adminUser: { include: { role: true } } },
  });
  if (!s || !s.adminUser || s.expiresAt <= now || !s.adminUser.active) return null;
  const a = s.adminUser;
  return {
    id: a.id, name: a.name, phone: a.phone, role: a.role.name as AdminRoleCode,
    permissions: a.role.permissions as Permission[], countryScope: a.countryScope,
  };
}

export async function destroyAdminSession(prisma: PrismaClient, secret: string, token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hash(secret, token) } });
}

/** Resolves the admin cookie onto `req.admin`. Never rejects. */
export function attachAdmin(ctx: Ctx): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
    if (token) {
      const admin = await findAdminSession(ctx.prisma, ctx.config.SESSION_SECRET, token, ctx.now());
      if (admin) {
        req.admin = admin;
        (req as Request & { adminToken?: string }).adminToken = token;
      }
    }
    next();
  };
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.admin) return next(unauthorized('admin_sign_in_required'));
  next();
};

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
