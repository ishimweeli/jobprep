import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import {
  buildCreateBody, buildPatch, checklistRow, describeLifecycleError, describeTestError, emptyForm, isDirty, moveItem, publishProblems, toForm, usedByWords, validateForm,
  type MockTestForm,
} from './mockTestForm';
import { blockedByCounts, checkName, guarded, idsAfterMove, inUseSentence, movedAnnouncement } from './catalogModel';

const detail = {
  mockTest: {
    id: 't1', slug: 's', title: 'Sec. Mathematics — Mock 1', summary: 'Sum', status: 'DRAFT' as const, isFree: false, difficulty: 'STANDARD' as const, durationMinutes: 90,
    languages: ['en', 'rw'], instructions: ['Read each question.'], countryCode: 'RW', negativeMarkPerWrong: 0, passMarkPercent: null, passMarkSource: null,
    category: { id: 'c1', name: 'Teaching' }, publishedAt: null, profession: { id: 'p1', name: 'Teacher' },
  },
  sections: [], cases: [], questions: [],
};
const filled = (): MockTestForm => ({ ...emptyForm({ country: 'RW' }), title: 'A new mock test', categoryId: 'c1', professionId: 'p1' });

describe('mock test form model', () => {
  it('starts as a free sample with negative marking off and no pass mark, prefilled from the link', () => {
    const f = emptyForm({ title: 'Veterinary officer', country: 'KE' });
    expect(f).toMatchObject({ title: 'Veterinary officer', countryCode: 'KE', negativeMark: '0', passMark: '', passSource: '', languages: ['en'], isFree: true });
  });

  it('checks the same limits as the API', () => {
    const p = validateForm({ ...emptyForm(), title: 'abc', durationMinutes: '0', languages: [] }, true);
    expect(Object.keys(p).sort()).toEqual(['category', 'duration', 'languages', 'title']);
    expect(validateForm(filled(), true)).toEqual({});
    expect(validateForm({ ...filled(), professionId: '' }, true).profession).toBeTruthy();
    expect(validateForm({ ...filled(), professionId: '' }, false).profession).toBeUndefined(); // fixed after creation
    expect(validateForm({ ...filled(), durationMinutes: '301' }, true).duration).toBeTruthy();
    expect(validateForm({ ...filled(), durationMinutes: '45.5' }, true).duration).toBeTruthy();
    expect(validateForm({ ...filled(), negativeMark: '6' }, true).negative).toBeTruthy();
    expect(validateForm({ ...filled(), instructions: Array(13).fill('x') }, true).instructions).toBeTruthy();
  });

  it('an official pass mark needs its source, and a source needs its mark', () => {
    expect(validateForm({ ...filled(), passMark: '50' }, true).passSource).toMatch(/source/i);
    expect(validateForm({ ...filled(), passSource: 'MINEDUC notice, 2026' }, true).passMark).toBeTruthy();
    expect(validateForm({ ...filled(), passMark: '101', passSource: 'MINEDUC notice, 2026' }, true).passMark).toBeTruthy();
    expect(validateForm({ ...filled(), passMark: '50', passSource: 'MINEDUC notice, 2026' }, true)).toEqual({});
  });

  it('builds the create body: trimmed, blank instruction lines dropped, pass mark and source together or both null', () => {
    const f = { ...filled(), title: '  A new mock test ', instructions: ['  one ', '', 'two'], negativeMark: '0.25' };
    expect(buildCreateBody(f)).toMatchObject({ title: 'A new mock test', instructions: ['one', 'two'], negativeMarkPerWrong: 0.25, passMarkPercent: null, passMarkSource: null, professionId: 'p1', durationMinutes: 60 });
    expect(buildCreateBody({ ...f, passMark: '55', passSource: 'Notice 12/2026' })).toMatchObject({ passMarkPercent: 55, passMarkSource: 'Notice 12/2026' });
  });

  it('sends only what changed; the pass mark pair travels together', () => {
    const initial = toForm(detail);
    expect(isDirty(initial, initial)).toBe(false);
    expect(buildPatch(initial, { ...initial, title: 'Renamed mock test' })).toEqual({ title: 'Renamed mock test' });
    expect(buildPatch(initial, { ...initial, isFree: true, durationMinutes: '45' })).toEqual({ isFree: true, durationMinutes: 45 });
    expect(buildPatch(initial, { ...initial, passMark: '50', passSource: 'Notice' })).toEqual({ passMarkPercent: 50, passMarkSource: 'Notice' });
    expect(buildPatch({ ...initial, passMark: '50', passSource: 'Notice' }, { ...initial, passMark: '', passSource: '' })).toEqual({ passMarkPercent: null, passMarkSource: null });
    expect(buildPatch(initial, { ...initial, languages: ['rw', 'en'] })).toEqual({}); // same set
    expect(isDirty(initial, { ...initial, instructions: ['Read each question.', ''] })).toBe(false); // blank lines do not count
    expect(isDirty(initial, { ...initial, instructions: ['Different'] })).toBe(true);
  });

  it('puts API refusals in words and on the right field', () => {
    expect(describeTestError(new ApiError(400, 'pass_mark_needs_percent_and_source'))).toMatchObject({ field: 'passSource' });
    expect(describeTestError(new ApiError(400, 'exam_or_profession_required')).field).toBe('profession');
    const issue = describeTestError(new ApiError(400, 'validation_error', { issues: [{ path: 'durationMinutes' }] }));
    expect(issue.field).toBe('duration');
    expect(describeTestError(new ApiError(500, 'internal_error')).message).not.toMatch(/internal_error/);
    expect(describeTestError(new ApiError(0, 'network_error')).message).toMatch(/reach the server/);
  });

  it('turns a blocked publish into sentences, never raw codes', () => {
    const e = new ApiError(409, 'publish_blocked', { problems: ['no_published_questions', 'title_missing'] });
    expect(publishProblems(e)).toHaveLength(2);
    expect(publishProblems(e).join(' ')).not.toMatch(/no_published_questions/);
    expect(describeLifecycleError(e)).toMatch(/at least one question/i);
    expect(describeLifecycleError(new ApiError(409, 'archived'))).toMatch(/restored/);
    expect(describeLifecycleError(new Error('x'))).toMatch(/Nothing was changed/);
  });

  it('checklist rows: blocking items are a cross, others a warning, done ones a tick', () => {
    expect(checklistRow({ key: 'hasQuestions', label: 'x', ok: false, blocking: true })).toMatchObject({ mark: '✕', tone: 'block' });
    expect(checklistRow({ key: 'freeSample', label: 'x', ok: false, blocking: false })).toMatchObject({ mark: '!', tone: 'warn' });
    expect(checklistRow({ key: 'title', label: 'x', ok: true, blocking: true })).toMatchObject({ mark: '✓', tone: 'ok' });
    expect(checklistRow({ key: 'translations', label: 'x', ok: false, blocking: false, detail: 'rw: 3 missing' }).detail).toBe('rw: 3 missing');
    expect(checklistRow({ key: 'other', label: 'Custom label', ok: false, blocking: false }).text).toBe('Custom label');
  });

  it('reorder helpers', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(idsAfterMove([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(movedAnnouncement('Teaching', 2, 5)).toBe('Moved Teaching to position 2 of 5.');
  });
});

describe('the "used by N" guard', () => {
  it('names who uses it', () => {
    expect(usedByWords({ mockTests: 3, topics: 12 })).toBe('Used by 3 mock tests and 12 topics');
    expect(usedByWords({ questions: 1 })).toBe('Used by 1 question');
    expect(usedByWords({ mockTests: 2, topics: 4, professions: 1 })).toBe('Used by 2 mock tests, 4 topics and 1 profession');
    expect(usedByWords({})).toBe('');
    expect(usedByWords(undefined)).toBe('');
  });
  it('sentences and the button explanation', () => {
    expect(inUseSentence({ mockTests: 3, topics: 12 }, 'category', 'Move them.')).toBe('Used by 3 mock tests and 12 topics, so this category cannot be deleted. Move them.');
    expect(inUseSentence(undefined, 'topic', 'Move them.')).toMatch(/still in use/);
    expect(blockedByCounts({ questions: 0 }, 'topic', 'x')).toBeUndefined();
    expect(blockedByCounts({ questions: 4 }, 'topic', 'Move them.')).toMatch(/Used by 4 questions/);
  });
  it('guarded writes the sentence for the dialog before rethrowing', async () => {
    const errors: Record<string, string> = {};
    const err = new ApiError(409, 'topic_in_use', { usedBy: { questions: 7 } });
    await expect(guarded(errors, 'topic_in_use', 'topic', 'Move them.', () => Promise.reject(err))).rejects.toBe(err);
    expect(errors.topic_in_use).toMatch(/Used by 7 questions/);
    await expect(guarded(errors, 'x', 'topic', 't', async () => 5)).resolves.toBe(5);
  });
  it('name checks', () => {
    expect(checkName('a')).toMatch(/at least 2/);
    expect(checkName('ok')).toBeUndefined();
    expect(checkName('x'.repeat(121))).toMatch(/120/);
  });
});
