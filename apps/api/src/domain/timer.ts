/**
 * The server owns the clock. An attempt stores startedAt + durationSeconds; every remaining-time
 * value sent to the client is computed here from the server's `now`. The client timer is display only.
 */
export interface TimedAttempt {
  startedAt: Date;
  durationSeconds: number;
}

export function deadlineFor(startedAt: Date, durationSeconds: number): Date {
  return new Date(startedAt.getTime() + durationSeconds * 1000);
}

export function remainingSeconds(attempt: TimedAttempt, now: Date): number {
  const left = deadlineFor(attempt.startedAt, attempt.durationSeconds).getTime() - now.getTime();
  return Math.max(0, Math.ceil(left / 1000));
}

export function isExpired(attempt: TimedAttempt, now: Date): boolean {
  return remainingSeconds(attempt, now) === 0;
}

/**
 * Small grace window so an answer saved a moment before time-up (but delivered a moment after,
 * e.g. a flushed offline queue) is still accepted. Anything later is rejected.
 */
export const SAVE_GRACE_SECONDS = 5;

export function acceptsSaves(attempt: TimedAttempt, now: Date): boolean {
  const deadline = deadlineFor(attempt.startedAt, attempt.durationSeconds);
  return now.getTime() <= deadline.getTime() + SAVE_GRACE_SECONDS * 1000;
}

export function timerState(attempt: TimedAttempt, now: Date) {
  const remaining = remainingSeconds(attempt, now);
  return {
    remainingSeconds: remaining,
    serverNow: now.toISOString(),
    deadlineAt: deadlineFor(attempt.startedAt, attempt.durationSeconds).toISOString(),
    /** The design turns the timer red under 5 minutes. */
    low: remaining > 0 && remaining < 300,
    expired: remaining === 0,
  };
}
