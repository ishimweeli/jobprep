import type { AccessSummary, Category, PublicUser } from '../../api/types';

/** Pure rules of the account page and the change-goal screen (C14, C15; not drawn). Unit-tested. */

export const NAME_MIN = 2;
export const NAME_MAX = 80;

/** Inline error for the name field, or `null` when it can be saved. */
export function validateName(name: string): string | null {
  const n = name.trim();
  if (n.length < NAME_MIN) return `Enter your name (at least ${NAME_MIN} characters).`;
  if (n.length > NAME_MAX) return `Keep your name under ${NAME_MAX} characters.`;
  return null;
}

export const tidyName = (name: string): string => name.trim().replace(/\s+/g, ' ');

/** The goal's name from the country's categories, or `null` when no goal is set (or it is not in the list). */
export function goalName(user: Pick<PublicUser, 'goalCategoryId'>, categories: Pick<Category, 'id' | 'name'>[] | undefined): string | null {
  if (!user.goalCategoryId) return null;
  return categories?.find((c) => c.id === user.goalCategoryId)?.name ?? null;
}

export interface AccessSummaryView {
  title: string;
  /** Second line; empty when there is nothing more to say. */
  body: string;
  tone: 'active' | 'ending' | 'none';
}

/** The "My access" line of the account page, from the API's access summary. Never invents a price or a date. */
export function accessSummaryView(access: AccessSummary | undefined, countryName: string, formatDate: (iso: string) => string): AccessSummaryView {
  const c = access?.current;
  if (c) {
    const days = `${c.daysLeft} ${c.daysLeft === 1 ? 'day' : 'days'} left`;
    return {
      title: c.endingSoon ? 'Full Access · ending soon' : 'Full Access · active',
      body: `Until ${formatDate(c.endsAt)} (${days}). It covers every ${countryName} mock test.`,
      tone: c.endingSoon ? 'ending' : 'active',
    };
  }
  const other = access?.otherCountries?.[0];
  if (access?.expired) {
    return { title: 'Full Access ended', body: `Your ${countryName} Full Access ended on ${formatDate(access.expired.endedAt)}.`, tone: 'none' };
  }
  if (other) {
    return { title: 'Free tests only', body: `Your Full Access in another country does not cover ${countryName} tests.`, tone: 'none' };
  }
  return { title: 'Free tests only', body: 'Free samples are open to you. Full Access unlocks every mock test.', tone: 'none' };
}

/** The goal row's second line. */
export const goalRowLine = (name: string | null): string => (name ? name : 'Not chosen yet');

/** After a goal is saved: where "Change goal" returns to. Only same-site paths are accepted (see lib/next). */
export const GOAL_SAVED_NOTICE = 'Goal saved.';
