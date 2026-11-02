import { describe, expect, it } from 'vitest';
import { scoreAttempt, scoreQuestion, weakTopics, type ScorableQuestion } from '../../src/domain/scoring';

const opts = ['A', 'B', 'C', 'D'].map((key) => ({ key, text: key }));
const single = (id: string, correct: string, topicId = 't1'): ScorableQuestion => ({
  id, type: 'SINGLE_CHOICE', marks: 1, topicId, topicName: topicId,
  payload: { options: opts, correct: [correct] },
});
const multi = (scoring: 'ALL_OR_NOTHING' | 'PARTIAL'): ScorableQuestion => ({
  id: 'm', type: 'MULTIPLE_SELECT', marks: 2, topicId: 't1', topicName: 't1',
  payload: { options: opts, correct: ['A', 'C'], scoring },
});

describe('single choice', () => {
  it('awards full marks for the right option', () => {
    expect(scoreQuestion(single('q', 'B'), ['B'])).toEqual({ state: 'correct', marksAwarded: 1 });
  });
  it('gives zero for a wrong option and for unanswered when negative marking is off', () => {
    expect(scoreQuestion(single('q', 'B'), ['C'])).toEqual({ state: 'incorrect', marksAwarded: -0 });
    expect(scoreQuestion(single('q', 'B'), [])).toEqual({ state: 'unanswered', marksAwarded: 0 });
  });
  it('deducts only when negative marking is configured, never for unanswered', () => {
    expect(scoreQuestion(single('q', 'B'), ['C'], 0.25).marksAwarded).toBe(-0.25);
    expect(scoreQuestion(single('q', 'B'), [], 0.25).marksAwarded).toBe(0);
  });
  it('treats case-based questions like single choice', () => {
    const q: ScorableQuestion = { ...single('c', 'B'), type: 'CASE_BASED', marks: 2.5 };
    expect(scoreQuestion(q, ['B']).marksAwarded).toBe(2.5);
  });
});

describe('multiple select', () => {
  it('all-or-nothing: exact set only', () => {
    expect(scoreQuestion(multi('ALL_OR_NOTHING'), ['C', 'A']).state).toBe('correct');
    expect(scoreQuestion(multi('ALL_OR_NOTHING'), ['A']).marksAwarded).toBe(-0);
    expect(scoreQuestion(multi('ALL_OR_NOTHING'), ['A', 'C', 'D']).state).toBe('incorrect');
  });
  it('partial credit: right picks earn a share, wrong picks cancel one', () => {
    expect(scoreQuestion(multi('PARTIAL'), ['A'])).toEqual({ state: 'partial', marksAwarded: 1 });
    expect(scoreQuestion(multi('PARTIAL'), ['A', 'C'])).toEqual({ state: 'correct', marksAwarded: 2 });
    // one right, one wrong → 0 marks → incorrect (never negative)
    expect(scoreQuestion(multi('PARTIAL'), ['A', 'B']).state).toBe('incorrect');
    expect(scoreQuestion(multi('PARTIAL'), ['B', 'D']).marksAwarded).toBe(-0);
  });
});

describe('scoreAttempt', () => {
  const qs = [single('1', 'A', 'alg'), single('2', 'B', 'alg'), single('3', 'C', 'geo'), single('4', 'D', 'geo')];

  it('totals, counts and per-topic percentages', () => {
    const r = scoreAttempt(qs, { '1': ['A'], '2': ['A'], '3': ['C'] });
    expect(r.scoreMarks).toBe(2);
    expect(r.totalMarks).toBe(4);
    expect(r.percent).toBe(50);
    expect([r.correct, r.incorrect, r.unanswered]).toEqual([2, 1, 1]);
    const geo = r.topics.find((t) => t.topicId === 'geo')!;
    expect(geo.percent).toBe(50);
    expect(r.topics.find((t) => t.topicId === 'alg')!.percent).toBe(50);
  });

  it('never returns a negative total even with heavy negative marking', () => {
    const r = scoreAttempt(qs, { '1': ['B'], '2': ['A'], '3': ['A'], '4': ['A'] }, 1);
    expect(r.scoreMarks).toBe(0);
    expect(r.percent).toBe(0);
  });

  it('handles an empty question set without dividing by zero', () => {
    expect(scoreAttempt([], {}).percent).toBe(0);
  });
});

describe('weakTopics', () => {
  it('returns topics under the cut-off, lowest first', () => {
    const r = scoreAttempt(
      [single('1', 'A', 'a'), single('2', 'A', 'b'), single('3', 'A', 'b'), single('4', 'A', 'c')],
      { '1': ['A'], '2': ['A'], '3': ['B'], '4': ['B'] },
    );
    expect(weakTopics(r.topics).map((t) => t.topicId)).toEqual(['c', 'b']);
  });
});
