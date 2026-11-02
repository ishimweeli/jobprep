import { clearSessionHint, hasSessionHint, SESSION_HINT_KEY } from '../lib/sessionHint';
import { setSystemState } from '../lib/systemState';
import { ApiError, api } from './client';
import type { CountryChangePreview, MeResponse, PublicUser } from './types';

export { SESSION_HINT_KEY };

export const meKeys = { session: ['me'] as const, countryChange: (to: string) => ['me', 'country-change', to] as const };

/** The signed-in session, or `null` for guests (401 is not an error here). */
export async function getSession(): Promise<MeResponse | null> {
  // The session cookie is httpOnly, so a non-secret hint remembers that this browser signed in. Without it we
  // skip /api/me instead of provoking a 401 (and a console error) on every guest page view. See docs/API_GAPS.md.
  if (!hasSessionHint()) return null;
  try {
    return await api<MeResponse>('/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // This browser signed in before and the session has ended: tell the user (SystemPages.dc, session expired).
      clearSessionHint();
      setSystemState('session_expired');
      return null;
    }
    throw e;
  }
}

export const patchMe = (input: { name?: string; goalCategoryId?: string | null; language?: string }) =>
  api<{ user: PublicUser }>('/me', { method: 'PATCH', body: input });

export const getCountryChangePreview = (to: string) =>
  api<CountryChangePreview>('/me/country-change', { query: { to: to.toUpperCase() } });

export const switchCountry = (countryCode: string) =>
  api<{ user: PublicUser }>('/me/country', { method: 'POST', body: { countryCode: countryCode.toUpperCase(), confirm: true } });
