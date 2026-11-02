import { describe, expect, it } from 'vitest';
import type { ExamCase, ExamQuestion } from '../../api/types';
import { casePosition, caseRange, cellState, countsOf, firstUnansweredIndex, marksLabel, nextSelection, progressPercent, savedLabel } from './examModel';

const q = (n: number, extra: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id: `q${n}`, number: n, sectionName: 'S', topic: { id: 't', name: 'Topic' }, type: 'SINGLE_CHOICE', multiple: false, stem: 's',
  options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }], marks: 1, caseId: null, ...extra,
});
const questions = [q(1), q(2), q(3), q(4)];

describe('counts and progress', () => {
  const answers = { q1: { selected: ['A'], flagged: false }, q2: { selected: [], flagged: true }, q3: { selected: ['B'], flagged: true } };
  it('answered needs at least one selected option; a flag alone is not an answer', () => {
    expect(countsOf(questions, answers)).toEqual({ total: 4, answered: 2, unanswered: 2, flagged: 2 });
  });
  it('progress is answered / total, rounded', () => {
    expect(progressPercent({ answered: 2, total: 4 })).toBe(50);
    expect(progressPercent({ answered: 1, total: 3 })).toBe(33);
    expect(progressPercent({ answered: 0, total: 0 })).toBe(0);
  });
  it('finds the first unanswered question', () => {
    expect(firstUnansweredIndex(questions, answers)).toBe(1);
    expect(firstUnansweredIndex(questions, { ...answers, q2: { selected: ['A'], flagged: false }, q4: { selected: ['A'], flagged: false } })).toBe(-1);
  });
});

describe('navigator cells (state -> UI)', () => {
  const answers = { q1: { selected: ['A'], flagged: false }, q2: { selected: [], flagged: true }, q3: { selected: ['B'], flagged: true } };
  it('open, answered and flagged looks; flagged wins over answered', () => {
    expect(cellState(questions[0]!, answers, 'q9', true)).toMatchObject({ tone: 'answered', flagged: false, answered: true, current: false });
    expect(cellState(questions[1]!, answers, 'q9', true)).toMatchObject({ tone: 'flagged', flagged: true, answered: false });
    expect(cellState(questions[2]!, answers, 'q9', true)).toMatchObject({ tone: 'flagged', answered: true });
    expect(cellState(questions[3]!, answers, 'q9', true)).toMatchObject({ tone: 'open' });
  });
  it('the accessible name carries every state in words, not only colour', () => {
    expect(cellState(questions[2]!, answers, 'q3', true).aria).toBe('Question 3, answered, flagged, current');
    expect(cellState(questions[3]!, answers, 'q3', true).aria).toBe('Question 4, not answered');
    expect(cellState(questions[2]!, answers, 'q3', false).aria).toBe('Question 3, answered, flagged'); // phone sheet leaves "current" out, as drawn
  });
});

describe('option selection', () => {
  it('single answer: choosing replaces', () => {
    expect(nextSelection({ multiple: false }, ['A'], 'B')).toEqual(['B']);
    expect(nextSelection({ multiple: false }, ['A'], 'A')).toEqual(['A']);
  });
  it('multiple select (interim behaviour): toggles keys and keeps them sorted', () => {
    expect(nextSelection({ multiple: true }, ['C'], 'A')).toEqual(['A', 'C']);
    expect(nextSelection({ multiple: true }, ['A', 'C'], 'A')).toEqual(['C']);
    expect(nextSelection({ multiple: true }, ['C'], 'C')).toEqual([]);
  });
});

describe('saved label', () => {
  it('"All answers saved" unless something is waiting', () => {
    expect(savedLabel({ pending: 0, waiting: false })).toEqual({ waiting: false, text: 'All answers saved' });
    expect(savedLabel({ pending: 2, waiting: false }).text).toBe('All answers saved'); // a quick save in flight is not shown as waiting
  });
  it('"N answers waiting to save" with the right plural', () => {
    expect(savedLabel({ pending: 3, waiting: true })).toEqual({ waiting: true, text: '3 answers waiting to save' });
    expect(savedLabel({ pending: 1, waiting: true }).text).toBe('1 answer waiting to save');
  });
});

describe('case labels', () => {
  const c: ExamCase = { id: 'c', title: 'T', passage: [], tables: [], notes: [], questionNumbers: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45] };
  it('range, position and marks as drawn', () => {
    expect(caseRange(c)).toBe('36–45');
    expect(caseRange({ questionNumbers: [8] })).toBe('8');
    expect(casePosition(q(37), c)).toEqual({ index: 2, total: 10 });
    expect(marksLabel(2.5)).toBe('2.5 marks');
    expect(marksLabel(1)).toBe('1 mark');
  });
});
