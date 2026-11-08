import { guestTokenHeader } from '../lib/guestTokens';
import { clearSessionHint, hasSessionHint } from '../lib/sessionHint';
import { isMaintenanceResponse, setSystemState } from '../lib/systemState';

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
  /** The API's `X-Request-Id` / body `requestId`: the "Reference" on the error page. */
  readonly requestId: string | null;

  constructor(status: number, code: string, details: Record<string, unknown> = {}, retryAfterSeconds: number | null = null, requestId: string | null = null) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
    this.requestId = requestId;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
  /** Let the request outlive the page (a last autosave while the tab closes). */
  keepalive?: boolean;
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
export function toApiError(status: number, body: unknown, retryAfterHeader: string | null, requestIdHeader: string | null = null): ApiError {
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof obj.error === 'string' ? obj.error : `http_${status}`;
  let retry: number | null = null;
  if (typeof obj.retryAfterSeconds === 'number') retry = obj.retryAfterSeconds;
  else if (retryAfterHeader && Number.isFinite(Number(retryAfterHeader))) retry = Number(retryAfterHeader);
  const { error: _error, requestId: bodyRequestId, ...details } = obj;
  const requestId = typeof bodyRequestId === 'string' ? bodyRequestId : requestIdHeader;
  return new ApiError(status, code, details, retry, requestId);
}

/** Guests identify their attempts with the secret `X-Guest-Token` header; signed-in users use the session cookie. */
function requestHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (hasBody) headers['Content-Type'] = 'application/json';
  const guest = guestTokenHeader();
  if (guest) headers['X-Guest-Token'] = guest;
  return headers;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: requestHeaders(opts.body !== undefined),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      keepalive: opts.keepalive,
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
  if (!res.ok) {
    const err = toApiError(res.status, body, res.headers.get('Retry-After'), res.headers.get('X-Request-Id'));
    reportSystemCondition(path, err, body !== null);
    throw err;
  }
  return body as T;
}

interface RawOptions {
  /** JSON (stringified) or raw bytes (a file, a recording) sent with their own content type. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function send(path: string, opts: RawOptions, accept: string): Promise<Response> {
  const raw = opts.body instanceof Blob;
  const headers: Record<string, string> = { ...requestHeaders(opts.body !== undefined && !raw), Accept: accept, ...opts.headers };
  if (raw && !headers['Content-Type']) headers['Content-Type'] = (opts.body as Blob).type || 'application/octet-stream';
  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method: 'POST', credentials: 'include', headers, signal: opts.signal,
      body: opts.body === undefined ? undefined : raw ? (opts.body as Blob) : JSON.stringify(opts.body),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error');
  }
  if (!res.ok) {
    let body: unknown = null;
    try { body = JSON.parse(await res.text()); } catch { body = null; }
    const err = toApiError(res.status, body, res.headers.get('Retry-After'), res.headers.get('X-Request-Id'));
    reportSystemCondition(path, err, body !== null);
    throw err;
  }
  return res;
}

/** POST raw bytes (an uploaded file) and read a JSON answer. */
export async function apiUpload<T>(path: string, file: Blob, headers: Record<string, string> = {}): Promise<T> {
  const res = await send(path, { body: file, headers }, 'application/json');
  return (await res.json()) as T;
}

/** One server-sent event. */
export interface StreamEvent { event: string; data: Record<string, unknown> }

/** Split a text/event-stream buffer into complete events and the unfinished rest. Exported for tests. */
export function parseEvents(buffer: string): { events: StreamEvent[]; rest: string } {
  const frames = buffer.split('\n\n');
  const rest = frames.pop() ?? '';
  const events: StreamEvent[] = [];
  for (const f of frames) {
    if (!f.trim()) continue;
    const event = /^event: ?(.*)$/m.exec(f)?.[1]?.trim() ?? 'message';
    const dataLine = /^data: ?(.*)$/m.exec(f)?.[1] ?? '{}';
    try {
      events.push({ event, data: JSON.parse(dataLine) as Record<string, unknown> });
    } catch {
      /* a malformed frame is skipped */
    }
  }
  return { events, rest };
}

/**
 * POST and read the answer as server-sent events, calling `onEvent` for each as it arrives. An `error` event from
 * the server (after the stream started) rejects with an ApiError carrying its code.
 */
export async function apiStream(path: string, opts: RawOptions, onEvent: (e: StreamEvent) => void): Promise<void> {
  const res = await send(path, opts, 'text/event-stream');
  if (!res.body) throw new ApiError(0, 'network_error');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const parsed = parseEvents(done ? `${buffer}\n\n` : buffer);
      buffer = parsed.rest;
      for (const e of parsed.events) {
        if (e.event === 'error') {
          throw new ApiError(502, typeof e.data.error === 'string' ? e.data.error : 'stream_failed', {}, null, typeof e.data.requestId === 'string' ? e.data.requestId : null);
        }
        onEvent(e);
      }
      if (done) break;
    }
  } catch (e) {
    if (e instanceof ApiError || (e instanceof DOMException && e.name === 'AbortError')) throw e;
    throw new ApiError(0, 'network_error');
  }
}

/**
 * Two failures replace the page instead of showing an inline error (SystemPages.dc): the service is down (503 or a
 * bare gateway error) and a 401 on a call that needs a session while this browser believes it is signed in.
 * `/auth/*`, the `/me` session probe and `/admin/*` (which has its own sign-in-again flow) never trigger it.
 */
function reportSystemCondition(path: string, err: ApiError, hadJsonBody: boolean): void {
  if (isMaintenanceResponse(err.status, hadJsonBody && err.code !== `http_${err.status}`)) {
    setSystemState('maintenance');
    return;
  }
  // `/admin/*` answers its own 401s (sign in again, with a return to the admin page): see admin/api/client.ts.
  if (err.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/admin/') && path !== '/me' && hasSessionHint()) {
    clearSessionHint();
    setSystemState('session_expired');
  }
}
