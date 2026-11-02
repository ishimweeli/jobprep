import { readStorage, removeStorage, writeStorage } from './storage';

/**
 * The session cookie is httpOnly, so a non-secret hint in localStorage remembers that this browser signed in
 * (see docs/API_GAPS.md #1). Without the hint the app does not call `/api/me`.
 */
export const SESSION_HINT_KEY = 'jobprep.session';
export const hasSessionHint = () => readStorage(SESSION_HINT_KEY) === '1';
export const setSessionHint = () => writeStorage(SESSION_HINT_KEY, '1');
export const clearSessionHint = () => removeStorage(SESSION_HINT_KEY);
