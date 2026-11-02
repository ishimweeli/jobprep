import { readStorage, writeStorage } from './storage';

export const GUEST_TOKENS_KEY = 'jobprep.guestTokens';
const MAX_TOKENS = 20;

/**
 * Guest attempt tokens (returned once when a guest starts a test) are kept in localStorage as a JSON array.
 * They are sent as `X-Guest-Token` on API calls and with sign-up / sign-in so the API can move those attempts
 * to the new account. Always returns a clean string array.
 */
export function readGuestTokens(): string[] {
  const raw = readStorage(GUEST_TOKENS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string' && t.length >= 8 && t.length <= 100).slice(0, MAX_TOKENS);
  } catch {
    return [];
  }
}

/** Remember a guest token (newest first, no duplicates, capped at 20 like the API). */
export function addGuestToken(token: string): void {
  if (token.length < 8 || token.length > 100) return;
  const next = [token, ...readGuestTokens().filter((t) => t !== token)].slice(0, MAX_TOKENS);
  writeStorage(GUEST_TOKENS_KEY, JSON.stringify(next));
}

/** Value for the `X-Guest-Token` header (the API accepts several, comma-joined), or null for none. */
export function guestTokenHeader(): string | null {
  const tokens = readGuestTokens();
  return tokens.length > 0 ? tokens.join(',') : null;
}
