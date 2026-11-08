import { ApiError } from '../api/client';
import { INVALID_EMAIL_MESSAGE } from './email';
import { mmss } from './format';

/**
 * The error-message catalogue (C28). One friendly line per situation the API reports, plus the action the screen offers.
 * Every non-success payment ending says "You were not charged." Raw codes are never shown. Pure, unit-tested.
 * Not drawn: the copy is the plainest wording in the voice of States.dc, TimeUp.dc and PayDone.dc.
 */

export type ErrorAction = 'sign_in' | 'create_account' | 'retry' | 'choose_country' | 'full_access' | 'results' | 'support' | 'wait' | 'none';

export interface ErrorCopy {
  message: string;
  action: ErrorAction;
}

const wait = (s: number | null | undefined) => (s && s > 0 ? `Try again in ${s < 60 ? `${Math.ceil(s)} s` : mmss(s)}.` : 'Please wait a moment and try again.');

type Entry = ErrorCopy | ((e: ApiError) => ErrorCopy);

const CATALOGUE: Record<string, Entry> = {
  // Sign-in and sign-up
  invalid_code: { message: 'That code is not right or has expired. Check your email and try again, or ask for a new code.', action: 'retry' },
  code_expired: { message: 'This code has expired. Ask for a new code.', action: 'retry' },
  too_many_attempts: (e) => ({
    message: e.retryAfterSeconds ? `Too many wrong tries. ${wait(e.retryAfterSeconds)}` : 'Too many wrong codes. Ask for a new code to try again.',
    action: 'wait',
  }),
  otp_cooldown: (e) => ({
    message: e.retryAfterSeconds ? `Please wait ${mmss(e.retryAfterSeconds)} before asking for another code.` : 'Please wait a moment before asking for another code.',
    action: 'wait',
  }),
  otp_hourly_limit: { message: 'You have asked for too many codes. Please try again in about an hour.', action: 'wait' },
  account_exists: { message: 'This email address already has an account.', action: 'sign_in' },
  email_not_sent: { message: 'We could not send the email just now. Please try again in a minute, or continue with Google.', action: 'retry' },
  invalid_email: { message: INVALID_EMAIL_MESSAGE, action: 'retry' },
  invalid_credentials: { message: 'The email or password is not right. Check them and try again.', action: 'retry' },
  email_not_verified: { message: 'This email address has not been confirmed yet. Check your inbox for the code.', action: 'retry' },
  account_suspended: { message: 'This account is suspended. Please contact support.', action: 'support' },
  user_suspended: { message: 'This account is suspended. Please contact support.', action: 'support' },
  sign_in_required: { message: 'Sign in to continue. Your answers on this device are safe.', action: 'sign_in' },
  unauthorized: { message: 'Sign in again to continue. Your answers on this device are safe.', action: 'sign_in' },
  // Country
  country_not_available: { message: 'Sign-up is not open in that country yet. You can join the waiting list instead.', action: 'choose_country' },
  country_required: { message: 'Please choose your country and try again.', action: 'choose_country' },
  invalid_country: { message: 'Please choose your country and try again.', action: 'choose_country' },
  country_mismatch: { message: 'This page is for another country. Your account is set to a different one.', action: 'choose_country' },
  language_not_available: { message: 'That language is not available in your country.', action: 'none' },
  // Exam
  full_access_required: { message: 'This test is part of Full Access. Get Full Access to start it.', action: 'full_access' },
  attempt_closed: { message: 'This exam has already ended. Your answers were kept: see your results.', action: 'results' },
  attempt_not_found: { message: 'We could not find that attempt. It may belong to another account.', action: 'none' },
  answer_first: { message: 'Answer the question first, then check it.', action: 'none' },
  no_weak_areas: { message: 'No weak areas to practise: every topic is doing well.', action: 'none' },
  not_enough_questions: { message: 'There are not enough questions for a practice set yet. Try another topic.', action: 'none' },
  answer_not_saved: { message: 'We could not save your last answer. It is kept on this device and will save when you are back online.', action: 'retry' },
  // Payments (every one says the person was not charged)
  invalid_phone: { message: 'Enter a valid Mobile Money number for the provider you chose.', action: 'retry' },
  payment_method_unavailable: { message: 'That payment method is not available right now. You were not charged. Choose another method.', action: 'retry' },
  payment_method_not_found: { message: 'That payment method is not available right now. You were not charged. Choose another method.', action: 'retry' },
  checkout_unavailable: { message: 'Payments are not open in this country yet. You were not charged.', action: 'none' },
  no_plan_for_country: { message: 'Payments are not open in this country yet. You were not charged.', action: 'none' },
  provider_unavailable: { message: 'We could not send the payment request. You were not charged. Try again.', action: 'retry' },
  provider_error: { message: 'We could not send the payment request. You were not charged. Try again.', action: 'retry' },
  payment_declined: { message: 'The payment was declined. You were not charged.', action: 'retry' },
  payment_not_found: { message: 'We could not find that payment. If you were charged, contact support with your transaction ID.', action: 'support' },
  // AI interview preparation
  insufficient_minutes: { message: 'You do not have enough interview minutes left. Get more to start an interview.', action: 'none' },
  interview_not_active: { message: 'This interview has already ended. Your feedback is on its report.', action: 'none' },
  interview_already_started: { message: 'This interview has already started.', action: 'none' },
  interview_not_found: { message: 'We could not find that interview.', action: 'none' },
  interview_job_not_found: { message: 'We could not find that job description.', action: 'none' },
  jd_unreadable: { message: 'We could not read that file. Upload a PDF, Word (.docx) or text file, or paste the text instead.', action: 'retry' },
  jd_too_short: { message: 'That is too short to be a job description. Paste the whole advert: title, responsibilities and qualifications.', action: 'retry' },
  jd_analysis_failed: { message: 'We could not read the job description just now. Please try again in a moment.', action: 'retry' },
  job_not_found: { message: 'We could not find that job.', action: 'none' },
  payload_too_large: { message: 'That file or recording is too large. Use a file under 5 MB, or keep answers under three minutes.', action: 'retry' },
  transcription_failed: { message: 'We could not hear your answer clearly. Please try again, or type it.', action: 'retry' },
  interviewer_unavailable: { message: 'The interviewer could not answer just now. Your time was not lost; please try again.', action: 'retry' },
  turn_in_progress: { message: 'Your previous answer is still being processed. Wait a moment and try again.', action: 'retry' },
  interview_not_evaluated: { message: 'The feedback for this interview is not ready yet.', action: 'none' },
  upgrade_unavailable: { message: 'The upgrade is no longer available for your account. Choose the full package instead. You were not charged.', action: 'none' },
  // Forms and general
  validation_error: { message: 'Please check your details and try again.', action: 'retry' },
  invalid_goal: { message: 'That job goal is not available in your country. Choose another.', action: 'retry' },
  email_taken: { message: 'That email address already has an account.', action: 'retry' },
  invalid_current_password: { message: 'Your current password is not right.', action: 'retry' },
  current_password_required: { message: 'Enter your current password to make this change.', action: 'retry' },
  same_email: { message: 'That is already your email address.', action: 'none' },
  network_error: { message: 'We could not reach JobPrep. Check your internet connection and try again.', action: 'retry' },
};

/** Friendly copy and the offered action for any error. Unknown codes fall back by HTTP status; nothing technical is shown. */
export function errorCopy(e: unknown): ErrorCopy {
  if (!(e instanceof ApiError)) return { message: 'Something went wrong. Please try again.', action: 'retry' };
  const entry = CATALOGUE[e.code];
  if (entry) return typeof entry === 'function' ? entry(e) : entry;
  if (e.status === 429) return { message: wait(e.retryAfterSeconds), action: 'wait' };
  return e.status >= 500
    ? { message: 'Something went wrong on our side. Please try again in a moment.', action: 'retry' }
    : { message: 'Something went wrong. Please try again.', action: 'retry' };
}

export const errorMessage = (e: unknown): string => errorCopy(e).message;

/** Every code the catalogue knows (for the unit test and the "no raw code" check). */
export const CATALOGUED_CODES = Object.keys(CATALOGUE);
