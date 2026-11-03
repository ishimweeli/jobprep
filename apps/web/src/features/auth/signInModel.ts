import { ApiError } from '../../api/client';
import type { OtpRequestResponse } from '../../api/types';
import { INVALID_EMAIL_MESSAGE } from '../../lib/email';
import { mmss } from '../../lib/format';

/**
 * The sign-in screen as a state machine (SignIn.dc, SignInPhone.dc). The numbers on screen come from the API,
 * never from the artboard: the code lifetime is `expiresInSeconds` and the resend wait `cooldownSeconds` of the
 * request that sent the code, and a wrong code carries `triesLeft`.
 */

export type ErrorTone = 'red' | 'amber';

export interface ErrorBox {
  title: string;
  body: string;
  tone: ErrorTone;
  /** The boxes are cleared so the user types a fresh code. */
  clearCode: boolean;
  /** "Verify and sign in" is disabled (the code is dead): ask for a new one. */
  locksVerify: boolean;
  /** Marks the digit boxes red. */
  invalidBoxes: boolean;
  /** The resend button reads "Send a new code" once its wait is over. */
  needsNewCode: boolean;
  /** Seconds the resend button must wait (from a 429), if the API said so. */
  waitSeconds?: number;
}

/** "5 minutes" from `expiresInSeconds`; at least 1. */
export function expiresMinutes(expiresInSeconds: number): number {
  return Math.max(1, Math.round(expiresInSeconds / 60));
}

export const minutesLabel = (n: number) => `${n} ${n === 1 ? 'minute' : 'minutes'}`;

function waitCopy(seconds: number | null | undefined): string {
  return seconds && seconds > 0 ? `You can ask for another code in ${mmss(seconds)}.` : 'Please wait a moment before asking for another code.';
}

function hourlyCopy(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return 'You have asked for too many codes. Try again later.';
  const minutes = Math.ceil(seconds / 60);
  return `You have asked for too many codes. Try again in about ${minutesLabel(minutes)}.`;
}

/** A failed "Verify and sign in" (or a failed resend) as the artboard's coloured error box. */
export function codeErrorBox(e: unknown, expiresInSeconds: number): ErrorBox {
  const base = { clearCode: false, locksVerify: false, invalidBoxes: false, needsNewCode: false };
  if (!(e instanceof ApiError)) return { ...base, title: 'Something went wrong', body: 'Please try again.', tone: 'red' };
  switch (e.code) {
    case 'invalid_code': {
      const left = typeof e.details.triesLeft === 'number' ? e.details.triesLeft : null;
      // The fifth wrong code kills it: no tries left means "request a new code", as for too_many_attempts.
      if (left === 0) return tooManyTries();
      return {
        ...base,
        title: 'That code is not right',
        body: left === null ? 'Check your email and try again.' : `Check your email and try again. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
        tone: 'red',
        clearCode: true,
        invalidBoxes: true,
      };
    }
    case 'too_many_attempts':
      return tooManyTries();
    case 'code_expired':
      return {
        ...base,
        title: 'This code has expired',
        body: `Codes work for ${minutesLabel(expiresMinutes(expiresInSeconds))}. Send a new one below.`,
        tone: 'amber',
        clearCode: true,
        needsNewCode: true,
      };
    case 'otp_cooldown':
      return { ...base, title: 'Please wait a moment', body: waitCopy(e.retryAfterSeconds), tone: 'amber', waitSeconds: e.retryAfterSeconds ?? undefined };
    case 'otp_hourly_limit':
      return { ...base, title: 'Too many codes', body: hourlyCopy(e.retryAfterSeconds), tone: 'amber', waitSeconds: e.retryAfterSeconds ?? undefined };
    case 'account_suspended':
      return { ...base, title: 'This account is suspended', body: 'Please contact support.', tone: 'red' };
    case 'network_error':
      return { ...base, title: 'You seem to be offline', body: 'Check your connection, then tap Verify again.', tone: 'amber' };
    case 'rate_limited':
      return { ...base, title: 'Please wait a moment', body: waitCopy(e.retryAfterSeconds), tone: 'amber', waitSeconds: e.retryAfterSeconds ?? undefined };
    default:
      return { ...base, title: 'Something went wrong', body: e.status >= 500 ? 'Something went wrong on our side. Please try again in a moment.' : 'Please try again.', tone: 'red' };
  }
}

function tooManyTries(): ErrorBox {
  return {
    title: 'Too many tries',
    body: 'Request a new code.',
    tone: 'red',
    clearCode: true,
    locksVerify: true,
    invalidBoxes: true,
    needsNewCode: true,
  };
}

/** What a failed "Send code" shows: the inline email message, or the box for rate limits and connection problems. */
export type EmailError = { kind: 'email'; message: string } | { kind: 'box'; box: ErrorBox };

export function emailRequestError(e: unknown, expiresInSeconds = 300): EmailError {
  if (e instanceof ApiError && (e.code === 'invalid_email' || e.code === 'validation_error')) {
    return { kind: 'email', message: INVALID_EMAIL_MESSAGE };
  }
  return { kind: 'box', box: codeErrorBox(e, expiresInSeconds) };
}

/** Label of the resend button: the countdown, then "Resend code" (or "Send a new code" when this one is dead). */
export function resendLabel(remainingSeconds: number, needsNewCode: boolean): string {
  if (remainingSeconds > 0) return `Resend code in ${mmss(remainingSeconds)}`;
  return needsNewCode ? 'Send a new code' : 'Resend code';
}

// ───────────────────────── The state machine

export interface SignInState {
  step: 'email' | 'code';
  /** What is shown in the box under the digits (or under the email address for rate limits). */
  box: ErrorBox | null;
  emailError: string | null;
  expiresInSeconds: number;
  /** The code has been killed (too many tries): Verify stays locked until a new code is requested. */
  locked: boolean;
  /** The last error says the current code is no use (expired / dead). */
  needsNewCode: boolean;
}

export const initialSignInState: SignInState = {
  step: 'email',
  box: null,
  emailError: null,
  expiresInSeconds: 300,
  locked: false,
  needsNewCode: false,
};

export type SignInAction =
  | { type: 'codeSent'; response: OtpRequestResponse }
  | { type: 'requestFailed'; error: EmailError }
  | { type: 'verifyFailed'; box: ErrorBox }
  | { type: 'resendFailed'; box: ErrorBox }
  | { type: 'typing' }
  | { type: 'useDifferentEmail' };

export function signInReducer(state: SignInState, action: SignInAction): SignInState {
  switch (action.type) {
    case 'codeSent':
      return { step: 'code', box: null, emailError: null, expiresInSeconds: action.response.expiresInSeconds, locked: false, needsNewCode: false };
    case 'requestFailed':
      return action.error.kind === 'email'
        ? { ...state, step: 'email', emailError: action.error.message, box: null }
        : { ...state, step: 'email', emailError: null, box: action.error.box };
    case 'verifyFailed':
      return { ...state, box: action.box, locked: action.box.locksVerify, needsNewCode: action.box.needsNewCode };
    case 'resendFailed':
      return { ...state, box: action.box };
    case 'typing':
      // Typing after a wrong code takes the red state away; a dead code stays dead.
      return state.locked || state.needsNewCode ? state : { ...state, box: null };
    case 'useDifferentEmail':
      return { ...initialSignInState, expiresInSeconds: state.expiresInSeconds };
  }
}
