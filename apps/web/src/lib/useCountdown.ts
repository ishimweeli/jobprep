import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whole-second countdown used for the OTP resend button.
 * Driven by a wall-clock deadline (not by counting ticks), so a throttled background tab catches up.
 * `start(seconds)` restarts it, e.g. with the API's `cooldownSeconds` or a 429 `Retry-After`.
 */
export function useCountdown(initialSeconds = 0, now: () => number = Date.now) {
  const [deadline, setDeadline] = useState<number>(() => (initialSeconds > 0 ? now() + initialSeconds * 1000 : 0));
  const [remaining, setRemaining] = useState(initialSeconds);
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - nowRef.current()) / 1000));
      setRemaining(left);
      if (left <= 0) setDeadline(0);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline]);

  const start = useCallback((seconds: number) => {
    setDeadline(seconds > 0 ? nowRef.current() + seconds * 1000 : 0);
    setRemaining(Math.max(0, Math.ceil(seconds)));
  }, []);

  return { remaining, start, done: remaining <= 0 };
}
