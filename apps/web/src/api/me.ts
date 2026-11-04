import { clearSessionHint, hasSessionHint, SESSION_HINT_KEY } from '../lib/sessionHint';
import { setSystemState } from '../lib/systemState';
import { ApiError, api } from './client';
import type { ClaimOutcome, MeResponse, PatchMeInput, PaymentDetail, PaymentHistory, PublicUser } from './types';

export { SESSION_HINT_KEY };

export const meKeys = { session: ['me'] as const };

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

export const patchMe = (input: PatchMeInput) => api<{ user: PublicUser }>('/me', { method: 'PATCH', body: input });

export const paymentsKeys = { list: ['me', 'payments'] as const, detail: (id: string) => ['me', 'payments', id] as const };

/** Payment history (C21), newest first. */
export const listMyPayments = (page = 1, pageSize = 20) => api<PaymentHistory>('/me/payments', { query: { page, pageSize } });
export const getMyPayment = (id: string) => api<PaymentDetail>(`/me/payments/${encodeURIComponent(id)}`);

/** "Save my result" after a Google sign-in: moves the guest attempts onto the account and says what happened. */
export const claimAttempts = (guestTokens: string[]) => api<ClaimOutcome>('/me/claim-attempts', { method: 'POST', body: { guestTokens } });

/** What each setup step saves. Changing the country clears the job goal (and level and subject) on the server. */
export interface OnboardingInput {
  countryCode?: string;
  goalCategoryId?: string;
  level?: string;
  subject?: string;
  /** `YYYY-MM-DD`, or null to clear it. */
  examDate?: string | null;
  finish?: true;
  skip?: true;
}

export const patchOnboarding = (input: OnboardingInput) =>
  api<{ user: PublicUser }>('/me/onboarding', { method: 'PATCH', body: input });
