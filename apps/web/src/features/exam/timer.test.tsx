import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimerResponse, TimerState } from '../../api/types';
import { displaySeconds, formatClock, isLow, secondsLeft, syncFromServer } from './timer';
import { useExamTimer } from './useExamTimer';

const server = (remainingSeconds: number, extra: Partial<TimerState> = {}): TimerState => {
  const now = Date.parse('2026-11-02T10:00:00.000Z');
  return {
    remainingSeconds: Math.ceil(remainingSeconds),
    serverNow: new Date(now).toISOString(),
    deadlineAt: new Date(now + remainingSeconds * 1000).toISOString(),
    low: remainingSeconds < 300,
    expired: remainingSeconds <= 0,
    ...extra,
  };
};

describe('timer maths', () => {
  it('counts down from the server value with the monotonic clock', () => {
    const sync = syncFromServer(server(2538), 1000, 1000);
    expect(displaySeconds(sync, 1000)).toBe(2538);
    expect(displaySeconds(sync, 1000 + 30_000)).toBe(2508);
    expect(secondsLeft(sync, 1000 + 3_000_000)).toBe(0);
  });

  it('uses deadline minus server now (both server clock), not the device clock', () => {
    // serverNow / deadlineAt are 90.5 s apart; the rounded field says 91.
    const sync = syncFromServer(server(90.5), 0, 0);
    expect(secondsLeft(sync, 0)).toBeCloseTo(90.5, 3);
  });

  it('puts the server time at the midpoint of the request, so slow networks do not make the clock run fast', () => {
    const sync = syncFromServer(server(100), 0, 2000); // request took 2 s
    expect(sync.atPerf).toBe(1000);
    expect(secondsLeft(sync, 2000)).toBeCloseTo(99, 3);
  });

  it('is not affected by the device wall clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
    const sync = syncFromServer(server(600), 5000, 5000);
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z')); // someone changes the phone's date
    expect(secondsLeft(sync, 5000)).toBe(600);
    vi.useRealTimers();
  });

  it('formats as mm:ss and goes red under 5 minutes only while running', () => {
    expect(formatClock(42 * 60 + 18)).toBe('42:18');
    expect(formatClock(5)).toBe('00:05');
    expect(formatClock(75 * 60)).toBe('75:00');
    expect(formatClock(0.2)).toBe('00:01');
    expect(isLow(301)).toBe(false);
    expect(isLow(299)).toBe(true);
    expect(isLow(1)).toBe(true);
    expect(isLow(0)).toBe(false);
  });
});

describe('useExamTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (fetchTimer: () => Promise<TimerResponse>, onExpired = vi.fn(), start = 100) => {
    let perf = 0;
    const hook = renderHook(() => useExamTimer({ initial: server(start), fetchTimer, onExpired, perfNow: () => perf }));
    const advance = async (ms: number) => {
      perf += ms;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };
    return { hook, advance, onExpired };
  };
  const timerResponse = (s: number, status: TimerResponse['status'] = 'IN_PROGRESS'): TimerResponse => ({ ...server(s), status });

  it('re-asks the server about every 30 s and adopts its value (drift correction)', async () => {
    const fetchTimer = vi.fn(async () => timerResponse(40)); // server says 40 s left at the 30 s mark (we would show 70)
    const { hook, advance } = setup(fetchTimer);
    await advance(29_000);
    expect(fetchTimer).not.toHaveBeenCalled();
    await advance(1_500);
    expect(fetchTimer).toHaveBeenCalledTimes(1);
    expect(hook.result.current.seconds).toBeLessThanOrEqual(40);
    expect(hook.result.current.seconds).toBeGreaterThanOrEqual(38);
  });

  it('re-syncs on tab focus and when the connection comes back', async () => {
    const fetchTimer = vi.fn(async () => timerResponse(90));
    const { advance } = setup(fetchTimer);
    await advance(1000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetchTimer).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(fetchTimer).toHaveBeenCalledTimes(2);
  });

  it('keeps counting when the server cannot be reached', async () => {
    const fetchTimer = vi.fn(async () => {
      throw new Error('offline');
    });
    const { hook, advance } = setup(fetchTimer);
    await advance(31_000);
    expect(hook.result.current.seconds).toBe(69);
  });

  it('at 0 asks the server, and calls onExpired once when it says the attempt is over', async () => {
    const fetchTimer = vi.fn(async () => timerResponse(0, 'AUTO_SUBMITTED'));
    const { hook, advance, onExpired } = setup(fetchTimer, vi.fn(), 2);
    await advance(2500);
    await advance(1000);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledWith('AUTO_SUBMITTED');
    expect(hook.result.current.seconds).toBe(0);
    await advance(10_000);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('offline at 0 it keeps asking every few seconds until the server answers', async () => {
    let fail = true;
    const fetchTimer = vi.fn(async () => {
      if (fail) throw new Error('offline');
      return timerResponse(0, 'AUTO_SUBMITTED');
    });
    const { advance, onExpired } = setup(fetchTimer, vi.fn(), 1);
    await advance(2000);
    await advance(7000);
    expect(onExpired).not.toHaveBeenCalled();
    fail = false;
    await advance(4000);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
