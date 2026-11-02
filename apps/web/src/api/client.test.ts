import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, buildUrl, toApiError } from './client';
import { getSession } from './me';
import { mockFetch } from '../test/utils';

afterEach(() => vi.unstubAllGlobals());

describe('toApiError', () => {
  it('maps the API error code and keeps extra details', () => {
    const e = toApiError(400, { error: 'invalid_code', foo: 1 }, null);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(400);
    expect(e.code).toBe('invalid_code');
    expect(e.details).toEqual({ foo: 1 });
    expect(e.retryAfterSeconds).toBeNull();
  });

  it('reads retryAfterSeconds from the body, else the Retry-After header', () => {
    expect(toApiError(429, { error: 'otp_cooldown', retryAfterSeconds: 31 }, '10').retryAfterSeconds).toBe(31);
    expect(toApiError(429, { error: 'otp_cooldown' }, '12').retryAfterSeconds).toBe(12);
    expect(toApiError(429, { error: 'otp_cooldown' }, 'soon').retryAfterSeconds).toBeNull();
  });

  it('falls back to http_<status> for non-JSON bodies', () => {
    expect(toApiError(502, null, null).code).toBe('http_502');
  });
});

describe('buildUrl', () => {
  it('drops empty query values', () => {
    expect(buildUrl('/x', { a: 'b', c: '', d: undefined, e: 2 })).toBe('/api/x?a=b&e=2');
    expect(buildUrl('/x')).toBe('/api/x');
  });
});

describe('api()', () => {
  it('sends credentials and JSON bodies', async () => {
    const { calls } = mockFetch(() => ({ body: { ok: true } }));
    await api('/auth/sign-out', { method: 'POST', body: { a: 1 } });
    expect(calls[0]!.init?.credentials).toBe('include');
    expect(calls[0]!.init?.body).toBe('{"a":1}');
  });

  it('turns a failed response into ApiError with status and code', async () => {
    mockFetch(() => ({ status: 429, body: { error: 'otp_cooldown', retryAfterSeconds: 40 }, headers: { 'Retry-After': '40' } }));
    await expect(api('/auth/otp/request', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 429,
      code: 'otp_cooldown',
      retryAfterSeconds: 40,
    });
  });

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/countries')).rejects.toMatchObject({ status: 0, code: 'network_error', isNetwork: true });
  });
});

describe('getSession', () => {
  it('does not call the API when this browser never signed in (no 401 noise)', async () => {
    const { fn } = mockFetch(() => ({ status: 401, body: { error: 'unauthorized' } }));
    expect(await getSession()).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('treats 401 as a guest and clears the hint', async () => {
    localStorage.setItem('jobprep.session', '1');
    mockFetch(() => ({ status: 401, body: { error: 'unauthorized' } }));
    expect(await getSession()).toBeNull();
    expect(localStorage.getItem('jobprep.session')).toBeNull();
  });
});
