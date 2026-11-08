/**
 * The two tiers. Full Access unlocks every mock test; Full Access + Interview prep adds AI interview minutes.
 * Mock-test access ignores which plan a grant came from (domain/access.ts), so both unlock the mocks.
 */
export const PLAN_CODES = { full_access: 'FULL_ACCESS', interview: 'FULL_ACCESS_INTERVIEW' } as const;
export type PlanKey = keyof typeof PLAN_CODES;

const DAY_MS = 24 * 60 * 60 * 1000;
/** With fewer days of access left than this, the checkout also offers the full price for a fresh 30 days. */
export const FRESH_OPTION_BELOW_DAYS = 7;

export interface InterviewQuoteInput {
  interviewPriceMinor: number;
  /** The Full Access price today (null = not set). */
  fullAccessPriceMinor: number | null;
  durationDays: number;
  /** End of the buyer's continuous access in this country, or null when they have none now. */
  coveredUntil: Date | null;
  /** They already hold purchased interview minutes that are still valid (they bought this tier already). */
  hasPurchasedMinutes: boolean;
  now: Date;
}

export interface InterviewQuote {
  /** Pay the difference: interview minutes for the CURRENT access period, no extra mock-test days. */
  upgrade: { amountMinor: number; minutesExpireAt: Date } | null;
  /** The full price: a new 30-day window (after any current access), with minutes valid until its end. */
  full: { amountMinor: number; accessEndsAt: Date; minutesExpireAt: Date };
  /** Offer `full` next to `upgrade` (always true when there is no upgrade). */
  showFull: boolean;
}

export function quoteInterview(i: InterviewQuoteInput): InterviewQuote {
  const fullEnd = new Date((i.coveredUntil ?? i.now).getTime() + i.durationDays * DAY_MS);
  const full = { amountMinor: i.interviewPriceMinor, accessEndsAt: fullEnd, minutesExpireAt: fullEnd };
  const difference = i.fullAccessPriceMinor == null ? 0 : i.interviewPriceMinor - i.fullAccessPriceMinor;
  if (!i.coveredUntil || i.hasPurchasedMinutes || difference <= 0) return { upgrade: null, full, showFull: true };
  const daysLeft = Math.ceil((i.coveredUntil.getTime() - i.now.getTime()) / DAY_MS);
  return { upgrade: { amountMinor: difference, minutesExpireAt: i.coveredUntil }, full, showFull: daysLeft < FRESH_OPTION_BELOW_DAYS };
}
