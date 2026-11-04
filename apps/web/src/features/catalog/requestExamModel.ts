import type { ExamRequestResponse } from '../../api/types';
import { INVALID_EMAIL_MESSAGE, isValidEmail, normalizeEmail } from '../../lib/email';

/** "Request this exam" form rules (C10; not drawn, built in the dialog / bottom-sheet style). Pure, unit-tested. */

export const REQUEST_TITLE_MIN = 2;
export const REQUEST_TITLE_MAX = 120;

export interface RequestFormInput {
  query: string;
  email: string;
}

export interface RequestFormErrors {
  query?: string;
  email?: string;
}

export function validateRequest(input: RequestFormInput): RequestFormErrors {
  const errors: RequestFormErrors = {};
  const q = input.query.trim();
  if (q.length < REQUEST_TITLE_MIN) errors.query = 'Enter the job or exam you are looking for.';
  else if (q.length > REQUEST_TITLE_MAX) errors.query = `Keep it under ${REQUEST_TITLE_MAX} characters.`;
  // The email is optional: empty is fine, but a typed address must be valid.
  if (input.email.trim() && !isValidEmail(input.email)) errors.email = INVALID_EMAIL_MESSAGE;
  return errors;
}

/** The body sent to the API: the email is left out when empty (the API then uses the signed-in user's address, if any). */
export function requestBody(input: RequestFormInput): { query: string; email?: string } {
  const email = normalizeEmail(input.email);
  return { query: input.query.trim().replace(/\s+/g, ' '), ...(email ? { email } : {}) };
}

export interface RequestDone {
  title: string;
  body: string;
}

/** The success text: a new request, or the same person asking again. Says what happens next only when there is an address. */
export function requestDone(r: Pick<ExamRequestResponse, 'alreadyRequested'>, hasEmail: boolean): RequestDone {
  if (r.alreadyRequested) {
    return { title: 'You already asked for this', body: 'We have your request. Asking again does not move it up the list.' };
  }
  return {
    title: 'Request sent',
    body: hasEmail ? 'Thank you. We will email you when this test is added.' : 'Thank you. We have noted it. Add your email next time if you want us to tell you when it is added.',
  };
}
