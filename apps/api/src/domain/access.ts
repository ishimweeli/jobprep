export interface GrantLike {
  countryCode: string;
  startsAt: Date;
  endsAt: Date;
  status: 'ACTIVE' | 'REVOKED' | 'SUSPENDED';
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isGrantActive(g: GrantLike, now: Date): boolean {
  return g.status === 'ACTIVE' && g.startsAt <= now && now < g.endsAt;
}

/** A grant only counts for tests of ITS OWN country — a Rwanda grant never unlocks Kenya. */
export function activeGrantFor(grants: GrantLike[], countryCode: string, now: Date): GrantLike | null {
  const live = grants
    .filter((g) => g.countryCode === countryCode && isGrantActive(g, now))
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
  return live[0] ?? null;
}

/**
 * Until when is this country covered without a gap? A renewal bought while active is stored as a second
 * grant that starts where the first ends, so coverage chains through every contiguous grant.
 * Returns null when nothing is active right now.
 */
export function coveredUntil(grants: GrantLike[], countryCode: string, now: Date): Date | null {
  const current = activeGrantFor(grants, countryCode, now);
  if (!current) return null;
  let end = current.endsAt;
  const usable = grants.filter((g) => g.countryCode === countryCode && g.status === 'ACTIVE');
  for (let moved = true; moved; ) {
    moved = false;
    for (const g of usable) {
      if (g.startsAt <= end && g.endsAt > end) { end = g.endsAt; moved = true; }
    }
  }
  return end;
}

/**
 * Buying while already active extends from the end of current coverage, so nobody loses paid days.
 * Otherwise the window starts now.
 */
export function nextGrantWindow(
  grants: GrantLike[],
  countryCode: string,
  durationDays: number,
  now: Date,
): { startsAt: Date; endsAt: Date } {
  const startsAt = coveredUntil(grants, countryCode, now) ?? now;
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationDays * DAY_MS) };
}

export function daysLeft(grant: Pick<GrantLike, 'endsAt'>, now: Date): number {
  return Math.max(0, Math.ceil((grant.endsAt.getTime() - now.getTime()) / DAY_MS));
}

export interface MockTestAccessInput {
  countryCode: string;
  isFree: boolean;
}

export type AccessDecision =
  | { allowed: true; reason: 'free' | 'full_access' }
  | { allowed: false; reason: 'country_mismatch' | 'needs_full_access' };

/**
 * Free samples are open to everyone (guests too) — but still only inside their own country.
 * Paid tests need an active, same-country grant.
 */
export function canStartMockTest(
  test: MockTestAccessInput,
  viewerCountry: string,
  grants: GrantLike[],
  now: Date,
): AccessDecision {
  if (test.countryCode !== viewerCountry) return { allowed: false, reason: 'country_mismatch' };
  if (test.isFree) return { allowed: true, reason: 'free' };
  return activeGrantFor(grants, test.countryCode, now)
    ? { allowed: true, reason: 'full_access' }
    : { allowed: false, reason: 'needs_full_access' };
}
