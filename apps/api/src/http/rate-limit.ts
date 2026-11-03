import type { Request, RequestHandler } from 'express';
import { tooMany } from './errors';

/**
 * Fixed-window rate limiter held in memory.
 * Good for one API instance; behind several instances the limits are per instance (put a shared store such as
 * Redis behind `RateStore` if that matters). Complements, not replaces, the per-email OTP limits kept in the database.
 */
export interface RateStore {
  /** Count one hit for `key`; returns the hits in the current window and seconds until it resets. */
  hit(key: string, windowMs: number, now: number): { count: number; resetInSeconds: number };
}

export class MemoryRateStore implements RateStore {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private lastSweep = 0;

  hit(key: string, windowMs: number, now: number) {
    if (now - this.lastSweep > 60_000) this.sweep(now);
    let w = this.windows.get(key);
    if (!w || now - w.start >= windowMs) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    w.count++;
    return { count: w.count, resetInSeconds: Math.max(1, Math.ceil((w.start + windowMs - now) / 1000)) };
  }

  /** Drop windows that ended long ago so the map cannot grow without bound. */
  private sweep(now: number) {
    this.lastSweep = now;
    for (const [k, w] of this.windows) if (now - w.start > 3_600_000) this.windows.delete(k);
  }

  get size() { return this.windows.size; }
}

export interface LimitOptions {
  /** Name shown in the key so different limiters never share a counter. */
  name: string;
  windowSeconds: number;
  max: number;
  /** Default: the client IP. Use the user id for signed-in endpoints. */
  key?: (req: Request) => string;
}

export interface Limiter {
  (opts: LimitOptions): RequestHandler;
}

/** `enabled=false` returns pass-through middleware (development and most tests). */
export function createLimiter(enabled: boolean, store: RateStore = new MemoryRateStore(), now: () => number = Date.now): Limiter {
  return (opts) => {
    if (!enabled) return (_req, _res, next) => next();
    return (req, _res, next) => {
      const who = opts.key ? opts.key(req) : (req.ip ?? 'unknown');
      const r = store.hit(`${opts.name}:${who}`, opts.windowSeconds * 1000, now());
      if (r.count > opts.max) return next(tooMany('rate_limited', r.resetInSeconds));
      next();
    };
  };
}
