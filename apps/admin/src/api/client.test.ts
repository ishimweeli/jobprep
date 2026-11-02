import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, buildUrl, onSignInRequired, toApiError } from './client';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body?: unknown, headers?: Record<string, string>) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status, headers })));

describe('admin API client', () => {
  it('builds /api/admin URLs and drops empty query values', () => {
    expect(buildUrl('/users', { q: 'alice', filter: 'all', page: 2, x: '', y: undefined, z: null })).toBe('/api/admin/users?q=alice&filter=all&page=2');
    expect(buildUrl('/overview')).toBe('/api/admin/overview');
  });

  it('maps an error body to code, status and details', () => {
    const e = toApiError(400, { error: 'invalid_code', triesLeft: 3, requestId: 'r1' }, null);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 400, code: 'invalid_code', retryAfterSeconds: null });
    expect(e.details).toMatchObject({ triesLeft: 3 });
  });

  it('reads the wait from the 429 body, else from Retry-After', () => {
    expect(toApiError(429, { error: 'otp_cooldown', retryAfterSeconds: 31 }, '5').retryAfterSeconds).toBe(31);
    expect(toApiError(429, { error: 'rate_limited' }, '12').retryAfterSeconds).toBe(12);
  });

  it('falls back to http_<status> when the body has no code', () => {
    expect(toApiError(502, null, null).code).toBe('http_502');
    expect(toApiError(500, 'text', null).code).toBe('http_500');
  });

  it('a network failure is status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed'); }));
    await expect(api('/overview')).rejects.toMatchObject({ status: 0, code: 'network_error', isNetwork: true });
  });

  it('sends the cookie and a JSON body only when there is one', async () => {
    reply(200, { ok: true });
    await api('/settings', { method: 'PUT', body: { stuckAfterMinutes: 5 } });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/settings');
    expect(init).toMatchObject({ method: 'PUT', credentials: 'include', body: '{"stuckAfterMinutes":5}' });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('204 returns nothing', async () => {
    reply(204);
    await expect(api('/auth/sign-out', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('401 admin_sign_in_required on a data call runs the sign-in handler and still throws', async () => {
    reply(401, { error: 'admin_sign_in_required' });
    const handler = vi.fn();
    const off = onSignInRequired(handler);
    await expect(api('/overview')).rejects.toMatchObject({ status: 401, code: 'admin_sign_in_required' });
    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it('401 from the /auth calls (who am I, wrong sign-in) does not redirect', async () => {
    reply(401, { error: 'admin_sign_in_required' });
    const handler = vi.fn();
    const off = onSignInRequired(handler);
    await expect(api('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it('403 and 404 do not redirect', async () => {
    const handler = vi.fn();
    const off = onSignInRequired(handler);
    reply(403, { error: 'admin_forbidden' });
    await expect(api('/team')).rejects.toMatchObject({ status: 403 });
    reply(404, { error: 'user_not_found' });
    await expect(api('/users/x')).rejects.toMatchObject({ status: 404 });
    expect(handler).not.toHaveBeenCalled();
    off();
  });
});
