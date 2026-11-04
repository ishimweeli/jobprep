import type { AccessPreview } from '../../api/users-payments';
import { formatDayYear, plural } from '../../lib/format';

/** Plain-data parts of the user actions (A2, A3, A5): the days box, the "Access will run until" line, the words for refusals. */

export const MIN_DAYS = 1;
export const MAX_DAYS = 365;
export const DEFAULT_DAYS = 30;

/** A whole number of days from 1 to 365 (what the API accepts), or null. */
export function parseDays(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= MIN_DAYS && n <= MAX_DAYS ? n : null;
}

export const DAYS_PROBLEM = `Enter a whole number of days from ${MIN_DAYS} to ${MAX_DAYS}.`;

/**
 * The summary under the days box. With the server's preview: "Access will run until 4 Dec 2026" and, when the
 * person still has access, that it is added after it. Without it (still loading, or it failed): a plain sentence.
 */
export function summaryLine(days: number | null, preview: AccessPreview | undefined): string {
  if (days === null) return 'Enter the number of days to see when the access will end.';
  if (!preview || preview.days !== days) return `Access will run for ${plural(days, 'day')}, added after any access they still have.`;
  const base = `Access will run until ${formatDayYear(preview.endsAt)}`;
  return preview.currentEndsAt ? `${base} (it is added after their current access, which ends ${formatDayYear(preview.currentEndsAt)})` : base;
}

export const USER_ERRORS: Record<string, string> = {
  no_plan_for_country: 'There is no Full Access plan for that country yet, so access cannot be granted there.',
  already_suspended: 'This account is already suspended. Reload the page.',
  not_suspended: 'This account is not suspended. Reload the page.',
  cannot_suspend_self: 'You cannot suspend your own account.',
  last_system_admin: 'This is the last active System admin. The platform must keep one, so this account cannot be suspended.',
  user_suspended: 'This account is suspended, so no email can be sent. Un-suspend it first.',
  otp_hourly_limit: 'This person has had the most reset emails allowed this hour. Try again in an hour.',
  user_not_found: 'This person no longer exists, or is not in your countries.',
};
