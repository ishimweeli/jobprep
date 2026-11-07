import { ApiError } from '../../api/client';
import type { PublicUser, SetupStep } from '../../api/types';
import { INVALID_EMAIL_MESSAGE } from '../../lib/email';
import { setupPath } from '../../lib/next';
import { countryPath } from '../country/hooks';

/** Pure rules of the new sign-in, sign-up and setup screens (SignUp, SignIn, ResetPassword, Onboard*). Unit-tested. */

// ───────────────────────── Password

export const PASSWORD_MIN_LENGTH = 8;

/** "Use 8 or more characters." (SignUp.dc, under the password field) */
export const PASSWORD_HINT = 'Use 8 or more characters.';

export interface PasswordRule {
  id: 'length' | 'match';
  label: string;
  ok: boolean;
}

/** The two live rules under the reset form (ResetPassword.dc): "At least 8 characters" and "Both passwords match". */
export function passwordRules(password: string, confirm: string): PasswordRule[] {
  return [
    { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { id: 'match', label: 'Both passwords match', ok: password.length > 0 && password === confirm },
  ];
}

export const passwordAcceptable = (password: string, confirm: string) => passwordRules(password, confirm).every((r) => r.ok);

// ───────────────────────── Sign-in errors (SignIn.dc: the three boxes)

export type SignInErrorKind = 'invalid_credentials' | 'email_not_verified' | 'too_many_attempts' | 'account_suspended' | 'offline' | 'other';

export interface SignInError {
  kind: SignInErrorKind;
  title: string;
  body: string;
}

const minutesText = (n: number) => `${n} ${n === 1 ? 'minute' : 'minutes'}`;

/** The red box above the email field. The 15 minutes come from the API's `retryAfterSeconds` (15 minutes when it says nothing). */
export function signInError(e: unknown): SignInError {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'invalid_credentials':
        return { kind: 'invalid_credentials', title: 'Email or password is incorrect', body: 'Check them and try again, or reset your password.' };
      case 'email_not_verified':
        return {
          kind: 'email_not_verified',
          title: 'Please verify your email first',
          body: 'We sent a code when you signed up. Tap “Resend verification” to get a new one.',
        };
      case 'too_many_attempts': {
        const minutes = e.retryAfterSeconds && e.retryAfterSeconds > 0 ? Math.ceil(e.retryAfterSeconds / 60) : 15;
        return { kind: 'too_many_attempts', title: 'Too many tries', body: `For your security, wait ${minutesText(minutes)}, or reset your password.` };
      }
      case 'account_suspended':
        return { kind: 'account_suspended', title: 'This account is suspended', body: 'Please contact support.' };
      case 'network_error':
        return { kind: 'offline', title: 'You seem to be offline', body: 'Check your connection and try again.' };
      case 'rate_limited':
        return { kind: 'other', title: 'Please wait a moment', body: 'Too many requests. Try again in a minute.' };
      case 'invalid_email':
      case 'validation_error':
        return { kind: 'other', title: INVALID_EMAIL_MESSAGE, body: '' };
    }
    if (e.status >= 500) return { kind: 'other', title: 'Something went wrong', body: 'Something went wrong on our side. Please try again in a moment.' };
  }
  return { kind: 'other', title: 'Something went wrong', body: 'Please try again.' };
}

/** `/sign-in?error=google_failed`: Google sent the person back without signing them in (no artboard; MISSING_DESIGNS E4). */
export const GOOGLE_FAILED = { title: 'Google sign-in did not work', body: 'Please try again, or sign in with your email and password.' } as const;

/** Sign up, after "Sign in" → Google with an account JobPrep does not know. Nothing was created. */
export const GOOGLE_NO_ACCOUNT = {
  title: 'No JobPrep account found for that Google account',
  body: 'Create one below: press Continue with Google again, or use your email.',
} as const;

/** Toast after "Create an account" → Google with an address that already had an account. */
export const ACCOUNT_EXISTS_NOTICE = 'You already had a JobPrep account with this Google address, so we signed you in.';

// ───────────────────────── Where to go after signing in

/** The person's own dashboard (`/rw/progress`). */
export const dashboardPath = (user: Pick<PublicUser, 'countryCode'>) => countryPath(user.countryCode.toLowerCase(), 'progress');

/**
 * After any sign-in (password, verification code, Google): the setup step the API says is next, otherwise `next`
 * (a same-site path) or the dashboard.
 */
export function postAuthPath(user: Pick<PublicUser, 'countryCode' | 'onboarding'>, next: string | null): string {
  const step: SetupStep | null = user.onboarding?.nextStep ?? null;
  if (step) return setupPath(step, next);
  return next ?? dashboardPath(user);
}

/** After the last setup step: the paid test's checkout (`next`) or the dashboard. */
export function afterSetupPath(user: Pick<PublicUser, 'countryCode'>, next: string | null): string {
  return next ?? dashboardPath(user);
}

// ───────────────────────── "From a paid test" copy (SignUp.dc, OnboardGoal.dc: the `fromPaid` variants)

export const signUpPaidText = (title: string) => `After you create your account and finish setup, you’ll go straight to payment for ${title}.`;
export const setupPaidText = (title: string) => `Next: payment for ${title}. You can change these choices later.`;
export const FINISH_LABEL = 'Finish setup';
export const FINISH_PAID_LABEL = 'Finish and continue to payment';

// ───────────────────────── Setup step 3 (OnboardGoal.dc)

export const LEVELS = ['Primary', 'Secondary (S1–S3)', 'Secondary (S4–S6)', 'TVET'] as const;
export const SUBJECTS = ['Mathematics', 'English', 'Kinyarwanda', 'Physics', 'Chemistry', 'Biology', 'ICT', 'Teaching profession only'] as const;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function validYmd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The optional exam date is a text box with the example "14 Dec 2026". Accepts "14 Dec 2026", "14 December 2026" and
 * "2026-12-14"; returns the `YYYY-MM-DD` the API wants, `null` for an empty box, or `'invalid'`.
 */
export function parseExamDate(input: string): string | null | 'invalid' {
  const t = input.trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) return validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3])) ?? 'invalid';
  const words = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(t);
  if (words) {
    const m = MONTHS.indexOf(words[2]!.slice(0, 3).toLowerCase()) + 1;
    return m > 0 ? (validYmd(Number(words[3]), m, Number(words[1])) ?? 'invalid') : 'invalid';
  }
  return 'invalid';
}

/** `2026-12-14` -> "14 Dec 2026" to prefill the box from the saved exam date. */
export function formatExamDate(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month[0]!.toUpperCase()}${month.slice(1)} ${m[1]}` : '';
}

/** Two-letter badge of a job category row ("TE" for Teaching positions). */
export const categoryCode = (name: string) => name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
