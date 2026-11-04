import { describe, expect, it } from 'vitest';
import type { ExamQuestion, PracticeCheckResponse } from '../../api/types';
import {
  canCheck, dominantTopic, feedbackFor, initialPracticeState, joinNames, optionTag, practiceProgress, practiceReducer, practiceSummary, type PracticeState,
} from './practiceModel';

const q = (id: string, extra: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id, number: 1, sectionName: 'S', topic: { id: 't1', name: 'Statistics & probability' }, type: 'SINGLE_CHOICE', multiple: false, choose: null, stem: 's',
  options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }], marks: 1, caseId: null, ...extra,
});
const qs = [q('q1'), q('q2'), q('q3')];
const result = (questionId: string, state: PracticeCheckResponse['state'], correct = ['B'], yourAnswer = ['B']): PracticeCheckResponse => ({
  questionId, state, correct, yourAnswer, explanation: 'Because.',
});
const fresh = () => initialPracticeState(qs, {});

describe('practice runner state machine', () => {
  it('starts at the first unanswered question, with nothing checked', () => {
    expect(fresh()).toMatchObject({ index: 0, checked: {}, finished: false });
    expect(initialPracticeState(qs, { q1: { selected: ['A'] } }).index).toBe(1);
    expect(initialPracticeState(qs, { q1: { selected: ['A'] }, q2: { selected: ['B'] }, q3: { selected: ['B'] } }).index).toBe(0);
  });
  it('pick, then check: "Check answer" needs a pick', () => {
    let s = fresh();
    expect(canCheck(s, 'q1')).toBe(false);
    s = practiceReducer(s, { type: 'pick', question: qs[0]!, key: 'B' });
    expect(s.picked.q1).toEqual(['B']);
    expect(canCheck(s, 'q1')).toBe(true);
    s = practiceReducer(s, { type: 'pick', question: qs[0]!, key: 'A' }); // single answer: replaces
    expect(s.picked.q1).toEqual(['A']);
  });
  it('after checking, the answer is locked and cannot be checked twice', () => {
    let s = practiceReducer(fresh(), { type: 'pick', question: qs[0]!, key: 'A' });
    s = practiceReducer(s, { type: 'checked', result: result('q1', 'incorrect', ['B'], ['A']) });
    expect(canCheck(s, 'q1')).toBe(false);
    expect(practiceReducer(s, { type: 'pick', question: qs[0]!, key: 'B' }).picked.q1).toEqual(['A']);
  });
  it('next moves on; on the last question it finishes', () => {
    let s: PracticeState = fresh();
    s = practiceReducer(s, { type: 'next', total: 3 });
    expect(s.index).toBe(1);
    s = practiceReducer(s, { type: 'next', total: 3 });
    expect(s.index).toBe(2);
    s = practiceReducer(s, { type: 'next', total: 3 });
    expect(s.finished).toBe(true);
  });
  it('"End practice" finishes at once and the summary counts only what was checked', () => {
    let s = fresh();
    s = practiceReducer(s, { type: 'pick', question: qs[0]!, key: 'B' });
    s = practiceReducer(s, { type: 'checked', result: result('q1', 'correct') });
    s = practiceReducer(s, { type: 'next', total: 3 });
    s = practiceReducer(s, { type: 'pick', question: qs[1]!, key: 'A' });
    s = practiceReducer(s, { type: 'checked', result: result('q2', 'incorrect', ['B'], ['A']) });
    s = practiceReducer(s, { type: 'end' });
    expect(s.finished).toBe(true);
    expect(practiceSummary(s)).toEqual({ answered: 2, right: 1 });
  });
  it('nothing can be picked once finished', () => {
    const s = practiceReducer(fresh(), { type: 'end' });
    expect(practiceReducer(s, { type: 'pick', question: qs[0]!, key: 'A' }).picked).toEqual({});
  });
  it('multiple-select practice caps at "Choose N" and says so', () => {
    const m = q('m', { multiple: true, choose: 2, options: ['A', 'B', 'C'].map((key) => ({ key, text: key })) });
    let s = initialPracticeState([m], {});
    for (const key of ['A', 'C']) s = practiceReducer(s, { type: 'pick', question: m, key });
    expect(s.picked.m).toEqual(['A', 'C']);
    s = practiceReducer(s, { type: 'pick', question: m, key: 'B' });
    expect(s.picked.m).toEqual(['A', 'C']);
    expect(s.blocked).toBe(true);
    s = practiceReducer(s, { type: 'pick', question: m, key: 'C' });
    expect(s).toMatchObject({ blocked: false });
    expect(s.picked.m).toEqual(['A']);
  });
});

describe('practice copy', () => {
  it('feedback titles', () => {
    expect(feedbackFor({ state: 'correct', correct: ['B'] })).toEqual({ title: 'Correct', tone: 'correct', detail: null });
    expect(feedbackFor({ state: 'incorrect', correct: ['B'] })).toEqual({ title: 'Not quite — the answer is B', tone: 'incorrect', detail: null });
    expect(feedbackFor({ state: 'incorrect', correct: ['C', 'A'] }).title).toBe('Not quite — the answers are A, C');
    expect(feedbackFor({ state: 'partial', correct: ['A', 'C'] })).toMatchObject({ title: 'Partly correct', tone: 'partial' });
  });
  it('option tags after checking: ✓ Correct on a right option, ✕ Your answer on a wrong pick, nothing before', () => {
    const r = result('q1', 'incorrect', ['B'], ['A']);
    expect(optionTag(r, 'B', ['A'])).toEqual({ text: '✓ Correct', kind: 'right' });
    expect(optionTag(r, 'A', ['A'])).toEqual({ text: '✕ Your answer', kind: 'wrong' });
    expect(optionTag(r, 'C', ['A'])).toBeNull();
    expect(optionTag(undefined, 'B', ['A'])).toBeNull();
  });
  it('progress bar, topic names, and the topic to practise again', () => {
    expect(practiceProgress(0, 15)).toBe(0);
    expect(practiceProgress(5, 15)).toBe(33);
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B', 'A'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(dominantTopic([q('1'), q('2', { topic: { id: 't2', name: 'Geometry' } }), q('3', { topic: { id: 't2', name: 'Geometry' } })])).toEqual({ id: 't2', name: 'Geometry' });
  });
});

import { finishPrompt, partialDetail } from './practiceModel';

describe('finish practice and partly correct (C1, built without an artboard)', () => {
  it('the finish prompt counts what was checked', () => {
    expect(finishPrompt({ checked: {} }, 5).body).toBe('You have answered 0 of 5 questions. The 5 you have not answered will be left out. Practice answers don’t change your mock test scores.');
    const checked = { a: { questionId: 'a', state: 'correct', correct: ['A'], yourAnswer: ['A'], explanation: null } } as never;
    expect(finishPrompt({ checked }, 1)).toMatchObject({ answered: 1, unanswered: 0 });
    expect(finishPrompt({ checked }, 1).body.startsWith('You have answered all 1 question.')).toBe(true);
  });
  it('the partly correct detail line', () => {
    expect(partialDetail(['A', 'C'], ['A', 'B'])).toBe('You found 1 of 2 correct answers and chose 1 that is not correct. The correct answers are A, C.');
    expect(partialDetail(['A', 'C', 'D'], ['A', 'C'])).toBe('You found 2 of 3 correct answers. The correct answers are A, C, D.');
  });
});
