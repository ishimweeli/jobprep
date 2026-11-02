import { describe, expect, it } from 'vitest';
import type { ReviewItem } from '../../api/types';
import { BADGE, chooseCount, defaultFilter, filterItems, gridAria, gridKind, gridMark, marksOfLabel, multiOptionNote, optionKind, positionLabel, tabsFor } from './reviewModel';

const item = (n: number, status: ReviewItem['status'], flagged = false): ReviewItem => ({
  number: n, id: `q${n}`, topic: 't', type: 'SINGLE_CHOICE', multiple: false, status, flagged, stem: 's', options: [], yourAnswer: [], marks: 1, marksAwarded: 0, explanation: null, caseId: null,
});
const items = [item(1, 'correct'), item(2, 'incorrect', true), item(3, 'unanswered'), item(4, 'partial'), item(5, 'correct', true)];

describe('review filters', () => {
  it('Incorrect includes partly correct answers', () => expect(filterItems(items, 'incorrect').map((i) => i.number)).toEqual([2, 4]));
  it('Flagged', () => expect(filterItems(items, 'flagged').map((i) => i.number)).toEqual([2, 5]));
  it('Unanswered', () => expect(filterItems(items, 'unanswered').map((i) => i.number)).toEqual([3]));
  it('All', () => expect(filterItems(items, 'all')).toHaveLength(5));
  it('defaults to Incorrect, or All for a perfect result', () => {
    expect(defaultFilter({ incorrect: 3, flagged: 0, unanswered: 0, all: 10 })).toBe('incorrect');
    expect(defaultFilter({ incorrect: 0, flagged: 0, unanswered: 0, all: 10 })).toBe('all');
  });
  it('tabs show counts; All is "All questions" on desktop and "All" on phone', () => {
    const t = tabsFor({ incorrect: 11, flagged: 1, unanswered: 3, all: 50 });
    expect(t.map((x) => x.label)).toEqual(['Incorrect (11)', 'Flagged (1)', 'Unanswered (3)', 'All questions']);
    expect(t.map((x) => x.short)).toEqual(['Incorrect (11)', 'Flagged (1)', 'Unanswered (3)', 'All']);
  });
});

describe('grid and options: never colour alone', () => {
  it('marks incorrect with ✕ and unanswered with –', () => {
    expect(gridMark(7, 'incorrect')).toBe('7✕');
    expect(gridMark(7, 'partial')).toBe('7◐');
    expect(gridAria(7, 'partial')).toBe('Question 7, partly correct');
    expect(gridMark(24, 'unanswered')).toBe('24–');
    expect(gridMark(12, 'correct')).toBe('12');
    expect(gridAria(7, 'incorrect')).toBe('Question 7, incorrect');
    expect(gridAria(24, 'unanswered')).toBe('Question 24, not answered');
    expect(gridKind('partial')).toBe('partial');
    expect(gridKind('incorrect')).toBe('incorrect');
  });
  it('option kinds', () => {
    expect(optionKind({ key: 'A', text: '', isCorrect: true, isYourPick: false })).toBe('right');
    expect(optionKind({ key: 'A', text: '', isCorrect: true, isYourPick: true })).toBe('right');
    expect(optionKind({ key: 'B', text: '', isCorrect: false, isYourPick: true })).toBe('wrongPick');
    expect(optionKind({ key: 'C', text: '', isCorrect: false, isYourPick: false })).toBe('plain');
  });
  it('phone position line', () => {
    expect(positionLabel(0, 11, 'incorrect')).toBe('1 of 11 incorrect');
    expect(positionLabel(2, 50, 'all')).toBe('3 of 50 shown');
  });
});

describe('partly correct (multiple-select)', () => {
  it('has its own badge text, and the Incorrect tab still lists it', () => {
    expect(BADGE.partial.label).toBe('Partly correct');
    expect(filterItems(items, 'incorrect').some((i) => i.status === 'partial')).toBe(true);
  });
  it('marks awarded of marks available', () => {
    expect(marksOfLabel(0.33, 1)).toBe('0.33 of 1 mark');
    expect(marksOfLabel(1, 2)).toBe('1 of 2 marks');
    expect(marksOfLabel(0, 1)).toBe('0 of 1 mark');
    expect(marksOfLabel(0.3333333, 1)).toBe('0.33 of 1 mark');
  });
  it('each option of a multiple-select question says what it was', () => {
    expect(multiOptionNote({ isCorrect: true, isYourPick: true })).toBe('✓ Correct · your choice');
    expect(multiOptionNote({ isCorrect: true, isYourPick: false })).toBe('✓ Correct · you missed this one');
    expect(multiOptionNote({ isCorrect: false, isYourPick: true })).toBe('✕ Not correct · your choice');
    expect(multiOptionNote({ isCorrect: false, isYourPick: false })).toBe('');
  });
  it('"Choose N" in the review is the number of correct options', () => {
    const opts = [true, false, true, false, true].map((isCorrect, i) => ({ key: 'ABCDE'[i]!, text: '', isCorrect, isYourPick: false }));
    expect(chooseCount({ options: opts })).toBe(3);
  });
});
