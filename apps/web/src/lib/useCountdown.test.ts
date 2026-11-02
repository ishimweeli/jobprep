import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from './useCountdown';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCountdown (OTP resend)', () => {
  it('counts down from the cooldown and finishes at zero', () => {
    const { result } = renderHook(() => useCountdown(45));
    expect(result.current.remaining).toBe(45);
    expect(result.current.done).toBe(false);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current.remaining).toBe(35);
    act(() => void vi.advanceTimersByTime(40_000));
    expect(result.current.remaining).toBe(0);
    expect(result.current.done).toBe(true);
  });

  it('restarts from a Retry-After value', () => {
    const { result } = renderHook(() => useCountdown(0));
    expect(result.current.done).toBe(true);
    act(() => result.current.start(31));
    expect(result.current.remaining).toBe(31);
    act(() => void vi.advanceTimersByTime(1_000));
    expect(result.current.remaining).toBe(30);
  });
});
