import { isApiError } from '../../api/client';
import type { CaseBody, CaseTable } from '../../api/types';
import type { CaseFull, CaseTranslation } from '../../api/content';

/** The case study editor (A8) as a model: values, checks with the API's limits, the body a save sends, translation completeness. */

export const CASE_LIMITS = { titleMin: 3, titleMax: 200, paragraphs: 20, paragraphMax: 3000, tables: 6, rows: 60, labelMax: 300, valueMax: 100, notes: 20, noteMax: 1000 } as const;

export interface CaseForm { title: string; passage: string[]; tables: CaseTable[]; notes: string[] }

export const emptyCaseForm = (): CaseForm => ({ title: '', passage: [''], tables: [], notes: [] });
export const emptyTable = (): CaseTable => ({ caption: '', rows: [{ label: '', value: '', heading: true }, { label: '', value: '' }] });

const copyTables = (t: CaseTable[]): CaseTable[] => t.map((x) => ({ caption: x.caption, rows: x.rows.map((r) => ({ label: r.label, value: r.value ?? '', heading: !!r.heading })) }));

export const toCaseForm = (c: Pick<CaseFull, 'title' | 'passage' | 'tables' | 'notes'> | CaseTranslation): CaseForm => ({
  title: c.title, passage: c.passage.length ? [...c.passage] : [''], tables: copyTables(c.tables), notes: [...c.notes],
});

/** The English text as a starting point for a translation. */
export const copyOf = (f: CaseForm): CaseForm => ({ title: f.title, passage: [...f.passage], tables: copyTables(f.tables), notes: [...f.notes] });

const trimmed = (l: string[]) => l.map((x) => x.trim()).filter(Boolean);

/** What the API stores: blank paragraphs, notes and rows dropped, values empty -> left out. */
export function buildCaseBody(f: CaseForm): Required<CaseBody> {
  return {
    title: f.title.trim(),
    passage: trimmed(f.passage),
    tables: f.tables.map((t) => ({
      caption: t.caption.trim(),
      rows: t.rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), ...(r.value?.trim() ? { value: r.value.trim() } : {}), ...(r.heading ? { heading: true } : {}) })),
    })),
    notes: trimmed(f.notes),
  };
}

export const isCaseDirty = (a: CaseForm, b: CaseForm): boolean => JSON.stringify(buildCaseBody(a)) !== JSON.stringify(buildCaseBody(b));

export type CaseField = 'title' | 'passage' | 'tables' | 'notes';
export type CaseProblems = Partial<Record<CaseField, string>>;

export function validateCase(f: CaseForm): CaseProblems {
  const p: CaseProblems = {};
  const t = f.title.trim();
  if (t.length < CASE_LIMITS.titleMin) p.title = `Write a title of at least ${CASE_LIMITS.titleMin} characters.`;
  else if (t.length > CASE_LIMITS.titleMax) p.title = `Keep the title to ${CASE_LIMITS.titleMax} characters or fewer.`;
  const passage = trimmed(f.passage);
  if (passage.length === 0) p.passage = 'Write at least one paragraph of the case.';
  else if (passage.length > CASE_LIMITS.paragraphs) p.passage = `Use at most ${CASE_LIMITS.paragraphs} paragraphs.`;
  else if (passage.some((x) => x.length > CASE_LIMITS.paragraphMax)) p.passage = `Keep each paragraph to ${CASE_LIMITS.paragraphMax} characters or fewer.`;
  if (f.tables.length > CASE_LIMITS.tables) p.tables = `Use at most ${CASE_LIMITS.tables} tables.`;
  else {
    for (const [i, tb] of f.tables.entries()) {
      const rows = tb.rows.filter((r) => r.label.trim());
      if (rows.length === 0) p.tables = `Table ${i + 1} needs at least one row with a label.`;
      else if (rows.length > CASE_LIMITS.rows) p.tables = `Table ${i + 1} has more than ${CASE_LIMITS.rows} rows.`;
      else if (rows.some((r) => r.label.trim().length > CASE_LIMITS.labelMax || (r.value ?? '').trim().length > CASE_LIMITS.valueMax)) p.tables = `Table ${i + 1}: labels can be ${CASE_LIMITS.labelMax} characters and values ${CASE_LIMITS.valueMax}.`;
      else if (tb.caption.trim().length > 200) p.tables = `Table ${i + 1}: keep the caption to 200 characters or fewer.`;
      if (p.tables) break;
    }
  }
  const notes = trimmed(f.notes);
  if (notes.length > CASE_LIMITS.notes) p.notes = `Use at most ${CASE_LIMITS.notes} notes.`;
  else if (notes.some((x) => x.length > CASE_LIMITS.noteMax)) p.notes = `Keep each note to ${CASE_LIMITS.noteMax} characters or fewer.`;
  return p;
}

// ───────────────────────── Translations

export type Completeness = 'complete' | 'partial' | 'missing';

const sameShape = (src: CaseForm, tr: CaseForm): boolean => {
  const a = buildCaseBody(src);
  const b = buildCaseBody(tr);
  return a.passage.length === b.passage.length && a.notes.length === b.notes.length && a.tables.length === b.tables.length &&
    a.tables.every((t, i) => t.rows.length === b.tables[i]!.rows.length);
};

/** Complete = title, every paragraph, table row and note translated (same count as the source); partial = something is written; missing = nothing. */
export function completeness(source: CaseForm, tr: CaseForm | undefined): Completeness {
  if (!tr) return 'missing';
  const b = buildCaseBody(tr);
  const any = b.title || b.passage.length || b.notes.length || b.tables.length;
  if (!any) return 'missing';
  return b.title && sameShape(source, tr) ? 'complete' : 'partial';
}
export const COMPLETENESS_WORDS: Record<Completeness, string> = { complete: 'Complete', partial: 'Partly translated', missing: 'Not translated' };

// ───────────────────────── Words for refusals

const ERR: Record<string, string> = {
  case_in_use: 'Questions still use this case study.',
  language_not_in_test: 'That language is not one of this test’s languages.',
  question_not_in_test: 'One of the questions belongs to another mock test.',
  exactly_one_correct_answer: 'A case question must have exactly one correct answer. A multiple-select question cannot be attached.',
  nothing_to_change: 'Nothing was changed.',
  case_not_found: 'This case study no longer exists.',
  admin_forbidden: 'Your role does not allow changing case studies.',
};
export function describeCaseError(e: unknown): string {
  if (!isApiError(e)) return 'Something went wrong. Your changes are still here; try again.';
  if (ERR[e.code]) return ERR[e.code]!;
  if (e.status === 0) return 'Could not reach the server. Your changes are still here; try again.';
  if (e.code === 'validation_error' || e.code === 'http_400') return 'Some of the text is not allowed (too long, or a table row without a label). Check the form and try again.';
  return 'This could not be saved. Your changes are still here; try again.';
}
