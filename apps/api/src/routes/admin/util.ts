import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { allowedCountries, type AdminPrincipal } from '../../admin/auth';
import { normalizePhone } from '../../domain/phone';
import { notFound } from '../../http/errors';

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Which countries a request may cover: the admin's scope, narrowed by an optional `?country=`.
 * Returns null for "all countries". A country outside the admin's scope is a 404, not a 403.
 */
export function countryCodes(admin: AdminPrincipal, requested?: string): string[] | null {
  const scope = allowedCountries(admin);
  if (!requested) return scope;
  const code = requested.toUpperCase();
  if (scope && !scope.includes(code)) throw notFound('country_not_found');
  return [code];
}

export const inCodes = (codes: string[] | null) => (codes ? { in: codes } : undefined);

/** Admin phones are stored in E.164. Accept "+250 788 …" anywhere, or a local number (assumed Rwanda, the home country). */
export async function normalizeAdminPhone(prisma: PrismaClient, input: string): Promise<string | null> {
  const countries = await prisma.country.findMany({ orderBy: { code: 'asc' } });
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) {
    const c = countries.find((x) => trimmed.startsWith(x.dialCode));
    return c ? normalizePhone(trimmed, c.dialCode) : null;
  }
  const rw = countries.find((x) => x.code === 'RW');
  return rw ? normalizePhone(trimmed, rw.dialCode) : null;
}

export const startOfDayUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const startOfMonthUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export async function settingNumber(prisma: PrismaClient, key: string, fallback: number) {
  const v = (await prisma.setting.findUnique({ where: { key } }))?.value;
  return typeof v === 'number' && v > 0 ? v : fallback;
}
export async function settingBool(prisma: PrismaClient, key: string, fallback: boolean) {
  const v = (await prisma.setting.findUnique({ where: { key } }))?.value;
  return typeof v === 'boolean' ? v : fallback;
}
