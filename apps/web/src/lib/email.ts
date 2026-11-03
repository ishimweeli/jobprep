/** Plain "something@something.tld" check, no spaces. The API validates again and lower-cases. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What we send to the API: trimmed and lower-cased (the API does the same, so both sides agree). */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  const e = normalizeEmail(input);
  return e.length <= 254 && EMAIL_RE.test(e);
}

export const INVALID_EMAIL_MESSAGE = 'Enter a valid email address, like name@example.com.';
