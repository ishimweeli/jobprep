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

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (/^\/[a-z]+:/i.test(raw)) return null;
  return raw;
}
