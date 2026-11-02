import { isApiError } from '../../api/client';
import type { Difficulty, QuestionDetail, QuestionPatch, QuestionType } from '../../api/types';

/**
 * The question editor as a plain model (AdminExams.dc): the form's values, which of them changed, what a save
 * sends, and the words for what the API (or a quick local check) can refuse. Edits one single-answer question;
 * multiple-select and case-based questions open read-only (design A10).
 */

export interface QuestionForm {
  stem: string;
  options: { key: string; text: string }[];
  /** Keys marked correct (one, for a single-answer question). */
  correct: string[];
  explanation: string;
  topicId: string;
  difficulty: Difficulty;
  /** Kept as typed so "1." does not jump while the user types. */
  marks: string;
  /** '' = "None". */
  caseId: string;
}

export type SaveAction = 'draft' | 'publish';

export function toForm(d: QuestionDetail): QuestionForm {
  const q = d.question;
  return {
    stem: q.stem,
    options: q.options.map((o) => ({ key: o.key, text: o.text })),
    correct: q.options.filter((o) => o.correct).map((o) => o.key),
    explanation: q.explanation,
    topicId: q.topic?.id ?? '',
    difficulty: q.difficulty,
    marks: String(q.marks),
    caseId: q.case?.id ?? '',
  };
}

/** The editor saves only single-answer questions with no case; the others are shown read-only. */
export function isEditable(type: QuestionType, hasCase: boolean): boolean {
  return type === 'SINGLE_CHOICE' && !hasCase;
}

const sameKeys = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function optionsChanged(a: QuestionForm, b: QuestionForm): boolean {
  return a.options.length !== b.options.length || a.options.some((o, i) => o.key !== b.options[i]?.key || o.text.trim() !== b.options[i]?.text.trim());
}

export function isDirty(initial: QuestionForm, form: QuestionForm): boolean {
  return (
    initial.stem.trim() !== form.stem.trim() ||
    optionsChanged(initial, form) ||
    !sameKeys(initial.correct, form.correct) ||
    initial.explanation.trim() !== form.explanation.trim() ||
    initial.topicId !== form.topicId ||
    initial.difficulty !== form.difficulty ||
    Number(initial.marks) !== Number(form.marks) ||
    initial.caseId !== form.caseId
  );
}

/**
 * What PATCH /questions/:id gets: only the fields that changed, plus the status the button asks for.
 * Options and the correct answer travel together (the API checks them against each other).
 * "Publish change & resolve reports" also closes the open reports, for admins who may.
 */
export function buildPatch(initial: QuestionForm, form: QuestionForm, action: SaveAction, opts: { canResolveReports: boolean }): QuestionPatch {
  const patch: QuestionPatch = {};
  if (initial.stem.trim() !== form.stem.trim()) patch.stem = form.stem.trim();
  if (optionsChanged(initial, form) || !sameKeys(initial.correct, form.correct)) {
    patch.options = form.options.map((o) => ({ key: o.key, text: o.text.trim() }));
    patch.correct = [...form.correct];
  }
  if (initial.explanation.trim() !== form.explanation.trim()) patch.explanation = form.explanation.trim();
  if (initial.topicId !== form.topicId) patch.topicId = form.topicId;
  if (initial.difficulty !== form.difficulty) patch.difficulty = form.difficulty;
  if (Number(initial.marks) !== Number(form.marks)) patch.marks = Number(form.marks);
  if (initial.caseId !== form.caseId) patch.caseId = form.caseId || null;
  patch.status = action === 'publish' ? 'PUBLISHED' : 'DRAFT';
  if (action === 'publish' && opts.canResolveReports) patch.resolveReports = true;
  return patch;
}

// ───────────────────────── Checks and error words

export type FieldName = 'stem' | 'options' | 'correct' | 'explanation' | 'marks' | 'topic' | 'case';
export interface FormProblem { field: FieldName; message: string }

const MSG = {
  stem: 'Write the question (at least 5 characters).',
  optionEmpty: 'Every option needs text.',
  correct: 'Choose exactly one correct answer.',
  explanation: 'Write an explanation (at least 10 characters).',
  marks: 'Marks must be more than 0 and at most 20.',
  topic: 'Choose a topic.',
} as const;

/** The same limits the API enforces, so an obvious mistake is caught before the round trip. */
export function validateForm(form: QuestionForm): FormProblem[] {
  const out: FormProblem[] = [];
  if (form.stem.trim().length < 5) out.push({ field: 'stem', message: MSG.stem });
  if (form.options.some((o) => o.text.trim().length === 0)) out.push({ field: 'options', message: MSG.optionEmpty });
  if (form.correct.length !== 1 || !form.options.some((o) => o.key === form.correct[0])) out.push({ field: 'correct', message: MSG.correct });
  if (form.explanation.trim().length < 10) out.push({ field: 'explanation', message: MSG.explanation });
  const marks = Number(form.marks);
  if (!form.marks.trim() || !Number.isFinite(marks) || marks <= 0 || marks > 20) out.push({ field: 'marks', message: MSG.marks });
  if (!form.topicId) out.push({ field: 'topic', message: MSG.topic });
  return out;
}

const CODE_COPY: Record<string, FormProblem> = {
  correct_not_an_option: { field: 'correct', message: 'The correct answer must be one of the options.' },
  exactly_one_correct_answer: { field: 'correct', message: MSG.correct },
  duplicate_option_keys: { field: 'options', message: 'Two options have the same letter.' },
  case_required: { field: 'case', message: 'Choose a case study for this question.' },
  case_not_allowed: { field: 'case', message: 'This question cannot have a case study.' },
  case_not_in_test: { field: 'case', message: 'That case study belongs to another mock test.' },
  topic_not_in_category: { field: 'topic', message: 'That topic does not belong to this test’s category.' },
  section_not_in_test: { field: 'options', message: 'This question’s section no longer exists.' },
  invalid_choose: { field: 'correct', message: 'The number of answers to choose does not fit this question.' },
};

const PATH_FIELD: Record<string, FieldName> = { stem: 'stem', options: 'options', correct: 'correct', explanation: 'explanation', marks: 'marks', topicId: 'topic', caseId: 'case' };

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
    if (field) return { field, message: 'Check this field and try again.' };
    return { message: 'Some of the values are not allowed. Check the form and try again.' };
  }
  if (e.status === 0) return { message: 'Could not reach the server. Your changes are still here; try again.' };
  if (e.code === 'admin_forbidden') return { message: 'You do not have permission to change questions.' };
  if (e.code === 'question_not_found') return { message: 'This question no longer exists.' };
  if (e.status >= 500) return { message: 'Something went wrong on our side. Your changes are still here; try again.' };
  return { message: 'This change could not be saved. Your changes are still here; try again.' };
}
