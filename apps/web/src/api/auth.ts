import { clearSessionHint, setSessionHint } from '../lib/sessionHint';
import { api } from './client';
import type { AuthResponse, OtpRequestResponse } from './types';

function rememberSession(r: AuthResponse): AuthResponse {
  setSessionHint();
  return r;
}

export type OtpPurpose = 'sign_up' | 'sign_in';

export const requestOtp = (input: { purpose: OtpPurpose; email: string; countryCode?: string }) =>
  api<OtpRequestResponse>('/auth/otp/request', { method: 'POST', body: input });

export const signUp = (input: { countryCode: string; email: string; name: string; code: string; guestTokens: string[] }) =>
  api<AuthResponse>('/auth/sign-up', { method: 'POST', body: input }).then(rememberSession);

export const signIn = (input: { email: string; code: string; guestTokens: string[] }) =>
  api<AuthResponse>('/auth/sign-in', { method: 'POST', body: input }).then(rememberSession);

export const signOut = () => api<void>('/auth/sign-out', { method: 'POST' }).finally(() => clearSessionHint());
