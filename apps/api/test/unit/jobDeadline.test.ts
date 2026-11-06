import { describe, expect, it } from 'vitest';
import { deriveJobDeadline } from '../../src/domain/jobDeadline';

const now = new Date('2026-11-05T10:00:00Z');
const day = 86_400_000;
const at = (offsetDays: number) => new Date(now.getTime() + offsetDays * day);

describe('deriveJobDeadline', () => {
  it('picks the nearest upcoming deadline', () => {
    expect(deriveJobDeadline([at(10), at(3), at(7)], now)).toEqual(at(3));
  });

  it('falls back to the most recent past deadline when none are upcoming', () => {
    expect(deriveJobDeadline([at(-10), at(-1), at(-5)], now)).toEqual(at(-1));
  });

  it('prefers an upcoming deadline over any past one', () => {
    expect(deriveJobDeadline([at(-1), at(5)], now)).toEqual(at(5));
  });

  it('returns null when every deadline is null', () => {
    expect(deriveJobDeadline([null, null], now)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(deriveJobDeadline([], now)).toBeNull();
  });

  it('ignores nulls mixed in with real dates', () => {
    expect(deriveJobDeadline([null, at(4), null], now)).toEqual(at(4));
  });
});
