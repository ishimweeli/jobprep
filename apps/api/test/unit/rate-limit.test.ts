import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/http/errors';
import { createLimiter, MemoryRateStore } from '../../src/http/rate-limit';

const req = (ip: string, extra: Record<string, unknown> = {}) => ({ ip, ...extra }) as unknown as Request;
function run(mw: ReturnType<ReturnType<typeof createLimiter>>, r: Request): HttpError | null {
  let err: unknown = null;
  mw(r, {} as Response, ((e?: unknown) => { err = e ?? null; }) as NextFunction);
  return err as HttpError | null;
}

describe('rate limiter', () => {
  it('lets requests through up to the limit, then answers 429 with a retry time', () => {
    let t = 1_000_000;
    const mw = createLimiter(true, new MemoryRateStore(), () => t)({ name: 'x', windowSeconds: 60, max: 3 });
    expect([1, 2, 3].map(() => run(mw, req('1.1.1.1')))).toEqual([null, null, null]);
    t += 20_000;
    const blocked = run(mw, req('1.1.1.1'));
    expect(blocked).toBeInstanceOf(HttpError);
    expect(blocked).toMatchObject({ status: 429, code: 'rate_limited', extra: { retryAfterSeconds: 40 } });
  });

  it('starts a fresh window once the old one ends', () => {
    let t = 0;
    const mw = createLimiter(true, new MemoryRateStore(), () => t)({ name: 'x', windowSeconds: 60, max: 1 });
    expect(run(mw, req('a'))).toBeNull();
    expect(run(mw, req('a'))).not.toBeNull();
    t += 60_000;
    expect(run(mw, req('a'))).toBeNull();
  });

  it('counts per client and per limiter', () => {
    const limit = createLimiter(true, new MemoryRateStore(), () => 0);
    const a = limit({ name: 'a', windowSeconds: 60, max: 1 });
    const b = limit({ name: 'b', windowSeconds: 60, max: 1 });
    expect(run(a, req('1'))).toBeNull();
    expect(run(a, req('1'))).not.toBeNull();
    expect(run(a, req('2'))).toBeNull(); // another client
    expect(run(b, req('1'))).toBeNull(); // another limiter
  });

  it('can be keyed by something other than the IP', () => {
    const mw = createLimiter(true, new MemoryRateStore(), () => 0)({ name: 'u', windowSeconds: 60, max: 1, key: (r) => (r as unknown as { uid: string }).uid });
    expect(run(mw, req('same-ip', { uid: 'u1' }))).toBeNull();
    expect(run(mw, req('same-ip', { uid: 'u2' }))).toBeNull();
    expect(run(mw, req('same-ip', { uid: 'u1' }))).not.toBeNull();
  });

  it('does nothing when disabled', () => {
    const mw = createLimiter(false)({ name: 'x', windowSeconds: 60, max: 1 });
    for (let i = 0; i < 50; i++) expect(run(mw, req('1'))).toBeNull();
  });

  it('forgets old windows so memory cannot grow without bound', () => {
    const store = new MemoryRateStore();
    for (let i = 0; i < 100; i++) store.hit(`k${i}`, 1000, 0);
    expect(store.size).toBe(100);
    store.hit('later', 1000, 2 * 3_600_000);
    expect(store.size).toBe(1);
  });
});
