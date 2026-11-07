import { describe, expect, it } from 'vitest';
import { otherJobs } from './AlsoIncluded';
import { sourceLine } from './ExamSourceNote';
import { attemptsBadge } from './JobMockTestRow';

describe('job page parts', () => {
  it('shows the best score and the attempts next to a mock taken before, and nothing otherwise', () => {
    expect(attemptsBadge({ count: 2, bestPercent: 64.6 })).toBe('65% · 2 attempts');
    expect(attemptsBadge({ count: 1, bestPercent: null })).toBe('1 attempt');
    expect(attemptsBadge(null)).toBeNull();
    expect(attemptsBadge(undefined)).toBeNull();
  });

  it('counts only the other jobs, so the numbers are never overstated', () => {
    const jobs = [{ jobSlug: 'a', jobName: 'A', mockTestCount: 5 }, { jobSlug: 'b', jobName: 'B', mockTestCount: 3 }];
    expect(otherJobs(jobs, 'a')).toEqual({ names: ['B'], count: 1, mockTests: 3 });
    expect(otherJobs(jobs, null)).toEqual({ names: ['A', 'B'], count: 2, mockTests: 8 });
  });

  it('never claims past papers or a match with the real exam', () => {
    for (const line of [sourceLine('Accountant', false), sourceLine('x', true)]) {
      expect(line).toContain('not real or past exam papers');
      expect(line).not.toMatch(/experts?|mirror|guarantee|reviewed/i);
    }
    expect(sourceLine('Accountant', false)).toContain('published job advert for Accountant');
  });
});
