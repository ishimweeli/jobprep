import { describe, expect, it } from 'vitest';
import type { AttemptState } from '../../api/types';
import { attemptEndedView } from './AttemptEnded';

const state = (over: Partial<AttemptState['attempt']> = {}, counts = { total: 50, answered: 47, flagged: 0 }) => ({
  attempt: { id: 'a1', status: 'SUBMITTED', kind: 'FULL', startedAt: '', deadlineAt: '', durationSeconds: 60, submittedAt: '', mockTest: { slug: 'math', title: 'Maths', countryCode: 'RW' }, ...over } as AttemptState['attempt'],
  counts,
});

describe('finished attempt reopen (C9)', () => {
  it('a submitted mock test offers results and a new attempt', () => {
    const v = attemptEndedView(state(), 'rw');
    expect(v.title).toBe('This attempt has ended');
    expect(v.resultsTo).toBe('/rw/results/a1');
    expect(v.newAttemptTo).toBe('/rw/tests/math/start');
    expect(v.body).toBe('It was submitted with 47 of 50 questions answered. Nothing you answered was lost.');
  });
  it('an auto-submitted one says so', () => {
    expect(attemptEndedView(state({ status: 'AUTO_SUBMITTED' }), 'rw').body).toMatch(/submitted automatically when time ran out/);
  });
  it('follows the API reopen block: not allowed without Full Access', () => {
    const reopen = { ended: true, autoSubmitted: false, canStartNew: false, startNewReason: 'needs_full_access', mockTestSlug: 'math', countryCode: 'RW' } as const;
    const v = attemptEndedView({ ...state(), reopen }, 'rw');
    expect(v.newAttemptTo).toBeNull();
    expect(v.accessNote).toBe('A new attempt of this test needs Full Access.');
    expect(v.accessTo).toBe('/rw/tests/math');
  });
  it('a practice set has no "new attempt" of the same test', () => {
    const v = attemptEndedView(state({ kind: 'PRACTICE' }), 'rw');
    expect(v.newAttemptTo).toBeNull();
    expect(v.fallbackTo).toBe('/rw/progress');
  });
});
