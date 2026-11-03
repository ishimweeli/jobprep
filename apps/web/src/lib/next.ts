/**
 * "Come back here afterwards" for the existing sign-up screen (no new screen): `/sign-up?next=/rw/checkout`.
 * Only same-site absolute paths are honoured, so the parameter can never redirect off-site.
 */
export function signUpPath(next: string): string {
  return `/sign-up?next=${encodeURIComponent(next)}`;
}

/** Same for the sign-in screen: `/sign-in?next=/rw/checkout`. */
export function signInPath(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

/**
 * The admin area wants a fresh sign-in (the last one is more than 12 hours old): the normal sign-in screen, with a
 * return to the page the person was on. `reason=admin_stale` keeps the screen open although a session exists and shows
 * "Please sign in again to use the admin area".
 */
export const ADMIN_STALE_REASON = 'admin_stale';
export const ADMIN_STALE_NOTICE = 'Please sign in again to use the admin area';
export function signInAgainPath(next: string): string {
  return `${signInPath(next)}&reason=${ADMIN_STALE_REASON}`;
}

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (/^\/[a-z]+:/i.test(raw)) return null;
  return raw;
}

function withNext(path: string, next: string | null | undefined, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  const safe = safeNext(next);
  if (safe) params.set('next', safe);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Setup steps: `/setup/country`, `/setup/category`, `/setup/goal` (OnboardCountry / OnboardCategory / OnboardGoal), keeping `?next=`. */
export function setupPath(step: 'country' | 'category' | 'goal', next?: string | null): string {
  return withNext(`/setup/${step}`, next);
}

/** The "Check your email" screen for an address (VerifyEmail.dc), keeping `?next=`. */
export function verifyEmailPath(email: string, next?: string | null): string {
  return withNext('/verify-email', next, { email });
}

/** `/sign-in?next=` without a `next` is just `/sign-in`. */
export function signInPathFor(next?: string | null, extra: Record<string, string> = {}): string {
  return withNext('/sign-in', next, extra);
}

export function signUpPathFor(next?: string | null): string {
  return withNext('/sign-up', next);
}

/**
 * A `next` that leads to a payment ("from a paid-test tap as a guest": `/rw/checkout?test=<slug>`): the test it is for.
 * The sign-up and setup screens then say "payment for <test title>" (SignUp.dc / OnboardGoal.dc `fromPaid`).
 */
export function paidTestFromNext(next: string | null | undefined): { country: string; testSlug: string } | null {
  const safe = safeNext(next);
  if (!safe) return null;
  const m = /^\/([a-z]{2})\/checkout\?(.*)$/i.exec(safe);
  if (!m) return null;
  const testSlug = new URLSearchParams(m[2]).get('test');
  return testSlug ? { country: m[1]!.toLowerCase(), testSlug } : null;
}
