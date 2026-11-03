import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Config } from '../config';
import type { FetchLike } from '../payments/types';

/**
 * "Continue with Google": server-side authorization-code flow, no extra dependency.
 *  start    -> 302 to Google with a signed `state` (nonce + next + country); the nonce is also kept in a short-lived cookie
 *  callback -> state and cookie must agree; the code is exchanged at Google's token endpoint over TLS and the id_token
 *              claims are read straight from that response (issuer, audience, expiry and email_verified are still checked).
 */
export const GOOGLE_STATE_COOKIE = 'jp_google_state';
export const GOOGLE_STATE_TTL_SECONDS = 600;
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const googleConfigured = (c: Pick<Config, 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'>) =>
  c.GOOGLE_CLIENT_ID.length > 0 && c.GOOGLE_CLIENT_SECRET.length > 0;

export const googleRedirectUri = (c: Pick<Config, 'PUBLIC_API_URL'>) => `${c.PUBLIC_API_URL.replace(/\/$/, '')}/api/auth/google/callback`;

/** Only same-site paths: "/dashboard" yes; "//evil.com", "https://evil.com", "/\evil.com" no. Falls back to "/". */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 500) return '/';
  if (!next.startsWith('/') || next.startsWith('//') || /[\u0000-\u001f\\]/.test(next)) return '/';
  return next;
}

export interface StatePayload { n: string; next: string; cc: string | null; exp: number }

const sign = (secret: string, body: string) => createHmac('sha256', secret).update(`google-state|${body}`).digest('base64url');

export function createState(secret: string, input: { next: string; countryCode: string | null }, now: Date) {
  const nonce = randomBytes(18).toString('base64url');
  const payload: StatePayload = { n: nonce, next: input.next, cc: input.countryCode, exp: now.getTime() + GOOGLE_STATE_TTL_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { nonce, state: `${body}.${sign(secret, body)}` };
}

/** Returns the payload only when the signature is ours and it has not expired; otherwise null. */
export function readState(secret: string, state: unknown, now: Date): StatePayload | null {
  if (typeof state !== 'string') return null;
  const [body, mac, ...rest] = state.split('.');
  if (!body || !mac || rest.length > 0) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(secret, body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
    if (typeof p.n !== 'string' || typeof p.next !== 'string' || typeof p.exp !== 'number' || p.exp <= now.getTime()) return null;
    return p;
  } catch {
    return null;
  }
}

export function authorizeUrl(config: Config, state: string) {
  const q = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(config),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${AUTHORIZE_URL}?${q.toString()}`;
}

export interface GoogleIdentity { sub: string; email: string; name: string | null }

export class GoogleError extends Error {}

/** Exchange the code, then check the id_token claims. Throws GoogleError for anything that is not a clean success. */
export async function exchangeCode(config: Config, fetchFn: FetchLike, code: string, now: Date): Promise<GoogleIdentity> {
  let res;
  try {
    res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(config),
        grant_type: 'authorization_code',
      }).toString(),
    });
  } catch {
    throw new GoogleError('network');
  }
  if (!res.ok) throw new GoogleError(`token_http_${res.status}`);
  let tokens: { id_token?: unknown };
  try { tokens = JSON.parse(await res.text()) as { id_token?: unknown }; } catch { throw new GoogleError('token_body'); }
  if (typeof tokens.id_token !== 'string') throw new GoogleError('no_id_token');
  return identityFromIdToken(config, tokens.id_token, now);
}

export function identityFromIdToken(config: Pick<Config, 'GOOGLE_CLIENT_ID'>, idToken: string, now: Date): GoogleIdentity {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new GoogleError('id_token_format');
  let c: Record<string, unknown>;
  try { c = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<string, unknown>; } catch { throw new GoogleError('id_token_format'); }
  if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') throw new GoogleError('bad_issuer');
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(config.GOOGLE_CLIENT_ID)) throw new GoogleError('bad_audience');
  if (typeof c.exp !== 'number' || c.exp * 1000 <= now.getTime()) throw new GoogleError('expired');
  if (c.email_verified !== true && c.email_verified !== 'true') throw new GoogleError('email_not_verified');
  if (typeof c.email !== 'string' || !c.email.includes('@') || typeof c.sub !== 'string' || c.sub.length === 0) throw new GoogleError('missing_claims');
  return { sub: c.sub, email: c.email.trim().toLowerCase(), name: typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 80) : null };
}
