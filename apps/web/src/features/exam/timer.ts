import type { TimerState } from '../../api/types';

/**
 * Display-only countdown maths. The SERVER owns the deadline: a sync records how many seconds the server said
 * were left, and the screen counts down from that using the browser's monotonic clock (`performance.now()`),
 * which a changed device clock or time zone cannot move. The device's wall clock is never compared to a deadline.
 */
export interface TimerSync {
  /** Seconds left according to the server, at the moment `atPerf` (fractional). */
  remainingSeconds: number;
  /** `performance.now()` at that moment. */
  atPerf: number;
}

/** Build a sync from a server timer. `sentPerf`/`receivedPerf` bracket the request: the server's "now" is the midpoint. */
export function syncFromServer(timer: Pick<TimerState, 'remainingSeconds' | 'serverNow' | 'deadlineAt'>, sentPerf: number, receivedPerf: number): TimerSync {
  const deadline = Date.parse(timer.deadlineAt);
  const serverNow = Date.parse(timer.serverNow);
  // deadline - serverNow is exact to the millisecond (both are server clock); fall back to the rounded field.
  const exact = Number.isFinite(deadline) && Number.isFinite(serverNow) ? (deadline - serverNow) / 1000 : timer.remainingSeconds;
  return { remainingSeconds: Math.max(0, exact), atPerf: (sentPerf + receivedPerf) / 2 };
}

/** Fractional seconds left right now. */
export function secondsLeft(sync: TimerSync, perfNow: number): number {
  return Math.max(0, sync.remainingSeconds - (perfNow - sync.atPerf) / 1000);
}

/** Whole seconds shown on the clock (rounded up, like the server: 0 means the time is really up). */
export function displaySeconds(sync: TimerSync, perfNow: number): number {
  return Math.ceil(secondsLeft(sync, perfNow));
}

/** Under 5 minutes the clock turns red (the API's `timer.low`). */
export const LOW_TIME_SECONDS = 300;
export const isLow = (seconds: number) => seconds > 0 && seconds < LOW_TIME_SECONDS;

/** "42:18" (minutes are not wrapped into hours, as in the design). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`;
}

/** Re-ask the server about every 30 seconds, on focus and when the connection returns. */
export const RESYNC_INTERVAL_MS = 30_000;
