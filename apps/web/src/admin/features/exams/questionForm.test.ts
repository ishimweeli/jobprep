import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import type { QuestionDetailX } from '../../api/questions-demand';
import {
  addOption, buildCreate, buildPatch, buildTranslationBody, copySource, describeSaveError, excerpt, isDirty, isEditable, moveId, moveOption, newForm, previewContent,
  removeOption, setType, toForm, toggleCorrect, toTranslationForm, translationDirty, translationState, translationTabs, validateForm, versionNote,
} from './questionForm';

const detail = (over: Partial<QuestionDetailX['question']> = {}): QuestionDetailX => ({
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
const opts = { canResolveReports: true };
const multi = () => toForm(detail({
  type: 'MULTIPLE_SELECT', scoring: 'PARTIAL', choose: 2,
  options: [{ key: 'A', text: 'one', correct: true }, { key: 'B', text: 'two', correct: false }, { key: 'C', text: 'three', correct: true }, { key: 'D', text: 'four', correct: false }],
}));

describe('question form model', () => {
  it('starts from the question and is not dirty', () => {
    const f = toForm(detail());
    expect(f).toMatchObject({ type: 'SINGLE_CHOICE', stem: expect.stringContaining('median'), correct: ['B'], topicId: 't-stats', sectionId: 's1', difficulty: 'STANDARD', marks: '1', caseId: '', choose: '', scoring: 'ALL_OR_NOTHING' });
    expect(isDirty(f, toForm(detail()))).toBe(false);
  });

  it('reads a multiple-select question: partial credit and "choose 2"', () => {
    expect(multi()).toMatchObject({ type: 'MULTIPLE_SELECT', correct: ['A', 'C'], scoring: 'PARTIAL', choose: '2' });
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
    expect(isDirty(a, { ...a, sectionId: 's2' })).toBe(true);
    expect(isDirty(a, { ...a, type: 'MULTIPLE_SELECT' })).toBe(true);
  });

  it('scoring and "choose" only count for multiple-select', () => {
    const single = toForm(detail());
    expect(isDirty(single, { ...single, scoring: 'PARTIAL', choose: '3' })).toBe(false);
    const m = multi();
    expect(isDirty(m, { ...m, scoring: 'ALL_OR_NOTHING' })).toBe(true);
    expect(isDirty(m, { ...m, choose: '' })).toBe(true);
    expect(isDirty(m, { ...m, choose: '2 ' })).toBe(false);
  });

  it('any admin who may write can edit any type', () => {
    expect(isEditable(true)).toBe(true);
    expect(isEditable(false)).toBe(false);
  });
});

describe('option editing keeps the letters in order and the correct answers on their texts', () => {
  it('adds an option up to six', () => {
    let f = toForm(detail());
    f = addOption(addOption(f));
    expect(f.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(addOption(f).options).toHaveLength(6);
  });

  it('removing an option re-letters the rest and remaps the correct set', () => {
    const f = multi(); // correct A and C
    const r = removeOption(f, 'A');
    expect(r.options.map((o) => [o.key, o.text])).toEqual([['A', 'two'], ['B', 'three'], ['C', 'four']]);
    expect(r.correct).toEqual(['B']); // "three" is now B
    const r2 = removeOption(f, 'D');
    expect(r2.correct).toEqual(['A', 'C']);
  });

  it('never goes under two options', () => {
    let f = toForm(detail());
    f = removeOption(removeOption(f, 'A'), 'A');
    expect(f.options).toHaveLength(2);
    expect(removeOption(f, 'A')).toBe(f);
  });

  it('moving an option swaps the texts; the correct flag follows its text', () => {
    const f = toForm(detail()); // B is correct ("7.5")
    const up = moveOption(f, 'B', -1);
    expect(up.options.map((o) => o.text)).toEqual(['7.5', '7', '8', '7.5 and 8']);
    expect(up.correct).toEqual(['A']);
    const down = moveOption(f, 'A', 1);
    expect(down.options.map((o) => o.text)).toEqual(['7.5', '7', '8', '7.5 and 8']);
    expect(down.correct).toEqual(['A']);
    expect(moveOption(f, 'A', -1)).toBe(f);
    expect(moveOption(f, 'D', 1)).toBe(f);
  });

  it('moving keeps several correct answers apart', () => {
    const f = multi(); // A, C correct
    const m = moveOption(f, 'C', -1); // C <-> B
    expect(m.options.map((o) => o.text)).toEqual(['one', 'three', 'two', 'four']);
    expect(m.correct).toEqual(['A', 'B']);
  });

  it('single answer: picking replaces; multiple: toggles', () => {
    const f = toForm(detail());
    expect(toggleCorrect(f, 'C').correct).toEqual(['C']);
    const m = multi();
    expect(toggleCorrect(m, 'B').correct).toEqual(['A', 'B', 'C']);
    expect(toggleCorrect(m, 'A').correct).toEqual(['C']);
  });

  it('changing to single answer keeps one correct answer and drops "choose"; leaving case-based drops the case', () => {
    const s = setType(multi(), 'SINGLE_CHOICE');
    expect(s.correct).toEqual(['A']);
    expect(s.choose).toBe('');
    const c = setType({ ...toForm(detail()), caseId: 'c1', type: 'CASE_BASED' }, 'SINGLE_CHOICE');
    expect(c.caseId).toBe('');
  });
});

describe('what a save sends', () => {
  it('"Save draft" sends only the changed fields and status DRAFT', () => {
    const a = toForm(detail());
    expect(buildPatch(a, { ...a, explanation: 'A better explanation of the median.' }, 'draft', opts)).toEqual({ explanation: 'A better explanation of the median.', status: 'DRAFT' });
  });

  it('with nothing changed it still sends the status the button asks for', () => {
    const a = toForm(detail());
    expect(buildPatch(a, a, 'draft', opts)).toEqual({ status: 'DRAFT' });
  });

  it('"Publish change & resolve reports" sends PUBLISHED and resolveReports; not for an admin who may not resolve', () => {
    const a = toForm(detail());
    expect(buildPatch(a, { ...a, stem: 'Fixed wording of the question?' }, 'publish', opts)).toEqual({ stem: 'Fixed wording of the question?', status: 'PUBLISHED', resolveReports: true });
    expect(buildPatch(a, a, 'publish', { canResolveReports: false })).toEqual({ status: 'PUBLISHED' });
  });

  it('options and the correct answer travel together with the type', () => {
    const a = toForm(detail());
    const p1 = buildPatch(a, { ...a, correct: ['C'] }, 'draft', opts);
    expect(p1).toMatchObject({ correct: ['C'], type: 'SINGLE_CHOICE' });
    expect(p1.options).toHaveLength(4);
    const p2 = buildPatch(a, { ...a, options: a.options.map((o) => (o.key === 'D' ? { ...o, text: ' 7.5 or 8 ' } : o)) }, 'draft', opts);
    expect(p2.correct).toEqual(['B']);
    expect(p2.options?.find((o) => o.key === 'D')?.text).toBe('7.5 or 8');
  });

  it('turning a single-answer question into multiple-select sends type, scoring and choose', () => {
    const a = toForm(detail());
    const b = { ...toggleCorrect(setType(a, 'MULTIPLE_SELECT'), 'D'), scoring: 'PARTIAL' as const, choose: '2' };
    expect(buildPatch(a, b, 'draft', opts)).toMatchObject({ type: 'MULTIPLE_SELECT', correct: ['B', 'D'], scoring: 'PARTIAL', choose: 2, status: 'DRAFT' });
  });

  it('changing only the scoring of a multiple-select question resends the options and correct set', () => {
    const a = multi();
    const p = buildPatch(a, { ...a, scoring: 'ALL_OR_NOTHING' }, 'draft', opts);
    expect(p).toMatchObject({ type: 'MULTIPLE_SELECT', scoring: 'ALL_OR_NOTHING', choose: 2, correct: ['A', 'C'] });
  });

  it('clearing "choose" sends null', () => {
    const a = multi();
    expect(buildPatch(a, { ...a, choose: '' }, 'draft', opts).choose).toBeNull();
  });

  it('a case-based question sends its case; leaving case-based sends null and the new type', () => {
    const a = toForm(detail({ type: 'CASE_BASED', case: { id: 'c1', title: 'Case' } }));
    expect(buildPatch(a, { ...a, caseId: 'c2' }, 'draft', opts)).toMatchObject({ caseId: 'c2' });
    const p = buildPatch(a, setType(a, 'SINGLE_CHOICE'), 'draft', opts);
    expect(p).toMatchObject({ type: 'SINGLE_CHOICE', caseId: null });
  });

  it('marks go as a number; a moved section is sent', () => {
    const a = toForm(detail());
    expect(buildPatch(a, { ...a, marks: '2', sectionId: 's2' }, 'draft', opts)).toMatchObject({ marks: 2, sectionId: 's2' });
  });

  it('creating sends the whole question with its type', () => {
    const f = { ...newForm({ sectionId: 's1', topicId: 't1' }), stem: ' Which are prime numbers? ', explanation: 'Two and three are prime numbers.', type: 'MULTIPLE_SELECT' as const, scoring: 'PARTIAL' as const, choose: '2', correct: ['A', 'B'],
      options: [{ key: 'A', text: '2' }, { key: 'B', text: '3' }, { key: 'C', text: '4' }, { key: 'D', text: '6' }] };
    expect(buildCreate(f, 'draft')).toEqual({
      sectionId: 's1', stem: 'Which are prime numbers?', options: f.options, correct: ['A', 'B'], type: 'MULTIPLE_SELECT', explanation: 'Two and three are prime numbers.', topicId: 't1',
      marks: 1, difficulty: 'STANDARD', status: 'DRAFT', scoring: 'PARTIAL', choose: 2,
    });
    const single = { ...f, type: 'SINGLE_CHOICE' as const, correct: ['A'] };
    expect(buildCreate(single, 'publish')).toMatchObject({ type: 'SINGLE_CHOICE', status: 'PUBLISHED' });
    expect(buildCreate(single, 'publish')).not.toHaveProperty('scoring');
    expect(buildCreate({ ...single, type: 'CASE_BASED', caseId: 'c1' }, 'draft')).toMatchObject({ type: 'CASE_BASED', caseId: 'c1' });
  });
});

describe('checks before saving', () => {
  const ok = toForm(detail());
  const fields = (f: typeof ok, o = {}) => validateForm(f, o).map((p) => p.field);
  it('a good form has no problems', () => expect(validateForm(ok)).toEqual([]));
  it('short text, empty option, no correct answer, bad marks, no topic', () => {
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
  it('2 to 6 options', () => {
    expect(fields({ ...ok, options: ok.options.slice(0, 1), correct: [] })).toContain('options');
    expect(fields({ ...ok, options: [...ok.options, { key: 'E', text: 'e' }, { key: 'F', text: 'f' }, { key: 'G', text: 'g' }] })).toContain('options');
  });
  it('multiple-select needs one or more correct answers and a sensible "choose"', () => {
    const m = multi();
    expect(validateForm(m)).toEqual([]);
    expect(fields({ ...m, correct: [] })).toEqual(['correct']);
    expect(fields({ ...m, choose: '1' })).toEqual(['choose']); // fewer than the 2 correct answers
    expect(fields({ ...m, choose: '5' })).toEqual(['choose']); // more than the 4 options
    expect(fields({ ...m, choose: '1.5' })).toEqual(['choose']);
    expect(fields({ ...m, choose: '' })).toEqual([]);
  });
  it('case-based needs a case; creating needs a section', () => {
    expect(fields({ ...ok, type: 'CASE_BASED' })).toEqual(['case']);
    expect(fields({ ...ok, type: 'CASE_BASED', caseId: 'c1' })).toEqual([]);
    expect(fields({ ...ok, sectionId: '' }, { creating: true })).toEqual(['section']);
    expect(fields({ ...ok, sectionId: '' })).toEqual([]);
  });
});

describe('API errors in friendly words', () => {
  it('correct answer codes mark the answer', () => {
    expect(describeSaveError(new ApiError(400, 'correct_not_an_option'))).toEqual({ field: 'correct', message: 'The correct answer must be one of the options.' });
    expect(describeSaveError(new ApiError(400, 'exactly_one_correct_answer'))).toEqual({ field: 'correct', message: 'Choose exactly one correct answer.' });
  });
  it('topic, case, section, choose and translation problems', () => {
    expect(describeSaveError(new ApiError(400, 'topic_not_in_category')).field).toBe('topic');
    expect(describeSaveError(new ApiError(400, 'case_not_in_test')).field).toBe('case');
    expect(describeSaveError(new ApiError(400, 'case_required')).field).toBe('case');
    expect(describeSaveError(new ApiError(400, 'case_not_allowed')).field).toBe('case');
    expect(describeSaveError(new ApiError(400, 'section_not_in_test')).field).toBe('section');
    expect(describeSaveError(new ApiError(400, 'invalid_choose')).field).toBe('choose');
    expect(describeSaveError(new ApiError(400, 'option_keys_mismatch')).field).toBe('options');
    expect(describeSaveError(new ApiError(400, 'language_not_in_test')).message).toMatch(/language/);
  });
  it('a validation error names the field from the first issue', () => {
    const e = new ApiError(400, 'validation_error', { issues: [{ path: 'explanation', message: 'Too small' }] });
    expect(describeSaveError(e)).toEqual({ field: 'explanation', message: 'Write an explanation (at least 10 characters).' });
    expect(describeSaveError(new ApiError(400, 'validation_error', { issues: [{ path: 'options.2.text', message: 'x' }] })).field).toBe('options');
    expect(describeSaveError(new ApiError(400, 'validation_error', { issues: [{ path: 'choose', message: 'x' }] })).field).toBe('choose');
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
    for (const c of ['correct_not_an_option', 'exactly_one_correct_answer', 'duplicate_option_keys', 'case_required', 'invalid_choose', 'option_keys_mismatch', 'ids_mismatch', 'weird_code']) {
      expect(describeSaveError(new ApiError(400, c)).message).not.toMatch(/_/);
    }
  });
});

describe('translations', () => {
  const keys = ['A', 'B', 'C', 'D'];
  const full = { language: 'rw', stem: 'Inyuguti', optionTexts: { A: 'a', B: 'b', C: 'c', D: 'd' }, explanation: 'Isobanura' };
  it('complete, partial and missing', () => {
    expect(translationState(toTranslationForm(full, keys), keys)).toBe('complete');
    expect(translationState(toTranslationForm(undefined, keys), keys)).toBe('missing');
    expect(translationState(toTranslationForm({ ...full, optionTexts: { A: 'a' } }, keys), keys)).toBe('partial');
    expect(translationState({ ...toTranslationForm(full, keys), explanation: ' ' }, keys)).toBe('partial');
  });
  it('dirty only when a text really changed', () => {
    const a = toTranslationForm(full, keys);
    expect(translationDirty(a, { ...a, stem: 'Inyuguti ' }, keys)).toBe(false);
    expect(translationDirty(a, { ...a, optionTexts: { ...a.optionTexts, C: 'x' } }, keys)).toBe(true);
  });
  it('the body has exactly the question’s option letters, trimmed', () => {
    const body = buildTranslationBody({ stem: ' S ', optionTexts: { A: ' a ', B: 'b', Z: 'ignored' }, explanation: ' E ' }, ['A', 'B']);
    expect(body).toEqual({ stem: 'S', optionTexts: { A: 'a', B: 'b' }, explanation: 'E' });
  });
  it('"Copy the English text" fills every field from the source', () => {
    const t = copySource(toForm(detail()));
    expect(t.stem).toContain('median');
    expect(t.optionTexts).toEqual({ A: '7', B: '7.5', C: '8', D: '7.5 and 8' });
    expect(translationState(t, keys)).toBe('complete');
  });
  it('tabs: the source first, then each language with its state in words', () => {
    const tabs = translationTabs(['en', 'rw', 'sw'], (l) => (l === 'rw' ? 'complete' : 'missing'));
    expect(tabs.map((t) => t.label)).toEqual(['English (source)', 'Kinyarwanda · Complete', 'Kiswahili · Not translated']);
    expect(tabs.map((t) => t.source)).toEqual([true, false, false]);
  });
});

describe('preview as a candidate', () => {
  it('single answer: radio-style, no "choose", never the correct answer', () => {
    const p = previewContent(toForm(detail()));
    expect(p).toMatchObject({ multiple: false, choose: null, caseId: null });
    expect(p.options.map((o) => o.text)).toEqual(['7', '7.5', '8', '7.5 and 8']);
    expect(JSON.stringify(p)).not.toContain('correct');
  });
  it('multiple-select: checkboxes, and "Choose N" only when the editor set it', () => {
    expect(previewContent(multi())).toMatchObject({ multiple: true, choose: 2 });
    expect(previewContent({ ...multi(), choose: '' }).choose).toBeNull();
  });
  it('case-based carries the case id; a non-case type does not', () => {
    expect(previewContent({ ...toForm(detail()), type: 'CASE_BASED', caseId: 'c1' }).caseId).toBe('c1');
    expect(previewContent({ ...toForm(detail()), caseId: 'c1' }).caseId).toBeNull();
  });
  it('uses the translation where there is one, the source where there is not', () => {
    const f = toForm(detail());
    const t = { stem: 'Inyuguti', optionTexts: { A: 'a', B: '', C: '', D: '' }, explanation: '' };
    const p = previewContent(f, t);
    expect(p.stem).toBe('Inyuguti');
    expect(p.options.map((o) => o.text)).toEqual(['a', '7.5', '8', '7.5 and 8']);
  });
});

describe('small helpers', () => {
  it('version note', () => {
    expect(versionNote(1204, 3)).toBe('Edited after 1,204 attempts: changing the answer does not change finished attempts.');
    expect(versionNote(1, 1)).toMatch(/after 1 attempt:/);
    expect(versionNote(0, 1)).toBe('');
    expect(versionNote(0, 4)).toMatch(/Version 4/);
  });
  it('moveId swaps neighbours and stops at the ends', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    const l = ['a', 'b'];
    expect(moveId(l, 'a', -1)).toBe(l);
    expect(moveId(l, 'x', 1)).toBe(l);
  });
  it('excerpt shortens long stems', () => {
    expect(excerpt('short')).toBe('short');
    expect(excerpt('x'.repeat(200), 20)).toHaveLength(20);
  });
});
