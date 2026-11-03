import { ApiError } from '../../api/client';
import { mmss } from '../../lib/format';

/**
 * The coloured box under the six digits of "Check your email" (VerifyEmail.dc). The numbers on screen come from the
 * API, never from the artboard: the code lifetime is `expiresInSeconds` and the resend wait `cooldownSeconds`, and a
 * wrong code carries `triesLeft`.
 */

export type ErrorTone = 'red' | 'amber';

export interface ErrorBox {
  title: string;
  body: string;
  tone: ErrorTone;
  /** The boxes are cleared so the user types a fresh code. */
  clearCode: boolean;
  /** "Verify" is disabled (the code is dead): ask for a new one. */
  locksVerify: boolean;
  /** Marks the digit boxes red. */
  invalidBoxes: boolean;
  /** The last error says the current code is no use (expired or dead): ask for a new one. */
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

/** A failed "Verify" (or a failed resend) as the artboard's coloured error box. */
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

/** Label of the "Send a new code" link (VerifyEmail.dc): the countdown from the API's wait, then the plain label. */
export function resendLabel(remainingSeconds: number): string {
  return remainingSeconds > 0 ? `Send a new code in ${mmss(remainingSeconds)}` : 'Send a new code';
}
