import { describe, expect, it } from 'vitest';
import { activeJobSearches, deriveJobDeadline } from '../../src/domain/jobDeadline';

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

describe('activeJobSearches', () => {
  const now = new Date('2026-11-07T12:00:00Z');
  const mock = (examId: string, examName: string, deadline: string | null) => ({ examId, examName, jobDeadlineAt: deadline ? new Date(deadline) : null });

  it('leaves out jobs whose deadline has passed', () => {
    expect(activeJobSearches([mock('a', 'Closed job', '2026-11-01'), mock('b', 'Open job', '2026-11-20')], now)).toEqual(['Open job']);
  });

  it('puts the soonest closing first, then jobs with no deadline, most mock exams first', () => {
    const list = [mock('a', 'No deadline, one', null), mock('b', 'No deadline, two', null), mock('b', 'No deadline, two', null), mock('c', 'Closes later', '2026-12-01'), mock('d', 'Closes soon', '2026-11-10')];
    expect(activeJobSearches(list, now)).toEqual(['Closes soon', 'Closes later', 'No deadline, two', 'No deadline, one']);
  });

  it('names each job once, and keeps to the limit', () => {
    const list = ['a', 'b', 'c'].flatMap((id) => [mock(id, id, null), mock(id, id, null)]);
    expect(activeJobSearches(list, now, 2)).toHaveLength(2);
    expect(new Set(activeJobSearches(list, now)).size).toBe(3);
  });

  it('a job with one open mock among closed ones is still active', () => {
    expect(activeJobSearches([mock('a', 'Job', '2026-11-01'), mock('a', 'Job', '2026-11-30')], now)).toEqual(['Job']);
  });

  it('suggests nothing when no job is open', () => {
    expect(activeJobSearches([mock('a', 'Closed', '2026-01-01')], now)).toEqual([]);
    expect(activeJobSearches([], now)).toEqual([]);
  });
});
