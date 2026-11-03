import { clearSessionHint, setSessionHint } from '../lib/sessionHint';
import { api } from './client';
import type { AuthProviders, AuthResponse, OtpRequestResponse, SignUpResponse } from './types';

function rememberSession(r: AuthResponse): AuthResponse {
  setSessionHint();
  return r;
}

export const authKeys = { providers: ['auth', 'providers'] as const };

/** Which "Continue with" buttons the server can honour (Google needs its keys configured). */
export const getProviders = () => api<AuthProviders>('/auth/providers');

/** Browser navigation target of "Continue with Google": the API redirects to Google and comes back to `/auth/callback?next=`. */
export function googleStartUrl(opts: { next?: string | null; countryCode?: string | null }): string {
  const params = new URLSearchParams();
  if (opts.next) params.set('next', opts.next);
  if (opts.countryCode) params.set('countryCode', opts.countryCode.toUpperCase());
  const qs = params.toString();
  return `/api/auth/google/start${qs ? `?${qs}` : ''}`;
}

/** Creates the account (not signed in yet): a 6-digit code is emailed to the address. */
export const signUp = (input: { name: string; email: string; password: string; countryCode?: string; guestTokens: string[] }) =>
  api<SignUpResponse>('/auth/sign-up', { method: 'POST', body: input });

/** Proves the address with the emailed code and signs the person in. */
export const verifyEmail = (input: { email: string; code: string; guestTokens: string[] }) =>
  api<AuthResponse>('/auth/verify-email', { method: 'POST', body: input }).then(rememberSession);

/** "Send a new code" / "Resend verification". The answer is the same for every address. */
export const resendVerification = (email: string) =>
  api<OtpRequestResponse>('/auth/verify-email/resend', { method: 'POST', body: { email } });

export const signIn = (input: { email: string; password: string; remember: boolean; guestTokens: string[] }) =>
  api<AuthResponse>('/auth/sign-in', { method: 'POST', body: input }).then(rememberSession);

export const forgotPassword = (email: string) => api<{ ok: true }>('/auth/forgot-password', { method: 'POST', body: { email } });

/** The address a reset link belongs to; 400 `invalid_or_expired_token` when the link is dead. */
export const checkResetToken = (token: string) => api<{ email: string }>('/auth/reset-password/check', { query: { token } });

/** Saves the new password. It does not sign the person in. */
export const resetPassword = (input: { token: string; password: string }) =>
  api<{ ok: true }>('/auth/reset-password', { method: 'POST', body: input });

export const signOut = () => api<void>('/auth/sign-out', { method: 'POST' }).finally(() => clearSessionHint());
