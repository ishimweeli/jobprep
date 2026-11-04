import { describe, expect, it } from 'vitest';
import type { ResultResponse } from '../../api/types';
import { AUTO_SUBMITTED_LINE, NO_WEAK_AREAS_LINE, PERFECT_SCORE_LINE, resultsFlags, resultsSummaryLine, ZERO_ANSWERED_LINE } from './resultsModel';

const topic = (id: string, percent: number) => ({ topicId: id, name: id, correct: 1, total: 2, marks: 1, marksAvailable: 2, percent, weak: percent < 60 });

function make(over: Partial<ResultResponse> = {}): ResultResponse {
  return {
    attempt: { id: 'a1', kind: 'FULL', status: 'SUBMITTED', autoSubmitted: false, startedAt: '', submittedAt: '', timeSpentSeconds: 60 },
    mockTest: { slug: 's', title: 'T', countryCode: 'RW', isFree: true },
    score: { marks: 5, totalMarks: 10, percent: 50 },
    counts: { total: 10, correct: 5, incorrect: 3, unanswered: 2 },
    passMark: null,
    noOfficialPassMark: true,
    comparison: null,
    history: [],
    topics: [topic('t1', 40), topic('t2', 80)],
    weakestTopic: { topicId: 't1', name: 't1', percent: 40 },
    reviewFirst: [],
    incorrectCount: 3,
    isGuest: false,
    canPractice: true,
    ...over,
  };
}

describe('results edge states', () => {
  it('a normal result has none of them and keeps the comparison', () => {
    const f = resultsFlags(make({ comparison: { previousAttemptId: 'p', previousPercent: 40, previousSubmittedAt: null, deltaPoints: 10, previousTimeSpentSeconds: 90 }, history: [{ attemptId: 'p', submittedAt: null, percent: 40, current: false }, { attemptId: 'a1', submittedAt: null, percent: 50, current: true }] }));
    expect(f).toMatchObject({ isPractice: false, autoSubmitted: false, zeroAnswered: false, perfect: false, noWeakAreas: false, showComparison: true });
    expect(resultsSummaryLine(f)).toBeNull();
  });
  it('auto-submitted (flag or status)', () => {
    expect(resultsFlags(make({ attempt: { ...make().attempt, autoSubmitted: true } })).autoSubmitted).toBe(true);
    expect(resultsFlags(make({ attempt: { ...make().attempt, status: 'AUTO_SUBMITTED' } })).autoSubmitted).toBe(true);
    expect(AUTO_SUBMITTED_LINE).toMatch(/automatically/);
  });
  it('no weak areas: every topic at 60% or above', () => {
    const f = resultsFlags(make({ topics: [topic('a', 60), topic('b', 90)], weakestTopic: null, canPractice: false }));
    expect(f.noWeakAreas).toBe(true);
    expect(resultsSummaryLine(f)).toBe(NO_WEAK_AREAS_LINE);
  });
  it('zero answered wins over "no weak areas"', () => {
    const f = resultsFlags(make({ counts: { total: 10, correct: 0, incorrect: 0, unanswered: 10 }, topics: [topic('a', 0)] }));
    expect(f.zeroAnswered).toBe(true);
    expect(f.noWeakAreas).toBe(false);
    expect(resultsSummaryLine(f)).toBe(ZERO_ANSWERED_LINE);
  });
  it('perfect score', () => {
    const f = resultsFlags(make({ counts: { total: 10, correct: 10, incorrect: 0, unanswered: 0 }, topics: [topic('a', 100)], weakestTopic: null }));
    expect(f.perfect).toBe(true);
    expect(resultsSummaryLine(f)).toBe(PERFECT_SCORE_LINE);
  });
  it('practice results: no comparison, "Practice again" picks the lowest topic', () => {
    const f = resultsFlags(make({
      attempt: { ...make().attempt, kind: 'PRACTICE' },
      comparison: { previousAttemptId: 'p', previousPercent: 1, previousSubmittedAt: null, deltaPoints: 1, previousTimeSpentSeconds: null },
      history: [{ attemptId: 'p', submittedAt: null, percent: 1, current: false }, { attemptId: 'a1', submittedAt: null, percent: 2, current: true }],
    }));
    expect(f.isPractice).toBe(true);
    expect(f.showComparison).toBe(false);
    expect(f.practiceAgainTopicId).toBe('t1');
  });
  it('no topics (empty set): nothing to practise again, no weak-area line', () => {
    const f = resultsFlags(make({ topics: [], counts: { total: 0, correct: 0, incorrect: 0, unanswered: 0 } }));
    expect(f.practiceAgainTopicId).toBeNull();
    expect(f.noWeakAreas).toBe(false);
  });
});
