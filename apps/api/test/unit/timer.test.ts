import { describe, expect, it } from 'vitest';
import { acceptsSaves, isExpired, remainingSeconds, timerState } from '../../src/domain/timer';

const startedAt = new Date('2026-11-02T08:00:00Z');
const attempt = { startedAt, durationSeconds: 3600 };
const at = (secs: number) => new Date(startedAt.getTime() + secs * 1000);

describe('server timer', () => {
  it('computes remaining time from the server clock only', () => {
    expect(remainingSeconds(attempt, at(0))).toBe(3600);
    expect(remainingSeconds(attempt, at(1800))).toBe(1800);
    expect(remainingSeconds(attempt, at(3599.2))).toBe(1);
  });
  it('clamps at zero after the deadline and reports expiry', () => {
    expect(remainingSeconds(attempt, at(4000))).toBe(0);
    expect(isExpired(attempt, at(3599))).toBe(false);
    expect(isExpired(attempt, at(3600))).toBe(true);
  });
  it('a refresh or second device sees the same remaining time (pure function of attempt + now)', () => {
    expect(remainingSeconds(attempt, at(1234))).toBe(remainingSeconds({ ...attempt }, at(1234)));
  });
  it('flags the low-time state under five minutes only while running', () => {
    expect(timerState(attempt, at(3600 - 301)).low).toBe(false);
    expect(timerState(attempt, at(3600 - 299)).low).toBe(true);
    expect(timerState(attempt, at(3600)).low).toBe(false);
    expect(timerState(attempt, at(3600)).expired).toBe(true);
  });
  it('accepts a late-delivered save inside the grace window but not after', () => {
    expect(acceptsSaves(attempt, at(3603))).toBe(true);
    expect(acceptsSaves(attempt, at(3606))).toBe(false);
  });
});
