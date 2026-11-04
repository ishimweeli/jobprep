import { isApiError } from '../../api/client';
import type { ColumnMap, ImportColumn } from '../../api/content';
import type { ImportRowProblem } from '../../api/types';

/** The CSV import (A6) as plain functions: the words for every problem code, file checks, column mapping, steps. */

export const MAX_BYTES = 1_000_000;
export const MAX_ROWS = 1000;
export const STEPS = ['File', 'Columns', 'Check', 'Import'] as const;
export const stepLabel = (n: number) => `Step ${n} of ${STEPS.length}`;

export const formatBytes = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const COLUMN_NAMES: Record<string, string> = {
  section: 'Section', topic: 'Topic', stem: 'Question', option_a: 'Option A', option_b: 'Option B', option_c: 'Option C', option_d: 'Option D', option_e: 'Option E',
  option_f: 'Option F', options: 'Options', correct: 'Correct answer', explanation: 'Explanation', marks: 'Marks', difficulty: 'Difficulty', scoring: 'Scoring', choose: 'Choose',
};
export const columnName = (c: string | undefined): string => (c ? (COLUMN_NAMES[c] ?? c) : '');

/** One problem row as a sentence. Never shows the raw code. */
export function problemWords(p: Pick<ImportRowProblem, 'problem'>): string {
  const [code, ...rest] = p.problem.split(':');
  const arg = rest.join(':');
  switch (code) {
    case 'missing_section': return 'The section is empty.';
    case 'unknown_section': return `Section “${arg}” does not exist in this test. Add it on the test’s page, or fix the name.`;
    case 'missing_topic': return 'The topic is empty.';
    case 'unknown_topic': return `Topic “${arg}” does not exist in this test’s category. Add it under Categories and topics, or fix the name.`;
    case 'missing_stem': return 'The question text is missing or too short (at least 5 characters).';
    case 'explanation_too_short': return 'The explanation is missing or too short (at least 10 characters).';
    case 'needs_at_least_two_options': return 'A question needs at least two options (A and B).';
    case 'options_must_be_consecutive_from_A': return 'Options must run A, B, C… with no gap. Fill the missing letter or move the later options up.';
    case 'missing_correct': return 'No correct answer is given. Use a letter such as B, or A;C for several.';
    case 'correct_not_an_option': return `The correct answer (${arg.replace(/;/g, ', ')}) is not one of the options that has text.`;
    case 'invalid_marks': return 'Marks must be a number above 0 and at most 20, or empty for 1.';
    case 'invalid_difficulty': return `Difficulty “${arg}” is not allowed. Use foundation, standard or challenging.`;
    case 'invalid_scoring': return 'Scoring must be all_or_nothing or partial.';
    case 'invalid_choose': return 'The “choose” number must be a whole number from the count of correct answers up to the number of options.';
    case 'duplicate_question': return 'This question text is already in the test, or appears twice in the file.';
    default: return 'This row has a problem. Check it against the format help.';
  }
}

/** Why the whole file was refused before any row was read. */
export function fileErrorWords(code: string): string {
  if (code === 'file_too_large') return 'The file is larger than 1 MB. Split it into smaller files.';
  if (code === 'no_rows') return 'The file has no question rows. It needs a header row and at least one question.';
  if (code === 'too_many_rows') return `The file has more than ${MAX_ROWS} rows. Split it into smaller files.`;
  if (code.startsWith('missing_columns')) return 'Some columns are missing. Match them to your file’s columns to continue.';
  return 'The file could not be checked. Try again.';
}

export type ImportFailure =
  | { kind: 'mapping'; headers: string[]; missing: string[] }
  | { kind: 'file'; message: string };

/** What a refused import call means for the screen: ask to match columns, or show the reason. */
export function readImportFailure(e: unknown): ImportFailure {
  if (isApiError(e)) {
    if (e.code.startsWith('missing_columns')) {
      const headers = Array.isArray(e.details.headers) ? (e.details.headers as string[]) : [];
      const fromBody = Array.isArray(e.details.missingColumns) ? (e.details.missingColumns as string[]) : null;
      const missing = fromBody ?? e.code.split(':')[1]?.split(',').filter(Boolean) ?? [];
      return { kind: 'mapping', headers, missing };
    }
    if (e.status === 0) return { kind: 'file', message: 'Could not reach the server. Nothing was imported; try again.' };
    if (e.code === 'admin_forbidden') return { kind: 'file', message: 'Your role does not allow importing questions.' };
    if (e.code === 'mock_test_not_found') return { kind: 'file', message: 'That mock test no longer exists.' };
    return { kind: 'file', message: fileErrorWords(e.code) };
  }
  return { kind: 'file', message: 'Something went wrong. Nothing was imported; try again.' };
}

export interface LocalFileCheck { ok: boolean; message?: string }
/** A quick look before sending: a CSV, not empty, under the size limit. The API checks again. */
export function checkFile(file: { name: string; size: number }): LocalFileCheck {
  if (!/\.csv$/i.test(file.name)) return { ok: false, message: 'Choose a .csv file. In Excel or Sheets use Save as, then CSV.' };
  if (file.size === 0) return { ok: false, message: 'The file is empty.' };
  if (file.size > MAX_BYTES) return { ok: false, message: 'The file is larger than 1 MB. Split it into smaller files.' };
  return { ok: true };
}

/** Roughly how many question rows a CSV text has (line breaks inside quotes are not counted twice). */
export function countRows(text: string): number {
  let rows = 0;
  let quoted = false;
  let line = '';
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (line.trim()) rows++;
      line = '';
    } else line += ch;
  }
  if (line.trim()) rows++;
  return Math.max(0, rows - 1);
}

/** Only the logical columns the person matched to a header of their file. */
export function buildColumnMap(selection: Partial<Record<string, string>>): ColumnMap {
  const out: ColumnMap = {};
  for (const [k, v] of Object.entries(selection)) if (v) out[k as ImportColumn] = v;
  return out;
}

/** True when every missing column has a header chosen (so the file can be checked again). */
export const mappingComplete = (missing: string[], selection: Partial<Record<string, string>>) => missing.every((m) => !!selection[m]);

/** Splits `errors` of a report into groups per row for the phone cards. */
export function groupByRow(problems: ImportRowProblem[]): { row: number; items: ImportRowProblem[] }[] {
  const map = new Map<number, ImportRowProblem[]>();
  for (const p of problems) map.set(p.row, [...(map.get(p.row) ?? []), p]);
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([row, items]) => ({ row, items }));
}

/** Offers text as a downloaded file (the template, the error file). */
export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The plain-language help of the format, in the order columns appear in the template. */
export const FORMAT_HELP: { name: string; required: boolean; help: string }[] = [
  { name: 'section', required: true, help: 'The name of a section that already exists in the chosen test.' },
  { name: 'topic', required: true, help: 'The name of a topic of the test’s category (topics drive the weak-area results).' },
  { name: 'stem', required: true, help: 'The question text.' },
  { name: 'option_a, option_b …', required: true, help: 'Answer options, from A. At least A and B; up to F. No gaps: C cannot be filled when B is empty.' },
  { name: 'correct', required: true, help: 'A letter such as B. For several correct answers write A;C.' },
  { name: 'explanation', required: true, help: 'Why the answer is right, shown to candidates after the test.' },
  { name: 'marks', required: false, help: 'Marks for the question. Empty means 1.' },
  { name: 'difficulty', required: false, help: 'foundation, standard or challenging. Empty means standard.' },
  { name: 'scoring', required: false, help: 'For several correct answers: all_or_nothing (default) or partial.' },
  { name: 'choose', required: false, help: 'For several correct answers: how many a candidate may pick.' },
];
