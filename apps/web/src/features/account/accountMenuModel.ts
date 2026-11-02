import type { AccessSummary, InProgressAttempt } from '../../api/types';
import { languageName } from '../../lib/format';
import { formatClock } from '../exam/timer';
import type { IconName } from '../../components/StrokeIcon';

/** What the account menu (AccountMenu.dc) and the phone Account tab (NavPhone.dc) list. Pure, unit-tested. */
export interface AccountMenuItem {
  id: 'progress' | 'access' | 'country' | 'language' | 'help' | 'settings';
  label: string;
  /** The grey second line; `null` hides it. */
  secondary: string | null;
  icon: IconName;
  /** Destination; `null` = drawn but inert (no design for the follow-up). */
  to: string | null;
}

/** "Full Access · 23 days left" while access runs; nothing otherwise (the artboard draws only the active line). */
export function accessLine(access: Pick<AccessSummary, 'current'> | undefined): string | null {
  const c = access?.current;
  if (!c) return null;
  return `Full Access · ${c.daysLeft} ${c.daysLeft === 1 ? 'day' : 'days'} left`;
}

/** The country's languages in their own names, joined as in the artboard: "English · Ikinyarwanda". */
export function languageLine(codes: string[]): string | null {
  if (codes.length === 0) return null;
  return codes.map((c) => (c === 'rw' ? 'Ikinyarwanda' : languageName(c))).join(' · ');
}

export function accountMenuItems(input: { slug: string; countryName: string; access: AccessSummary | undefined; languages: string[] }): AccountMenuItem[] {
  const base = `/${input.slug}`;
  return [
    { id: 'progress', label: 'My progress', secondary: null, icon: 'progress', to: `${base}/progress` },
    { id: 'access', label: 'My access', secondary: accessLine(input.access), icon: 'access', to: `${base}/progress` },
    { id: 'country', label: 'Exam country', secondary: `${input.countryName} · change`, icon: 'country', to: '/choose-country' },
    // Language has no picker design (C22): shown as drawn, inert.
    { id: 'language', label: 'Language', secondary: languageLine(input.languages), icon: 'language', to: null },
    // Help and support: no help page is designed and there is no support number yet, so no second line and no link.
    { id: 'help', label: 'Help and support', secondary: null, icon: 'help', to: null },
    { id: 'settings', label: 'Account settings', secondary: 'Name, phone number', icon: 'user', to: '/account/settings' },
  ];
}

/**
 * Signing out while a mock test is running asks first (the timer keeps running). Practice sets have no clock, so
 * only full mock tests count. Returns `null` when nothing needs confirming.
 */
export function signOutPrompt(attempts: InProgressAttempt[] | undefined): null | { title: string; clock: string } {
  const running = attempts?.find((a) => a.kind === 'FULL');
  if (!running) return null;
  return { title: running.mockTest.title, clock: formatClock(running.remainingSeconds) };
}
