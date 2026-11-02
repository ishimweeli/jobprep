import { useEffect, useRef, useState } from 'react';
import { displaySeconds, syncFromServer, type TimerSync } from './timer';

/**
 * A ticking "time left" for places that show an attempt the server reported on (resume prompt, dashboard card).
 * Counts down from the server's `remainingSeconds` with the monotonic clock, never the device clock.
 */
export function useRemaining(remainingSeconds: number, perfNow: () => number = () => performance.now()): number {
  const perf = useRef(perfNow);
  perf.current = perfNow;
  const make = (): TimerSync => syncFromServer({ remainingSeconds, serverNow: '', deadlineAt: '' }, perf.current(), perf.current());
  const sync = useRef<TimerSync>(make());
  const [seconds, setSeconds] = useState(() => displaySeconds(sync.current, perf.current()));
  useEffect(() => {
    sync.current = make();
    setSeconds(displaySeconds(sync.current, perf.current()));
    const id = setInterval(() => {
      const s = displaySeconds(sync.current, perf.current());
      setSeconds((prev) => (prev === s ? prev : s));
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds]);
  return seconds;
}
