import { isApiError } from '../../api/client';
import type { Difficulty, QuestionCreateBody, QuestionDetail, QuestionPatch, QuestionType } from '../../api/types';
import type { QuestionDetailX, QuestionTranslation, TranslationState } from '../../api/questions-demand';
import { languageName } from '../../lib/format';

/**
 * The question editor as a plain model (AdminExams.dc, extended for A10): the form's values for the three question
 * types, option editing (add, remove, move: letters always stay A, B, C ... and the correct set follows the text),
 * which values changed, what a save or a create sends, the translations, the candidate preview and the words for what
 * the API (or a quick local check) can refuse.
 */

export type Scoring = 'ALL_OR_NOTHING' | 'PARTIAL';
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export interface QuestionForm {
  type: QuestionType;
  stem: string;
  options: { key: string; text: string }[];
  /** Keys marked correct (exactly one unless the type is multiple-select). */
  correct: string[];
  /** Multiple-select only. */
  scoring: Scoring;
  /** Multiple-select only: "Choose N" shown to the candidate. Kept as typed; '' = not set. */
  choose: string;
  explanation: string;
  topicId: string;
  difficulty: Difficulty;
  /** Kept as typed so "1." does not jump while the user types. */
  marks: string;
  /** Case-based only. '' = none. */
  caseId: string;
  sectionId: string;
}

export type SaveAction = 'draft' | 'publish';

export const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Single answer',
  MULTIPLE_SELECT: 'Multiple answers (select all that apply)',
  CASE_BASED: 'Case-based (single answer, with a case study)',
};
/** The short badge in lists. */
export const TYPE_BADGE: Record<QuestionType, string> = { SINGLE_CHOICE: 'Single answer', MULTIPLE_SELECT: 'Multiple answers', CASE_BASED: 'Case-based' };

export function toForm(d: QuestionDetailX | QuestionDetail): QuestionForm {
  const q = d.question;
  return {
    type: q.type,
    stem: q.stem,
    options: q.options.map((o) => ({ key: o.key, text: o.text })),
    correct: q.options.filter((o) => o.correct).map((o) => o.key),
    scoring: q.scoring ?? 'ALL_OR_NOTHING',
    choose: q.choose != null ? String(q.choose) : '',
    explanation: q.explanation,
    topicId: q.topic?.id ?? '',
    difficulty: q.difficulty,
    marks: String(q.marks),
    caseId: q.case?.id ?? '',
    sectionId: q.section?.id ?? '',
  };
}

/** A blank question for "Add question": four empty options, single answer, standard difficulty, 1 mark. */
export function newForm(defaults: { sectionId?: string; topicId?: string } = {}): QuestionForm {
  return {
    type: 'SINGLE_CHOICE', stem: '', options: LETTERS.slice(0, 4).map((key) => ({ key, text: '' })), correct: [], scoring: 'ALL_OR_NOTHING', choose: '',
    explanation: '', topicId: defaults.topicId ?? '', difficulty: 'STANDARD', marks: '1', caseId: '', sectionId: defaults.sectionId ?? '',
  };
}

/** Anyone with exams:write may edit any type: single, multiple-select and case-based. */
export function isEditable(canWrite: boolean): boolean {
  return canWrite;
}

// ───────────────────────── Option editing (pure)

const relabel = (options: { key: string; text: string }[]) => options.map((o, i) => ({ key: LETTERS[i]!, text: o.text }));

export function addOption(f: QuestionForm): QuestionForm {
  if (f.options.length >= MAX_OPTIONS) return f;
  return { ...f, options: [...f.options, { key: LETTERS[f.options.length]!, text: '' }] };
}

/** Removes an option, re-letters the rest (A, B, C ...) and keeps the correct set pointing at the same texts. */
export function removeOption(f: QuestionForm, key: string): QuestionForm {
  if (f.options.length <= MIN_OPTIONS) return f;
  const at = f.options.findIndex((o) => o.key === key);
  if (at < 0) return f;
  const correctIdx = f.correct.map((k) => f.options.findIndex((o) => o.key === k)).filter((i) => i >= 0 && i !== at).map((i) => (i > at ? i - 1 : i));
  const options = relabel(f.options.filter((_, i) => i !== at));
  return { ...f, options, correct: correctIdx.map((i) => options[i]!.key).sort() };
}

/** Moves an option up (-1) or down (+1): the texts swap places, the letters stay in order, the correct flag moves with its text. */
export function moveOption(f: QuestionForm, key: string, dir: -1 | 1): QuestionForm {
  const at = f.options.findIndex((o) => o.key === key);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= f.options.length) return f;
  const idx = f.correct.map((k) => f.options.findIndex((o) => o.key === k)).map((i) => (i === at ? to : i === to ? at : i));
  const texts = f.options.map((o) => o.text);
  [texts[at], texts[to]] = [texts[to]!, texts[at]!];
  const options = f.options.map((o, i) => ({ key: o.key, text: texts[i]! }));
  return { ...f, options, correct: idx.map((i) => options[i]!.key).sort() };
}

/** Marks / unmarks an option as correct: a single-answer question has exactly one, multiple-select any number. */
export function toggleCorrect(f: QuestionForm, key: string): QuestionForm {
  if (f.type !== 'MULTIPLE_SELECT') return { ...f, correct: [key] };
  return { ...f, correct: f.correct.includes(key) ? f.correct.filter((k) => k !== key) : [...f.correct, key].sort() };
}

/** Changes the question type and tidies what no longer applies (one correct answer, no case outside case-based). */
export function setType(f: QuestionForm, type: QuestionType): QuestionForm {
  if (type === f.type) return f;
  const next: QuestionForm = { ...f, type };
  if (type !== 'MULTIPLE_SELECT') {
    next.correct = f.correct.slice(0, 1);
    next.choose = '';
  }
  if (type !== 'CASE_BASED') next.caseId = '';
  return next;
}

// ───────────────────────── Changes and what to send

const sameKeys = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function optionsChanged(a: QuestionForm, b: QuestionForm): boolean {
  return a.options.length !== b.options.length || a.options.some((o, i) => o.key !== b.options[i]?.key || o.text.trim() !== b.options[i]?.text.trim());
}

const effectiveCase = (f: QuestionForm) => (f.type === 'CASE_BASED' ? f.caseId : '');
const effectiveChoose = (f: QuestionForm) => (f.type === 'MULTIPLE_SELECT' && f.choose.trim() !== '' ? Number(f.choose) : null);
const effectiveScoring = (f: QuestionForm): Scoring => (f.type === 'MULTIPLE_SELECT' ? f.scoring : 'ALL_OR_NOTHING');

export function isDirty(initial: QuestionForm, form: QuestionForm): boolean {
  return (
    initial.type !== form.type ||
    initial.stem.trim() !== form.stem.trim() ||
    optionsChanged(initial, form) ||
    !sameKeys(initial.correct, form.correct) ||
    effectiveScoring(initial) !== effectiveScoring(form) ||
    effectiveChoose(initial) !== effectiveChoose(form) ||
    initial.explanation.trim() !== form.explanation.trim() ||
    initial.topicId !== form.topicId ||
    initial.difficulty !== form.difficulty ||
    Number(initial.marks) !== Number(form.marks) ||
    effectiveCase(initial) !== effectiveCase(form) ||
    initial.sectionId !== form.sectionId
  );
}

/**
 * What PATCH /questions/:id gets: only the fields that changed, plus the status the button asks for. Options and the
 * correct answer travel together (the API checks them against each other). A change of type, scoring or "choose" sends
 * the type with them so the API applies the rules of that type. "Publish change & resolve reports" also closes the
 * open reports, for admins who may.
 */
export function buildPatch(initial: QuestionForm, form: QuestionForm, action: SaveAction, opts: { canResolveReports: boolean }): QuestionPatch & { type?: QuestionType; scoring?: Scoring; choose?: number | null; sectionId?: string } {
  const patch: QuestionPatch & { type?: QuestionType; scoring?: Scoring; choose?: number | null; sectionId?: string } = {};
  if (initial.stem.trim() !== form.stem.trim()) patch.stem = form.stem.trim();
  const ocChanged = optionsChanged(initial, form) || !sameKeys(initial.correct, form.correct);
  const typeChanged = initial.type !== form.type;
  const multiChanged = form.type === 'MULTIPLE_SELECT' && (effectiveScoring(initial) !== effectiveScoring(form) || effectiveChoose(initial) !== effectiveChoose(form));
  if (ocChanged || typeChanged || multiChanged) {
    patch.options = form.options.map((o) => ({ key: o.key, text: o.text.trim() }));
    patch.correct = [...form.correct];
    patch.type = form.type;
    if (form.type === 'MULTIPLE_SELECT') {
      patch.scoring = form.scoring;
      patch.choose = effectiveChoose(form);
    }
  }
  if (initial.explanation.trim() !== form.explanation.trim()) patch.explanation = form.explanation.trim();
  if (initial.topicId !== form.topicId) patch.topicId = form.topicId;
  if (initial.sectionId !== form.sectionId && form.sectionId) patch.sectionId = form.sectionId;
  if (initial.difficulty !== form.difficulty) patch.difficulty = form.difficulty;
  if (Number(initial.marks) !== Number(form.marks)) patch.marks = Number(form.marks);
  if (effectiveCase(initial) !== effectiveCase(form) || typeChanged) patch.caseId = effectiveCase(form) || null;
  patch.status = action === 'publish' ? 'PUBLISHED' : 'DRAFT';
  if (action === 'publish' && opts.canResolveReports) patch.resolveReports = true;
  return patch;
}

/** `POST /mock-tests/:id/questions`: a whole question. */
export function buildCreate(form: QuestionForm, action: SaveAction): QuestionCreateBody {
  const body: QuestionCreateBody = {
    sectionId: form.sectionId,
    stem: form.stem.trim(),
    options: form.options.map((o) => ({ key: o.key, text: o.text.trim() })),
    correct: [...form.correct],
    type: form.type,
    explanation: form.explanation.trim(),
    topicId: form.topicId,
    marks: Number(form.marks),
    difficulty: form.difficulty,
    status: action === 'publish' ? 'PUBLISHED' : 'DRAFT',
  };
  if (form.type === 'MULTIPLE_SELECT') {
    body.scoring = form.scoring;
    const choose = effectiveChoose(form);
    if (choose !== null) body.choose = choose;
  }
  if (form.type === 'CASE_BASED') body.caseId = form.caseId;
  return body;
}

// ───────────────────────── Checks and error words

export type FieldName = 'stem' | 'options' | 'correct' | 'explanation' | 'marks' | 'topic' | 'case' | 'choose' | 'section' | 'type';
export interface FormProblem { field: FieldName; message: string }

const MSG = {
  stem: 'Write the question (at least 5 characters).',
  optionEmpty: 'Every option needs text.',
  optionCount: `A question has ${MIN_OPTIONS} to ${MAX_OPTIONS} options.`,
  correctOne: 'Choose exactly one correct answer.',
  correctMany: 'Tick at least one correct answer.',
  explanation: 'Write an explanation (at least 10 characters).',
  marks: 'Marks must be more than 0 and at most 20.',
  topic: 'Choose a topic.',
  section: 'Choose a section.',
  case: 'Choose a case study for this question.',
  choose: 'The number to choose must be at least the number of correct answers and at most the number of options.',
} as const;

/** The same limits the API enforces, so an obvious mistake is caught before the round trip. */
export function validateForm(form: QuestionForm, opts: { creating?: boolean } = {}): FormProblem[] {
  const out: FormProblem[] = [];
  const multi = form.type === 'MULTIPLE_SELECT';
  if (form.stem.trim().length < 5) out.push({ field: 'stem', message: MSG.stem });
  if (form.options.length < MIN_OPTIONS || form.options.length > MAX_OPTIONS) out.push({ field: 'options', message: MSG.optionCount });
  else if (form.options.some((o) => o.text.trim().length === 0)) out.push({ field: 'options', message: MSG.optionEmpty });
  const known = form.correct.every((k) => form.options.some((o) => o.key === k));
  if (multi) {
    if (form.correct.length < 1 || !known) out.push({ field: 'correct', message: MSG.correctMany });
  } else if (form.correct.length !== 1 || !known) out.push({ field: 'correct', message: MSG.correctOne });
  if (multi && form.choose.trim() !== '') {
    const n = Number(form.choose);
    if (!Number.isInteger(n) || n < Math.max(1, form.correct.length) || n > form.options.length) out.push({ field: 'choose', message: MSG.choose });
  }
  if (form.type === 'CASE_BASED' && !form.caseId) out.push({ field: 'case', message: MSG.case });
  if (form.explanation.trim().length < 10) out.push({ field: 'explanation', message: MSG.explanation });
  const marks = Number(form.marks);
  if (!form.marks.trim() || !Number.isFinite(marks) || marks <= 0 || marks > 20) out.push({ field: 'marks', message: MSG.marks });
  if (!form.topicId) out.push({ field: 'topic', message: MSG.topic });
  if (opts.creating && !form.sectionId) out.push({ field: 'section', message: MSG.section });
  return out;
}

const CODE_COPY: Record<string, FormProblem> = {
  correct_not_an_option: { field: 'correct', message: 'The correct answer must be one of the options.' },
  exactly_one_correct_answer: { field: 'correct', message: MSG.correctOne },
  duplicate_option_keys: { field: 'options', message: 'Two options have the same letter.' },
  case_required: { field: 'case', message: MSG.case },
  case_not_allowed: { field: 'case', message: 'Only a case-based question can have a case study.' },
  case_not_in_test: { field: 'case', message: 'That case study belongs to another mock test.' },
  topic_not_in_category: { field: 'topic', message: 'That topic does not belong to this test’s category.' },
  section_not_in_test: { field: 'section', message: 'That section does not belong to this mock test.' },
  invalid_choose: { field: 'choose', message: MSG.choose },
  option_keys_mismatch: { field: 'options', message: 'The translation must have one text for each option, with the same letters.' },
  language_not_in_test: { field: 'type', message: 'This mock test does not offer that language.' },
  ids_mismatch: { field: 'type', message: 'The list of questions changed while you were working. Reload the page and try again.' },
};

const PATH_FIELD: Record<string, FieldName> = {
  stem: 'stem', options: 'options', correct: 'correct', explanation: 'explanation', marks: 'marks', topicId: 'topic', caseId: 'case', choose: 'choose', sectionId: 'section',
};

/** Friendly words for whatever a save returned. `field` says which control to mark, when there is one. */
export function describeSaveError(e: unknown): { message: string; field?: FieldName } {
  if (!isApiError(e)) return { message: 'Something went wrong. Your changes are still here; try again.' };
  const known = CODE_COPY[e.code];
  if (known) return known;
  if (e.code === 'validation_error' || e.code === 'http_400') {
    const issues = Array.isArray(e.details.issues) ? (e.details.issues as { path?: unknown; message?: unknown }[]) : [];
    const first = issues[0];
    const root = typeof first?.path === 'string' ? first.path.split('.')[0] ?? '' : '';
    const field = PATH_FIELD[root];
    if (field === 'stem') return { field, message: MSG.stem };
    if (field === 'explanation') return { field, message: MSG.explanation };
    if (field === 'marks') return { field, message: MSG.marks };
    if (field === 'options') return { field, message: MSG.optionEmpty };
    if (field === 'choose') return { field, message: MSG.choose };
    if (field) return { field, message: 'Check this field and try again.' };
    return { message: 'Some of the values are not allowed. Check the form and try again.' };
  }
  if (e.status === 0) return { message: 'Could not reach the server. Your changes are still here; try again.' };
  if (e.code === 'admin_forbidden') return { message: 'You do not have permission to change questions.' };
  if (e.code === 'question_not_found') return { message: 'This question no longer exists.' };
  if (e.status >= 500) return { message: 'Something went wrong on our side. Your changes are still here; try again.' };
  return { message: 'This change could not be saved. Your changes are still here; try again.' };
}

// ───────────────────────── Translations

export interface TranslationForm { stem: string; optionTexts: Record<string, string>; explanation: string }

export const emptyTranslation = (keys: string[]): TranslationForm => ({ stem: '', optionTexts: Object.fromEntries(keys.map((k) => [k, ''])), explanation: '' });

export function toTranslationForm(t: QuestionTranslation | undefined, keys: string[]): TranslationForm {
  return { stem: t?.stem ?? '', optionTexts: Object.fromEntries(keys.map((k) => [k, t?.optionTexts?.[k] ?? ''])), explanation: t?.explanation ?? '' };
}

/** complete = stem, explanation and every option translated; missing = nothing at all; otherwise partial. */
export function translationState(t: TranslationForm, keys: string[]): TranslationState {
  const parts = [t.stem, t.explanation, ...keys.map((k) => t.optionTexts[k] ?? '')].map((s) => s.trim());
  if (parts.every((p) => p === '')) return 'missing';
  return parts.every((p) => p !== '') ? 'complete' : 'partial';
}

export const TRANSLATION_LABEL: Record<TranslationState, string> = { complete: 'Complete', partial: 'Partly translated', missing: 'Not translated' };

export function translationDirty(initial: TranslationForm, form: TranslationForm, keys: string[]): boolean {
  return initial.stem.trim() !== form.stem.trim() || initial.explanation.trim() !== form.explanation.trim() || keys.some((k) => (initial.optionTexts[k] ?? '').trim() !== (form.optionTexts[k] ?? '').trim());
}

/** The body of PUT /questions/:id/translations/:lang: one text for exactly the question's option letters. */
export function buildTranslationBody(t: TranslationForm, keys: string[]) {
  return { stem: t.stem.trim(), optionTexts: Object.fromEntries(keys.map((k) => [k, (t.optionTexts[k] ?? '').trim()])), explanation: t.explanation.trim() };
}

/** "Copy the English text": the source text as the starting point of a translation. */
export function copySource(f: Pick<QuestionForm, 'stem' | 'options' | 'explanation'>): TranslationForm {
  return { stem: f.stem, optionTexts: Object.fromEntries(f.options.map((o) => [o.key, o.text])), explanation: f.explanation };
}

/** Tab titles: the source language first, then each other language of the test with its completeness. */
export function translationTabs(languages: string[], state: (lang: string) => TranslationState): { code: string; label: string; source: boolean }[] {
  return languages.map((code, i) => (i === 0
    ? { code, label: `${languageName(code)} (source)`, source: true }
    : { code, label: `${languageName(code)} · ${TRANSLATION_LABEL[state(code)]}`, source: false }));
}

// ───────────────────────── Preview as a candidate sees it

export interface PreviewContent {
  stem: string;
  options: { key: string; text: string }[];
  multiple: boolean;
  /** Only when the question sets "Choose N": the candidate is then told how many to pick. Otherwise the correct count is never revealed. */
  choose: number | null;
  caseId: string | null;
}

/** What the candidate's exam screen would show: the chosen language where translated (else the source text), never the correct answers. */
export function previewContent(form: QuestionForm, translation?: TranslationForm | null): PreviewContent {
  const pick = (own: string | undefined, source: string) => (own && own.trim() ? own.trim() : source.trim());
  return {
    stem: pick(translation?.stem, form.stem),
    options: form.options.map((o) => ({ key: o.key, text: pick(translation?.optionTexts[o.key], o.text) })),
    multiple: form.type === 'MULTIPLE_SELECT',
    choose: effectiveChoose(form),
    caseId: form.type === 'CASE_BASED' && form.caseId ? form.caseId : null,
  };
}

// ───────────────────────── Version note

export function versionNote(attempts: number, version: number): string {
  const n = attempts.toLocaleString('en-US');
  if (attempts > 0) return `Edited after ${n} ${attempts === 1 ? 'attempt' : 'attempts'}: changing the answer does not change finished attempts.`;
  return version > 1 ? `Version ${version}. Nobody has answered this question since it was last edited.` : '';
}

// ───────────────────────── Reorder

/** Moves one id up (-1) or down (+1) in a list; the same list when it cannot move. */
export function moveId(ids: string[], id: string, dir: -1 | 1): string[] {
  const at = ids.indexOf(id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[at], next[to]] = [next[to]!, next[at]!];
  return next;
}

/** First line of a stem for lists. */
export const excerpt = (s: string, n = 90) => (s.trim().length > n ? `${s.trim().slice(0, n - 1).trimEnd()}…` : s.trim());
