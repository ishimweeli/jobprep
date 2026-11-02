import type { PrismaClient } from '@prisma/client';
import { coveredUntil, daysLeft } from '../domain/access';

/** "Ending soon" badge on the dashboard: this many days left or fewer. */
export const ENDING_SOON_DAYS = 3;

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
  // No access now: when did the last access end? (drives the "expired" state with a renew button)
  const ended = until ? null : await ctx.prisma.accessGrant.findFirst({
    where: { userId, countryCode, status: 'ACTIVE', endsAt: { lte: now } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true },
  });
  const left = until ? daysLeft({ endsAt: until }, now) : 0;
  return {
    current: until && { endsAt: until, daysLeft: left, endingSoon: left <= ENDING_SOON_DAYS },
    expired: ended && { endedAt: ended.endsAt },
    otherCountries: others,
  };
}
