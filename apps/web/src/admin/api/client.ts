import { ApiError, api as webApi, buildUrl as webBuildUrl, isApiError, toApiError } from '../../api/client';

/**
 * The admin API client: the web app's own fetch wrapper (same origin, the normal `jp_session` cookie, one `ApiError`),
 * pointed at `/api/admin/*`. What it adds is the admin session rules: a 401 on a data call means the person must sign
 * in through the normal sign-in again, either because there is no session (`admin_sign_in_required`) or because the
 * last sign-in is more than 12 hours old (`admin_session_stale`). The registered handlers do that; the call still throws.
 */
export { ApiError, isApiError, toApiError };

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export const API_BASE = '/api/admin';

const flat = (query?: Query): Record<string, string | number | undefined | null> =>
  Object.fromEntries(Object.entries(query ?? {}).map(([k, v]) => [k, typeof v === 'boolean' ? String(v) : v]));

export const buildUrl = (path: string, query?: Query): string => webBuildUrl(`/admin${path}`, flat(query));

/** Why the person has to sign in again. `stale` gets the notice "Please sign in again to use the admin area". */
export type SignInReason = 'required' | 'stale';

/** The 401 codes of `/api/admin/*` and what each means for the UI. Anything else is an ordinary error. */
export function signInReasonOf(e: unknown): SignInReason | null {
  if (!isApiError(e) || e.status !== 401) return null;
  return e.code === 'admin_session_stale' ? 'stale' : 'required';
}

type SignInRequiredHandler = (reason: SignInReason) => void;
const handlers = new Set<SignInRequiredHandler>();

/** The admin area registers what happens on a lost or stale session (clear the cache, go to /sign-in). Returns an unsubscribe. */
export function onSignInRequired(fn: SignInRequiredHandler): () => void {
  handlers.add(fn);
  return () => void handlers.delete(fn);
}

/** `/me` is the guard's own probe: it handles its 401 itself, so it never triggers the handlers. */
const probes401 = (path: string) => path === '/me';

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await webApi<T>(`/admin${path}`, { ...opts, query: flat(opts.query) });
  } catch (e) {
    const reason = signInReasonOf(e);
    if (reason && !probes401(path)) handlers.forEach((fn) => fn(reason));
    throw e;
  }
}
