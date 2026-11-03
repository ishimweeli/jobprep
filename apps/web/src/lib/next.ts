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
