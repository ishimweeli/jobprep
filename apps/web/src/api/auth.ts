import { removeStorage, writeStorage } from '../lib/storage';
import { api } from './client';
import { SESSION_HINT_KEY } from './me';
import type { AuthResponse, OtpRequestResponse } from './types';

function rememberSession(r: AuthResponse): AuthResponse {
  writeStorage(SESSION_HINT_KEY, '1');
  return r;
}

export type OtpPurpose = 'sign_up' | 'sign_in';

export const requestOtp = (input: { purpose: OtpPurpose; phone: string; countryCode?: string }) =>
  api<OtpRequestResponse>('/auth/otp/request', { method: 'POST', body: input });

export const signUp = (input: { countryCode: string; phone: string; name: string; code: string; guestTokens: string[] }) =>
  api<AuthResponse>('/auth/sign-up', { method: 'POST', body: input }).then(rememberSession);

export const signIn = (input: { phone: string; countryCode?: string; code: string; guestTokens: string[] }) =>
  api<AuthResponse>('/auth/sign-in', { method: 'POST', body: input }).then(rememberSession);

export const signOut = () => api<void>('/auth/sign-out', { method: 'POST' }).finally(() => removeStorage(SESSION_HINT_KEY));
