import { describe, expect, it } from 'vitest';
import type { ExamDetail, PreviousAttempt } from '../../api/types';
import { answeredShare, attemptsLine, PRIMARY_LABEL, reviewLastLabel, unlockedState } from './detailsModel';

const att = (id: string, percent: number | null): PreviousAttempt => ({ id, submittedAt: '2026-10-24T10:00:00Z', scoreMarks: 1, totalMarks: 2, percent, minutesUsed: 30 });
const base = { inProgress: null, previousAttempts: [] as PreviousAttempt[], attempts: 'UNLIMITED' } as Pick<ExamDetail, 'inProgress' | 'previousAttempts' | 'attempts'>;

describe('unlocked test states (ExamDetailUnlocked.dc)', () => {
  it('not started', () => {
    expect(unlockedState(base)).toBe('not_started');
    expect(PRIMARY_LABEL.not_started).toBe('Start Mock Test');
    expect(reviewLastLabel(base)).toBeNull();
    expect(attemptsLine(base)).toBeNull();
  });
  it('in progress wins over taken before, and the button is Resume', () => {
    const exam = { ...base, inProgress: { attemptId: 'a', answered: 18, total: 45, remainingSeconds: 1907 }, previousAttempts: [att('p', 58)] };
    expect(unlockedState(exam)).toBe('in_progress');
    expect(PRIMARY_LABEL.in_progress).toBe('Resume test');
    expect(answeredShare(exam.inProgress)).toBe(40);
  });
  it('taken before: new attempt, review last attempt with its percent, and the attempts line', () => {
    const exam = { ...base, previousAttempts: [att('last', 58), att('first', 41)] };
    expect(unlockedState(exam)).toBe('taken_before');
    expect(PRIMARY_LABEL.taken_before).toBe('Start a new attempt');
    expect(reviewLastLabel(exam)).toBe('Review last attempt · 58%');
    expect(attemptsLine(exam)).toBe('Attempts: 2 · best 58% · unlimited attempts while your access lasts.');
  });
  it('best score is the best of all, not the last; missing percents are left out', () => {
    expect(attemptsLine({ ...base, previousAttempts: [att('b', 40), att('a', 71)] })).toBe('Attempts: 2 · best 71% · unlimited attempts while your access lasts.');
    expect(reviewLastLabel({ previousAttempts: [att('x', null)] })).toBe('Review last attempt');
    expect(attemptsLine({ ...base, previousAttempts: [att('x', null)] })).toBe('Attempts: 1 · unlimited attempts while your access lasts.');
  });
  it('the API lists at most 5 attempts, so a full list reads "5+"', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => att(id, 50));
    expect(attemptsLine({ ...base, previousAttempts: five })).toContain('Attempts: 5+');
  });
  it('no "unlimited" claim when the test does not say so', () => {
    expect(attemptsLine({ ...base, attempts: '3', previousAttempts: [att('a', 50)] })).toBe('Attempts: 1 · best 50%.');
  });
});
