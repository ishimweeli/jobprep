import { ApiError } from '../api/client';
import { INVALID_EMAIL_MESSAGE } from './email';
import { mmss } from './format';

/** Friendly copy for API error codes. Never expose raw codes to the user. */
export function authErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (e.code) {
    case 'invalid_code':
      return 'That code is not right or has expired. Check your email and try again, or ask for a new code.';
    case 'code_expired':
      return 'This code has expired. Ask for a new code.';
    case 'too_many_attempts':
      return 'Too many wrong codes. Ask for a new code to try again.';
    case 'otp_cooldown':
      return e.retryAfterSeconds
        ? `Please wait ${mmss(e.retryAfterSeconds)} before asking for another code.`
        : 'Please wait a moment before asking for another code.';
    case 'otp_hourly_limit':
      return 'You have asked for too many codes. Please try again in about an hour.';
    case 'account_exists':
      return 'This email address already has an account.';
    case 'invalid_email':
      return INVALID_EMAIL_MESSAGE;
    case 'country_required':
    case 'invalid_country':
      return 'Please choose your country and try again.';
    case 'account_suspended':
      return 'This account is suspended. Please contact support.';
    case 'country_not_available':
      return 'Sign-up is not open in that country yet. You can join the waiting list instead.';
    case 'validation_error':
      return 'Please check your details and try again.';
    case 'network_error':
      return 'We could not reach JobPrep. Check your internet connection and try again.';
    default:
      return e.status >= 500 ? 'Something went wrong on our side. Please try again in a moment.' : 'Something went wrong. Please try again.';
  }
}
