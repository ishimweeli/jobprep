import { afterEach, describe, expect, it } from 'vitest';
import { clearStoredPreferredJob, getStoredPreferredJob, PREFERRED_JOB_KEY, setStoredPreferredJob } from '../../lib/preferredJob';

// `usePreferredJobSlug` reads straight from these for a guest (see usePreferredJob.ts); the signed-in,
// server-persisted path (cache write on set/clear) is exercised end to end in job-detail/JobDetailPage.test.tsx.

afterEach(() => localStorage.clear());

describe('guest preferred-job storage', () => {
  it('round-trips a job slug', () => {
    expect(getStoredPreferredJob('rw')).toBeNull();
    setStoredPreferredJob('rw-cpd-coordination-officer');
    expect(localStorage.getItem(PREFERRED_JOB_KEY)).toBe('rw-cpd-coordination-officer');
    expect(getStoredPreferredJob('rw')).toBe('rw-cpd-coordination-officer');
    clearStoredPreferredJob();
    expect(getStoredPreferredJob('rw')).toBeNull();
  });

  it('ignores a stored job from a different country (the Exam.slug country prefix no longer matches)', () => {
    setStoredPreferredJob('rw-cpd-coordination-officer');
    expect(getStoredPreferredJob('rw')).toBe('rw-cpd-coordination-officer');
    expect(getStoredPreferredJob('ke')).toBeNull();
  });

  it('is case-insensitive on the country code', () => {
    setStoredPreferredJob('rw-cpd-coordination-officer');
    expect(getStoredPreferredJob('RW')).toBe('rw-cpd-coordination-officer');
  });
});
