/**
 * Single typed fetch wrapper for the JobPrep API.
 * - Same-origin (`/api`, proxied in dev) with `credentials: 'include'` so the jp_session cookie flows.
 * - Every failure becomes one `ApiError { status, code }`; `status` 0 means the network failed.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, details: Record<string, unknown> = {}, retryAfterSeconds: number | null = null) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
}

export const API_BASE = '/api';

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

/** Map a non-2xx response body + headers to an ApiError. Exported for tests. */
export function toApiError(status: number, body: unknown, retryAfterHeader: string | null): ApiError {
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof obj.error === 'string' ? obj.error : `http_${status}`;
  let retry: number | null = null;
  if (typeof obj.retryAfterSeconds === 'number') retry = obj.retryAfterSeconds;
  else if (retryAfterHeader && Number.isFinite(Number(retryAfterHeader))) retry = Number(retryAfterHeader);
  const { error: _error, ...details } = obj;
  return new ApiError(status, code, details, retry);
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers:
        opts.body !== undefined
          ? { 'Content-Type': 'application/json', Accept: 'application/json' }
          : { Accept: 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error');
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) throw toApiError(res.status, body, res.headers.get('Retry-After'));
  return body as T;
}
