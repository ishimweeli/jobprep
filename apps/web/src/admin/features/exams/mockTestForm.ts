import { isApiError } from '../../api/client';
import type { Difficulty, MockTestBody, TestStatus } from '../../api/types';
import type { MockTestDetailEx, PublishChecklist } from '../../api/content';

/**
 * The mock-test form (A9) as a plain model: the values, which of them changed, what a save sends and the words for
 * everything the API or a quick local check can refuse. Numbers stay as typed so "1." does not jump.
 */

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'fr', label: 'French' },
];
export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'FOUNDATION', label: 'Foundation' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'CHALLENGING', label: 'Challenging' },
];
export const LIMITS = { titleMin: 5, titleMax: 200, summaryMax: 1000, durationMax: 300, instructionsMax: 12, instructionMax: 300, negativeMax: 5, sourceMin: 5, sourceMax: 300 } as const;

export interface MockTestForm {
  title: string;
  summary: string;
  countryCode: string;
  categoryId: string;
  /** Needed to create (the API makes the exam from the profession); fixed afterwards. */
  professionId: string;
  isFree: boolean;
  difficulty: Difficulty;
  durationMinutes: string;
  languages: string[];
  instructions: string[];
  /** 0 = no negative marking (the default). */
  negativeMark: string;
  passMark: string;
  passSource: string;
}

export function emptyForm(prefill: { title?: string; country?: string } = {}): MockTestForm {
  return {
    title: prefill.title ?? '', summary: '', countryCode: prefill.country ?? '', categoryId: '', professionId: '', isFree: false, difficulty: 'STANDARD',
    durationMinutes: '60', languages: ['en'], instructions: [], negativeMark: '0', passMark: '', passSource: '',
  };
}

export function toForm(d: Pick<MockTestDetailEx, 'mockTest'>): MockTestForm {
  const t = d.mockTest;
  return {
    title: t.title, summary: t.summary, countryCode: t.countryCode, categoryId: t.category.id, professionId: t.profession?.id ?? '', isFree: t.isFree,
    difficulty: t.difficulty, durationMinutes: String(t.durationMinutes), languages: [...t.languages], instructions: [...t.instructions],
    negativeMark: String(t.negativeMarkPerWrong), passMark: t.passMarkPercent === null ? '' : String(t.passMarkPercent), passSource: t.passMarkSource ?? '',
  };
}

const clean = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function isDirty(a: MockTestForm, b: MockTestForm): boolean {
  return (
    a.title.trim() !== b.title.trim() || a.summary.trim() !== b.summary.trim() || a.countryCode !== b.countryCode || a.categoryId !== b.categoryId ||
    a.professionId !== b.professionId || a.isFree !== b.isFree || a.difficulty !== b.difficulty || num(a.durationMinutes) !== num(b.durationMinutes) ||
    !sameSet(a.languages, b.languages) || !sameList(clean(a.instructions), clean(b.instructions)) || num(a.negativeMark) !== num(b.negativeMark) ||
    a.passMark.trim() !== b.passMark.trim() || a.passSource.trim() !== b.passSource.trim()
  );
}

export type TestField = 'title' | 'summary' | 'category' | 'profession' | 'duration' | 'languages' | 'instructions' | 'negative' | 'passMark' | 'passSource';
export type TestProblems = Partial<Record<TestField, string>>;

/** The API's own limits, checked before the round trip. `creating` also needs a country, a category and a profession. */
export function validateForm(f: MockTestForm, creating: boolean): TestProblems {
  const p: TestProblems = {};
  const title = f.title.trim();
  if (title.length < LIMITS.titleMin) p.title = `Write a title of at least ${LIMITS.titleMin} characters.`;
  else if (title.length > LIMITS.titleMax) p.title = `Keep the title to ${LIMITS.titleMax} characters or fewer.`;
  if (f.summary.trim().length > LIMITS.summaryMax) p.summary = `Keep the summary to ${LIMITS.summaryMax} characters or fewer.`;
  if (!f.categoryId) p.category = creating && !f.countryCode ? 'Choose a country, then a category.' : 'Choose a category.';
  if (creating && f.categoryId && !f.professionId) p.profession = 'Choose the profession this test is for.';
  const minutes = num(f.durationMinutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > LIMITS.durationMax) p.duration = `Enter a whole number of minutes from 1 to ${LIMITS.durationMax}.`;
  if (f.languages.length === 0) p.languages = 'Choose at least one language.';
  const lines = clean(f.instructions);
  if (lines.length > LIMITS.instructionsMax) p.instructions = `Use at most ${LIMITS.instructionsMax} instruction lines.`;
  else if (lines.some((l) => l.length > LIMITS.instructionMax)) p.instructions = `Keep each line to ${LIMITS.instructionMax} characters or fewer.`;
  const neg = f.negativeMark.trim() === '' ? 0 : Number(f.negativeMark);
  if (!Number.isFinite(neg) || neg < 0 || neg > LIMITS.negativeMax) p.negative = `Enter a number from 0 to ${LIMITS.negativeMax}. 0 means no marks are taken off.`;
  const hasMark = f.passMark.trim() !== '';
  const hasSource = f.passSource.trim() !== '';
  if (hasMark) {
    const pm = Number(f.passMark);
    if (!Number.isFinite(pm) || pm < 1 || pm > 100) p.passMark = 'Enter a percentage from 1 to 100.';
  }
  if (hasMark && !hasSource) p.passSource = 'Say where this pass mark is published. Without a source it is not saved.';
  else if (hasSource && !hasMark) p.passMark = 'Enter the pass mark this source states, or clear the source.';
  else if (hasSource && (f.passSource.trim().length < LIMITS.sourceMin || f.passSource.trim().length > LIMITS.sourceMax)) p.passSource = `The source needs ${LIMITS.sourceMin} to ${LIMITS.sourceMax} characters.`;
  return p;
}

const passFields = (f: MockTestForm) => {
  const has = f.passMark.trim() !== '' && f.passSource.trim() !== '';
  return { passMarkPercent: has ? Number(f.passMark) : null, passMarkSource: has ? f.passSource.trim() : null };
};

export function buildCreateBody(f: MockTestForm): MockTestBody & { title: string; categoryId: string; durationMinutes: number } {
  return {
    title: f.title.trim(), summary: f.summary.trim(), categoryId: f.categoryId, professionId: f.professionId, isFree: f.isFree, difficulty: f.difficulty,
    durationMinutes: Number(f.durationMinutes), languages: f.languages, instructions: clean(f.instructions),
    negativeMarkPerWrong: f.negativeMark.trim() === '' ? 0 : Number(f.negativeMark), ...passFields(f),
  };
}

/** Only what changed. The pass mark and its source always travel together (the API wants both or neither). */
export function buildPatch(initial: MockTestForm, f: MockTestForm): MockTestBody {
  const p: MockTestBody = {};
  if (initial.title.trim() !== f.title.trim()) p.title = f.title.trim();
  if (initial.summary.trim() !== f.summary.trim()) p.summary = f.summary.trim();
  if (initial.categoryId !== f.categoryId) p.categoryId = f.categoryId;
  if (initial.isFree !== f.isFree) p.isFree = f.isFree;
  if (initial.difficulty !== f.difficulty) p.difficulty = f.difficulty;
  if (num(initial.durationMinutes) !== num(f.durationMinutes)) p.durationMinutes = Number(f.durationMinutes);
  if (!sameSet(initial.languages, f.languages)) p.languages = f.languages;
  if (!sameList(clean(initial.instructions), clean(f.instructions))) p.instructions = clean(f.instructions);
  if (num(initial.negativeMark) !== num(f.negativeMark)) p.negativeMarkPerWrong = f.negativeMark.trim() === '' ? 0 : Number(f.negativeMark);
  if (initial.passMark.trim() !== f.passMark.trim() || initial.passSource.trim() !== f.passSource.trim()) Object.assign(p, passFields(f));
  return p;
}

// ───────────────────────── Words

const ERRORS: Record<string, { field?: TestField; message: string }> = {
  pass_mark_needs_percent_and_source: { field: 'passSource', message: 'Enter both the official pass mark and its source, or leave both empty.' },
  exam_or_profession_required: { field: 'profession', message: 'Choose the profession this test is for.' },
  profession_not_in_category: { field: 'profession', message: 'That profession does not belong to this category.' },
  exam_not_in_category: { field: 'profession', message: 'That exam does not belong to this category.' },
  category_not_found: { field: 'category', message: 'That category no longer exists.' },
  category_not_in_country: { field: 'category', message: 'A test cannot move to a category of another country.' },
  admin_forbidden: { message: 'Your role does not allow changing mock tests.' },
  mock_test_not_found: { message: 'This mock test no longer exists.' },
};

const ISSUE_FIELD: Record<string, TestField> = {
  title: 'title', summary: 'summary', categoryId: 'category', professionId: 'profession', durationMinutes: 'duration', languages: 'languages',
  instructions: 'instructions', negativeMarkPerWrong: 'negative', passMarkPercent: 'passMark', passMarkSource: 'passSource',
};

export function describeTestError(e: unknown): { field?: TestField; message: string } {
  if (!isApiError(e)) return { message: 'Something went wrong. Your changes are still here; try again.' };
  const known = ERRORS[e.code];
  if (known) return known;
  if (e.code === 'validation_error' || e.code === 'http_400') {
    const issues = Array.isArray(e.details.issues) ? (e.details.issues as { path?: unknown }[]) : [];
    const first = issues[0]?.path;
    const root = typeof first === 'string' ? (first.split('.')[0] ?? '') : Array.isArray(first) ? String(first[0] ?? '') : '';
    const field = ISSUE_FIELD[root];
    if (field) return { field, message: 'Check this field and try again.' };
    return { message: 'Some of the values are not allowed. Check the form and try again.' };
  }
  if (e.status === 0) return { message: 'Could not reach the server. Your changes are still here; try again.' };
  if (e.status >= 500) return { message: 'Something went wrong on our side. Your changes are still here; try again.' };
  return { message: 'This change could not be saved. Your changes are still here; try again.' };
}

/** What a refused publish (409 publish_blocked, `problems[]`) or another lifecycle call says, in words. */
const PROBLEM_WORDS: Record<string, string> = {
  no_published_questions: 'Publish at least one question first. Draft questions are not shown to candidates.',
  title_missing: 'Give the test a title of at least 5 characters.',
};
export function publishProblems(e: unknown): string[] {
  if (!isApiError(e)) return [];
  const list = Array.isArray(e.details.problems) ? (e.details.problems as string[]) : [];
  return list.map((p) => PROBLEM_WORDS[p] ?? 'Something about this test needs fixing before it can go live.');
}
const LIFECYCLE: Record<string, string> = {
  archived: 'An archived test has to be restored before it can be published.',
  not_published: 'This test is not published.',
  not_archived: 'This test is not archived.',
  admin_forbidden: 'Your role does not allow changing mock tests.',
  reason_required: 'A reason is required.',
  reason_too_short: 'Write a reason of at least 5 characters.',
};
export function describeLifecycleError(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'publish_blocked') return publishProblems(e).join(' ') || 'This test cannot be published yet.';
    if (LIFECYCLE[e.code]) return LIFECYCLE[e.code]!;
    if (e.status === 0) return 'Could not reach the server. Nothing was changed; try again.';
  }
  return 'This could not be done. Nothing was changed; try again.';
}

const CHECK_WORDS: Record<string, { ok: string; bad: string }> = {
  hasQuestions: { ok: 'At least one published question', bad: 'Needs at least one published question' },
  title: { ok: 'Has a title', bad: 'Needs a title of at least 5 characters' },
  freeSample: { ok: 'A free sample exists in this category', bad: 'No free sample in this category yet: candidates will not be able to try before paying' },
  instructions: { ok: 'Has instructions for candidates', bad: 'No instruction lines yet' },
  translations: { ok: 'Questions are translated', bad: 'Some questions are not translated yet' },
};

/** One checklist row as words, and whether it stops publishing (a blocking item) or only warns. */
export function checklistRow(item: PublishChecklist['items'][number]): { text: string; mark: '✓' | '✕' | '!'; tone: 'ok' | 'block' | 'warn'; detail?: string } {
  const w = CHECK_WORDS[item.key];
  const text = w ? (item.ok ? w.ok : w.bad) : item.label;
  if (item.ok) return { text, mark: '✓', tone: 'ok' };
  return { text, mark: item.blocking ? '✕' : '!', tone: item.blocking ? 'block' : 'warn', detail: item.detail };
}

export const STATUS_WORDS: Record<TestStatus, string> = { DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' };

/** "Used by 3 mock tests and 12 topics" from a 409's `usedBy` counts. */
export function usedByWords(usedBy: unknown): string {
  if (!usedBy || typeof usedBy !== 'object') return '';
  const u = usedBy as Record<string, unknown>;
  const label: [string, string, string][] = [['mockTests', 'mock test', 'mock tests'], ['topics', 'topic', 'topics'], ['professions', 'profession', 'professions'], ['users', 'candidate goal', 'candidate goals'], ['questions', 'question', 'questions']];
  const parts = label.flatMap(([k, one, many]) => {
    const n = Number(u[k] ?? 0);
    return n > 0 ? [`${n.toLocaleString('en-US')} ${n === 1 ? one : many}`] : [];
  });
  if (parts.length === 0) return '';
  const joined = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Used by ${joined}`;
}

/** Move one entry up or down; returns the same array when it cannot move. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(index, 1);
  next.splice(to, 0, x!);
  return next;
}
