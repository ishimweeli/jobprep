import { isApiError } from '../api/client';

/**
 * Plain words for what an admin call can refuse. `overrides` maps an API error code to a feature's own sentence
 * (it wins); everything else falls back to the generic copy here. Never shows a raw code.
 */
const GENERIC: Record<string, string> = {
  reason_too_short: 'Write a reason of at least 5 characters.',
  reason_required: 'A reason is required.',
  admin_forbidden: 'Your role does not allow this.',
  admin_session_stale: 'Please sign in again to use the admin area.',
  admin_sign_in_required: 'Please sign in again to use the admin area.',
  validation_error: 'Some of the values are not allowed. Check the form and try again.',
  http_400: 'Some of the values are not allowed. Check the form and try again.',
  not_found: 'This no longer exists. Reload the page.',
  user_not_found: 'This person no longer exists.',
  payment_not_found: 'This payment no longer exists.',
  country_not_found: 'That country is not available to you.',
};

export function describeAdminError(e: unknown, overrides: Record<string, string> = {}): string {
  if (!isApiError(e)) return 'Something went wrong. Nothing was changed; try again.';
  const own = overrides[e.code];
  if (own) return own;
  if (e.status === 0) return 'Could not reach the server. Nothing was changed; try again.';
  if (e.status === 429) return e.retryAfterSeconds ? `Too many tries. Wait ${e.retryAfterSeconds} seconds and try again.` : 'Too many tries. Wait a moment and try again.';
  const known = GENERIC[e.code];
  if (known) return known;
  if (e.status === 403) return GENERIC.admin_forbidden!;
  if (e.status >= 500) return 'Something went wrong on our side. Nothing was changed; try again.';
  return 'This could not be done. Nothing was changed; try again.';
}
