import type { PrismaClient } from '@prisma/client';
import { coveredUntil, daysLeft } from '../domain/access';

/** Access is per country: the current country's grant, plus other countries' grants that are still running. */
export async function accessSummary(
  ctx: { prisma: PrismaClient; now: () => Date },
  userId: string,
  countryCode: string,
) {
  const now = ctx.now();
  const grants = await ctx.prisma.accessGrant.findMany({ where: { userId, endsAt: { gt: now } } });
  const until = coveredUntil(grants, countryCode, now);
  const others = [...new Set(grants.filter((g) => g.countryCode !== countryCode).map((g) => g.countryCode))]
    .map((code) => ({ code, endsAt: coveredUntil(grants, code, now) }))
    .filter((x): x is { code: string; endsAt: Date } => !!x.endsAt)
    .map((x) => ({ countryCode: x.code, endsAt: x.endsAt, daysLeft: daysLeft({ endsAt: x.endsAt }, now) }));
  return {
    current: until && { endsAt: until, daysLeft: daysLeft({ endsAt: until }, now) },
    otherCountries: others,
  };
}
