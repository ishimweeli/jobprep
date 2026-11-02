import { readStorage } from './storage';

export const GUEST_TOKENS_KEY = 'jobprep.guestTokens';

/**
 * Guest attempt tokens (written by the exam engine in a later phase) are sent with sign-up / sign-in
 * so the API can move those attempts to the new account. Always returns a clean string array.
 */
export function readGuestTokens(): string[] {
  const raw = readStorage(GUEST_TOKENS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string' && t.length >= 8 && t.length <= 100).slice(0, 20);
  } catch {
    return [];
  }
}
