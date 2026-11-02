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
 * Buying while already active extends from the current end date, so nobody loses paid days.
 * Otherwise the window starts now.
 */
export function nextGrantWindow(
  grants: GrantLike[],
  countryCode: string,
  durationDays: number,
  now: Date,
): { startsAt: Date; endsAt: Date } {
  const current = activeGrantFor(grants, countryCode, now);
  const startsAt = current ? current.endsAt : now;
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationDays * DAY_MS) };
}

export function daysLeft(grant: GrantLike, now: Date): number {
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
