import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSystemState } from '../../lib/systemState';
import { ApiError, api, buildUrl, onSignInRequired, signInReasonOf } from './client';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body?: unknown, headers?: Record<string, string>) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status, headers })));

describe('admin API client (the web app client, pointed at /api/admin)', () => {
  it('builds /api/admin URLs and drops empty query values', () => {
    expect(buildUrl('/users', { q: 'alice', filter: 'all', page: 2, x: '', y: undefined, z: null })).toBe('/api/admin/users?q=alice&filter=all&page=2');
    expect(buildUrl('/payments', { stuck: true })).toBe('/api/admin/payments?stuck=true');
    expect(buildUrl('/overview')).toBe('/api/admin/overview');
  });

  it('maps an error body to code, status and details', async () => {
    reply(400, { error: 'invalid_code', triesLeft: 3 });
    const e = await api('/x').catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 400, code: 'invalid_code', retryAfterSeconds: null });
    expect((e as ApiError).details).toMatchObject({ triesLeft: 3 });
  });

  it('a network failure is status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed'); }));
    await expect(api('/overview')).rejects.toMatchObject({ status: 0, code: 'network_error', isNetwork: true });
  });

  it('sends the normal session cookie and a JSON body only when there is one', async () => {
    reply(200, { ok: true });
    await api('/settings', { method: 'PUT', body: { stuckAfterMinutes: 5 } });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/settings');
    expect(init).toMatchObject({ method: 'PUT', credentials: 'include', body: '{"stuckAfterMinutes":5}' });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('204 returns nothing', async () => {
    reply(204);
    await expect(api('/anything', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('the admin session rules (401 / 403)', () => {
  it('401 admin_sign_in_required on a data call runs the handlers with "required" and still throws', async () => {
    reply(401, { error: 'admin_sign_in_required' });
    const handler = vi.fn();
    const off = onSignInRequired(handler);
    await expect(api('/overview')).rejects.toMatchObject({ status: 401, code: 'admin_sign_in_required' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('required');
    off();
  });

  it('401 admin_session_stale (signed in more than 12 hours ago) runs the handlers with "stale"', async () => {
    reply(401, { error: 'admin_session_stale' });
    const handler = vi.fn();
    const off = onSignInRequired(handler);
    await expect(api('/users')).rejects.toMatchObject({ status: 401, code: 'admin_session_stale' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('stale');
    off();
  });

  it('the /me probe handles its own 401 (the guard decides), so no handler runs', async () => {
    reply(401, { error: 'admin_session_stale' });
    const handler = vi.fn();
    const off = onSignInRequired(handler);
    await expect(api('/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it('403 admin_forbidden and 404 do not send anyone to sign-in', async () => {
    const handler = vi.fn();
    const off = onSignInRequired(handler);
    reply(403, { error: 'admin_forbidden' });
    await expect(api('/team')).rejects.toMatchObject({ status: 403 });
    reply(404, { error: 'user_not_found' });
    await expect(api('/users/x')).rejects.toMatchObject({ status: 404 });
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it('an admin 401 never turns into the candidate "session expired" page', async () => {
    localStorage.setItem('jobprep.session', '1');
    reply(401, { error: 'admin_session_stale' });
    await expect(api('/overview')).rejects.toBeInstanceOf(ApiError);
    expect(getSystemState()).toBeNull();
    expect(localStorage.getItem('jobprep.session')).toBe('1');
  });

  it('classifies the 401 codes', () => {
    expect(signInReasonOf(new ApiError(401, 'admin_session_stale'))).toBe('stale');
    expect(signInReasonOf(new ApiError(401, 'admin_sign_in_required'))).toBe('required');
    expect(signInReasonOf(new ApiError(403, 'admin_forbidden'))).toBeNull();
    expect(signInReasonOf(new Error('x'))).toBeNull();
  });
});
