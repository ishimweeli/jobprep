import { toCsv } from '../../admin/csv';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { allowedCountries, type AdminPrincipal } from '../../admin/auth';
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

/**
 * A cell that comes from user input must not run as a spreadsheet formula when an accountant opens the export:
 * a leading = + - @ (or tab / carriage return) gets a quote in front.
 */
export const csvSafe = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/** Send rows as a CSV download (UTF-8 with a byte-order mark so Excel reads accents correctly). */
export function sendCsv(res: import('express').Response, filename: string, rows: string[][]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + toCsv(rows));
}
