import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttemptStatus, TimerResponse, TimerState } from '../../api/types';
import { displaySeconds, RESYNC_INTERVAL_MS, syncFromServer, type TimerSync } from './timer';

interface Options {
  /** The timer from the attempt state; the clock starts from it. */
  initial: TimerState;
  /** `GET /api/attempts/:id/timer`. Failures (offline) are ignored: the clock keeps counting from the last sync. */
  fetchTimer: () => Promise<TimerResponse>;
  /** The server says the attempt is over (status AUTO_SUBMITTED / SUBMITTED, or expired). Called once. */
  onExpired: (status: AttemptStatus) => void;
  /** Injectable monotonic clock for tests. */
  perfNow?: () => number;
}

/**
 * The exam clock. Display only: it counts down from the last server sync with `performance.now()`, re-asks the
 * server about every 30 s, whenever the tab regains focus and whenever the browser comes back online, and asks
 * once more when the display hits 0 (the server then closes the attempt). The device's wall clock is never used.
 */
export function useExamTimer({ initial, fetchTimer, onExpired, perfNow = () => performance.now() }: Options) {
  const nowFn = useRef(perfNow);
  nowFn.current = perfNow;
  const syncRef = useRef<TimerSync>(syncFromServer(initial, nowFn.current(), nowFn.current()));
  const [seconds, setSeconds] = useState(() => displaySeconds(syncRef.current, nowFn.current()));
  const expiredRef = useRef(false);
  const fetchRef = useRef(fetchTimer);
  fetchRef.current = fetchTimer;
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;
  const resyncing = useRef(false);

  const resync = useCallback(async () => {
    if (resyncing.current || expiredRef.current) return;
    resyncing.current = true;
    const sent = nowFn.current();
    try {
      const t = await fetchRef.current();
      const received = nowFn.current();
      if (t.status !== 'IN_PROGRESS' || (t.expired && t.remainingSeconds <= 0)) {
        expiredRef.current = true;
        setSeconds(0);
        onExpiredRef.current(t.status);
        return;
      }
      syncRef.current = syncFromServer(t, sent, received);
      setSeconds(displaySeconds(syncRef.current, nowFn.current()));
    } catch {
      /* offline or a server hiccup: keep counting from the last sync and try again later */
    } finally {
      resyncing.current = false;
    }
  }, []);

  useEffect(() => {
    let lastZeroAsk = 0;
    const tick = () => {
      const s = displaySeconds(syncRef.current, nowFn.current());
      setSeconds((prev) => (prev === s ? prev : s));
      // At 0 ask the server (it closes the attempt); while it cannot be reached, keep asking every 3 s.
      if (s === 0 && !expiredRef.current && nowFn.current() - lastZeroAsk > 3000) {
        lastZeroAsk = nowFn.current();
        void resync();
      }
    };
    const id = setInterval(tick, 250);
    const periodic = setInterval(() => void resync(), RESYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void resync();
    };
    const onFocus = () => void resync();
    const onOnline = () => void resync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(id);
      clearInterval(periodic);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [resync]);

  return { seconds, resync };
}
