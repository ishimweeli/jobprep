import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import type { QuestionDetail } from '../../api/types';
import { buildPatch, describeSaveError, isDirty, isEditable, toForm, validateForm } from './questionForm';

const detail = (over: Partial<QuestionDetail['question']> = {}): QuestionDetail => ({
  question: {
    id: 'q1', type: 'SINGLE_CHOICE', status: 'PUBLISHED', stem: 'The median of 3, 8, 5, 12, 7 and 10 is…', marks: 1, difficulty: 'STANDARD', version: 3,
    explanation: 'Order the data: 3, 5, 7, 8, 10, 12. The median is (7 + 8) ÷ 2 = 7.5.',
    options: [{ key: 'A', text: '7', correct: false }, { key: 'B', text: '7.5', correct: true }, { key: 'C', text: '8', correct: false }, { key: 'D', text: '7.5 and 8', correct: false }],
    scoring: null, choose: null, topic: { id: 't-stats', name: 'Statistics & probability' }, section: { id: 's1', name: 'Section A' }, case: null, ...over,
  },
  mockTest: { id: 'm1', title: 'Mock 1', isFree: true, status: 'PUBLISHED', countryCode: 'RW' },
  position: { number: 31, total: 50, previousId: 'q0', nextId: 'q2' },
  reports: [], stats: { attempts: 1204, correctPercent: 41 }, lastEdited: null,
});

describe('question form model', () => {
  it('starts from the question and is not dirty', () => {
    const f = toForm(detail());
    expect(f).toMatchObject({ stem: expect.stringContaining('median'), correct: ['B'], topicId: 't-stats', difficulty: 'STANDARD', marks: '1', caseId: '' });
    expect(isDirty(f, toForm(detail()))).toBe(false);
  });

  it('knows what changed (and ignores edge whitespace)', () => {
    const a = toForm(detail());
    expect(isDirty(a, { ...a, stem: `${a.stem}  ` })).toBe(false);
    expect(isDirty(a, { ...a, stem: 'A different question' })).toBe(true);
    expect(isDirty(a, { ...a, correct: ['C'] })).toBe(true);
    expect(isDirty(a, { ...a, options: a.options.map((o) => (o.key === 'A' ? { ...o, text: '6' } : o)) })).toBe(true);
    expect(isDirty(a, { ...a, marks: '1.0' })).toBe(false);
    expect(isDirty(a, { ...a, marks: '2' })).toBe(true);
    expect(isDirty(a, { ...a, topicId: 'other' })).toBe(true);
    expect(isDirty(a, { ...a, caseId: 'c1' })).toBe(true);
  });

  it('"Save draft" sends only the changed fields and status DRAFT', () => {
    const a = toForm(detail());
    expect(buildPatch(a, { ...a, explanation: 'A better explanation of the median.' }, 'draft', { canResolveReports: true })).toEqual({
      explanation: 'A better explanation of the median.', status: 'DRAFT',
    });
  });

  it('with nothing changed it still sends the status the button asks for', () => {
    const a = toForm(detail());
    expect(buildPatch(a, a, 'draft', { canResolveReports: true })).toEqual({ status: 'DRAFT' });
  });

  it('"Publish change & resolve reports" sends PUBLISHED and resolveReports', () => {
    const a = toForm(detail());
    expect(buildPatch(a, { ...a, stem: 'Fixed wording of the question?' }, 'publish', { canResolveReports: true })).toEqual({
      stem: 'Fixed wording of the question?', status: 'PUBLISHED', resolveReports: true,
    });
  });

  it('does not ask to resolve reports when the admin may not', () => {
    const a = toForm(detail());
    expect(buildPatch(a, a, 'publish', { canResolveReports: false })).toEqual({ status: 'PUBLISHED' });
  });

  it('options and the correct answer travel together', () => {
    const a = toForm(detail());
    const p1 = buildPatch(a, { ...a, correct: ['C'] }, 'draft', { canResolveReports: true });
    expect(p1.correct).toEqual(['C']);
    expect(p1.options).toHaveLength(4);
    const p2 = buildPatch(a, { ...a, options: a.options.map((o) => (o.key === 'D' ? { ...o, text: ' 7.5 or 8 ' } : o)) }, 'draft', { canResolveReports: true });
    expect(p2.correct).toEqual(['B']);
    expect(p2.options?.find((o) => o.key === 'D')?.text).toBe('7.5 or 8');
  });

  it('clearing the case sends null; marks go as a number', () => {
    const a = toForm(detail({ case: { id: 'c1', title: 'Case' } }));
    expect(buildPatch(a, { ...a, caseId: '', marks: '2' }, 'draft', { canResolveReports: true })).toMatchObject({ caseId: null, marks: 2 });
  });

  it('only single-answer questions without a case can be edited', () => {
    expect(isEditable('SINGLE_CHOICE', false)).toBe(true);
    expect(isEditable('MULTIPLE_SELECT', false)).toBe(false);
    expect(isEditable('CASE_BASED', true)).toBe(false);
    expect(isEditable('SINGLE_CHOICE', true)).toBe(false);
  });
});

describe('checks before saving', () => {
  const ok = toForm(detail());
  it('a good form has no problems', () => expect(validateForm(ok)).toEqual([]));
  it('short text, empty option, no correct answer, bad marks, no topic', () => {
    const fields = (f: typeof ok) => validateForm(f).map((p) => p.field);
    expect(fields({ ...ok, stem: 'abc' })).toEqual(['stem']);
    expect(fields({ ...ok, explanation: 'short' })).toEqual(['explanation']);
    expect(fields({ ...ok, options: ok.options.map((o) => (o.key === 'A' ? { ...o, text: ' ' } : o)) })).toEqual(['options']);
    expect(fields({ ...ok, correct: [] })).toEqual(['correct']);
    expect(fields({ ...ok, correct: ['B', 'C'] })).toEqual(['correct']);
    expect(fields({ ...ok, marks: '0' })).toEqual(['marks']);
    expect(fields({ ...ok, marks: '21' })).toEqual(['marks']);
    expect(fields({ ...ok, marks: '' })).toEqual(['marks']);
    expect(fields({ ...ok, topicId: '' })).toEqual(['topic']);
  });
});

describe('API errors in friendly words', () => {
  it('correct_not_an_option and exactly_one_correct_answer mark the answer', () => {
    expect(describeSaveError(new ApiError(400, 'correct_not_an_option'))).toEqual({ field: 'correct', message: 'The correct answer must be one of the options.' });
    expect(describeSaveError(new ApiError(400, 'exactly_one_correct_answer'))).toEqual({ field: 'correct', message: 'Choose exactly one correct answer.' });
  });
  it('topic and case problems', () => {
    expect(describeSaveError(new ApiError(400, 'topic_not_in_category')).field).toBe('topic');
    expect(describeSaveError(new ApiError(400, 'case_not_in_test')).field).toBe('case');
  });
  it('a validation error names the field from the first issue', () => {
    const e = new ApiError(400, 'validation_error', { issues: [{ path: 'explanation', message: 'Too small' }] });
    expect(describeSaveError(e)).toEqual({ field: 'explanation', message: 'Write an explanation (at least 10 characters).' });
    expect(describeSaveError(new ApiError(400, 'validation_error', { issues: [{ path: 'options.2.text', message: 'x' }] })).field).toBe('options');
    expect(describeSaveError(new ApiError(400, 'validation_error')).message).toMatch(/not allowed/);
  });
  it('permission, missing question, offline, server and unknown errors keep the edits', () => {
    expect(describeSaveError(new ApiError(403, 'admin_forbidden')).message).toMatch(/permission/);
    expect(describeSaveError(new ApiError(404, 'question_not_found')).message).toMatch(/no longer exists/);
    expect(describeSaveError(new ApiError(0, 'network_error')).message).toMatch(/Could not reach the server/);
    expect(describeSaveError(new ApiError(500, 'internal_error')).message).toMatch(/still here/);
    expect(describeSaveError(new Error('x')).message).toMatch(/still here/);
  });
  it('never shows a raw code', () => {
    for (const c of ['correct_not_an_option', 'exactly_one_correct_answer', 'duplicate_option_keys', 'case_required', 'invalid_choose', 'weird_code']) {
      expect(describeSaveError(new ApiError(400, c)).message).not.toMatch(/_/);
    }
  });
});
