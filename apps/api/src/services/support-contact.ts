import type { PrismaClient } from '@prisma/client';
import type { Config } from '../config';

export interface SupportPerson {
  name: string;
  phone: string;
}

export interface SupportContact {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  hours: string | null;
  /** Named people to call, shown as well as the general phone and WhatsApp. */
  people: SupportPerson[];
  /** False when nothing is set for the country (and no env fallback): the web app hides the block. */
  configured: boolean;
  /** True for dev placeholder values; never true for data an admin entered. */
  placeholder: boolean;
}

export const supportKey = (code: string) => `support.contact:${code}`;
const clean = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** Support phone / WhatsApp / email per country: the admin's value, else the SUPPORT_* env fallback, else "not configured". */
export async function supportContactFor(
  ctx: { prisma: PrismaClient; config: Pick<Config, 'SUPPORT_PHONE' | 'SUPPORT_WHATSAPP' | 'SUPPORT_EMAIL' | 'SUPPORT_HOURS'> },
  countryCode: string,
): Promise<SupportContact> {
  const row = await ctx.prisma.setting.findUnique({ where: { key: supportKey(countryCode) } });
  const v = (row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {}) as Record<string, unknown>;
  const { config } = ctx;
  const out = {
    phone: clean(v.phone) ?? clean(config.SUPPORT_PHONE),
    whatsapp: clean(v.whatsapp) ?? clean(config.SUPPORT_WHATSAPP),
    email: clean(v.email) ?? clean(config.SUPPORT_EMAIL),
    hours: clean(v.hours) ?? clean(config.SUPPORT_HOURS),
  };
  const people = (Array.isArray(v.people) ? (v.people as Record<string, unknown>[]) : []).flatMap((p) => {
    const name = clean(p?.name);
    const phone = clean(p?.phone);
    return name && phone ? [{ name, phone }] : [];
  });
  return { ...out, people, configured: !!(out.phone || out.whatsapp || out.email || people.length > 0), placeholder: v.placeholder === true };
}
