import type { PrismaClient } from '@prisma/client';
import { activeGrantFor, daysLeft } from '../domain/access';

/** Access is per country: the current country's grant, plus other countries' grants that are still running. */
export async function accessSummary(
  ctx: { prisma: PrismaClient; now: () => Date },
  userId: string,
  countryCode: string,
) {
  const now = ctx.now();
  const grants = await ctx.prisma.accessGrant.findMany({ where: { userId, endsAt: { gt: now } } });
  const current = activeGrantFor(grants, countryCode, now);
  const others = [...new Set(grants.filter((g) => g.countryCode !== countryCode).map((g) => g.countryCode))]
    .map((code) => ({ code, grant: activeGrantFor(grants, code, now) }))
    .filter((x): x is { code: string; grant: NonNullable<typeof x.grant> } => !!x.grant)
    .map((x) => ({ countryCode: x.code, endsAt: x.grant.endsAt, daysLeft: daysLeft(x.grant, now) }));
  return {
    current: current && { endsAt: current.endsAt, daysLeft: daysLeft(current, now) },
    otherCountries: others,
  };
}
