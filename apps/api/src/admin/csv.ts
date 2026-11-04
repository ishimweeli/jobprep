/**
 * Question CSV import. Columns (header row required, any order, case-insensitive):
 *   section, topic, stem, option_a … option_f (at least a and b), correct, explanation,
 *   and optionally marks, difficulty (foundation|standard|challenging), scoring (all_or_nothing|partial), choose.
 * `correct` is one letter ("B") for a single answer, or several separated by ";" or "," ("A;C") for multiple-select.
 */

/** RFC 4180-style parser: quoted fields, "" escapes, commas and line breaks inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export const CSV_LIMITS = { maxBytes: 1_000_000, maxRows: 1000 };
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const DIFFICULTIES = ['FOUNDATION', 'STANDARD', 'CHALLENGING'] as const;

export interface ParsedQuestionRow {
  row: number; // 1-based line in the sheet (header = 1)
  section: string;
  topic: string;
  stem: string;
  options: { key: string; text: string }[];
  correct: string[];
  explanation: string;
  marks: number;
  difficulty: (typeof DIFFICULTIES)[number];
  scoring?: 'ALL_OR_NOTHING' | 'PARTIAL';
  choose?: number;
}
export interface RowProblem { row: number; column?: string; problem: string }

export interface ImportContext {
  sections: string[]; // names present in the test
  topics: string[]; // names present in the test's category
  existingStems: string[];
}

export interface ImportReport {
  totalRows: number;
  valid: ParsedQuestionRow[];
  problems: RowProblem[];
  /** Rows that have at least one problem. */
  invalidRows: number;
  /** The file's own header row (for the column-mapping step). */
  headers: string[];
  /** CSV text of the rows that had problems, with a final "problems" column ('' when there are none). */
  errorCsv: string;
}

/** Logical column -> the header text used in the uploaded file (anything not mapped keeps its own name). */
export type ColumnMap = Partial<Record<string, string>>;

/** The columns an import understands, with the help text the CSV-format screen shows. */
export const IMPORT_COLUMNS: { name: string; required: boolean; help: string }[] = [
  { name: 'section', required: true, help: 'Name of a section that already exists in this mock test' },
  { name: 'topic', required: true, help: 'Name of a topic that already exists in the test category (used for weak-area results)' },
  { name: 'stem', required: true, help: 'The question text' },
  { name: 'option_a', required: true, help: 'First answer option' },
  { name: 'option_b', required: true, help: 'Second answer option (option_c to option_f are optional, with no gaps)' },
  { name: 'option_c', required: false, help: 'Third answer option' },
  { name: 'option_d', required: false, help: 'Fourth answer option' },
  { name: 'correct', required: true, help: 'One letter (B) for a single answer, or several separated by ; (A;C) for multiple-select' },
  { name: 'explanation', required: true, help: 'Why the answer is right (at least 10 characters)' },
  { name: 'marks', required: false, help: 'Marks for the question (default 1)' },
  { name: 'difficulty', required: false, help: 'foundation, standard or challenging (default standard)' },
  { name: 'scoring', required: false, help: 'Multiple-select only: all_or_nothing (default) or partial' },
  { name: 'choose', required: false, help: 'Multiple-select only: how many options a candidate may pick' },
];

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** The example row of the template download. */
export function importTemplateCsv(): string {
  return toCsv([
    ['section', 'topic', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation', 'marks', 'difficulty'],
    ['Algebra', 'Linear equations', 'Solve 2x + 3 = 11.', 'x = 3', 'x = 4', 'x = 5', 'x = 7', 'B', 'Subtract 3 from both sides, then divide by 2.', '1', 'standard'],
  ]);
}

export function validateQuestionCsv(
  text: string, ctx: ImportContext, columnMap: ColumnMap = {},
): ImportReport | { fatal: string; headers?: string[]; missingColumns?: string[] } {
  if (Buffer.byteLength(text) > CSV_LIMITS.maxBytes) return { fatal: 'file_too_large' };
  const table = parseCsv(text);
  if (table.length < 2) return { fatal: 'no_rows' };
  if (table.length - 1 > CSV_LIMITS.maxRows) return { fatal: 'too_many_rows' };

  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const mapped = (name: string) => (columnMap[name] ?? name).trim().toLowerCase();
  const col = (name: string) => header.indexOf(mapped(name));
  const missing = ['section', 'topic', 'stem', 'option_a', 'option_b', 'correct', 'explanation'].filter((c) => col(c) < 0);
  if (missing.length > 0) return { fatal: `missing_columns:${missing.join(',')}`, headers: table[0]!.map((h) => h.trim()), missingColumns: missing };

  const sections = new Map(ctx.sections.map((s) => [s.trim().toLowerCase(), s]));
  const topics = new Map(ctx.topics.map((s) => [s.trim().toLowerCase(), s]));
  const seen = new Set(ctx.existingStems.map((s) => s.trim().toLowerCase()));
  const valid: ParsedQuestionRow[] = [];
  const problems: RowProblem[] = [];
  const bad = new Set<number>();

  table.slice(1).forEach((cells, idx) => {
    const row = idx + 2;
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '');
    const fail = (column: string, problem: string) => { problems.push({ row, column, problem }); bad.add(row); };

    const section = get('section');
    const topic = get('topic');
    const stem = get('stem');
    const explanation = get('explanation');
    if (!sections.has(section.toLowerCase())) fail('section', section ? `unknown_section:${section}` : 'missing_section');
    if (!topics.has(topic.toLowerCase())) fail('topic', topic ? `unknown_topic:${topic}` : 'missing_topic');
    if (stem.length < 5) fail('stem', 'missing_stem');
    if (explanation.length < 10) fail('explanation', 'explanation_too_short');

    const options = KEYS.map((k) => ({ key: k, text: get(`option_${k.toLowerCase()}`) })).filter((o) => o.text !== '');
    // Options must be a gap-free run starting at A, so letters in `correct` always mean what the sheet says.
    const gapFree = options.every((o, i) => o.key === KEYS[i]);
    if (options.length < 2) fail('option_b', 'needs_at_least_two_options');
    else if (!gapFree) fail('options', 'options_must_be_consecutive_from_A');

    const correct = [...new Set(get('correct').toUpperCase().split(/[;,\s]+/).filter(Boolean))];
    if (correct.length === 0) fail('correct', 'missing_correct');
    else if (correct.some((k) => !options.some((o) => o.key === k))) fail('correct', `correct_not_an_option:${correct.join(';')}`);

    const marksText = get('marks');
    const marks = marksText === '' ? 1 : Number(marksText);
    if (!Number.isFinite(marks) || marks <= 0 || marks > 20) fail('marks', 'invalid_marks');

    const diffText = get('difficulty').toUpperCase();
    if (diffText && !(DIFFICULTIES as readonly string[]).includes(diffText)) fail('difficulty', `invalid_difficulty:${diffText.toLowerCase()}`);

    const scoringText = get('scoring').toUpperCase().replace(/[\s-]+/g, '_');
    if (scoringText && scoringText !== 'ALL_OR_NOTHING' && scoringText !== 'PARTIAL') fail('scoring', 'invalid_scoring');
    const chooseText = get('choose');
    const choose = chooseText === '' ? undefined : Number(chooseText);
    if (choose !== undefined && (!Number.isInteger(choose) || choose < Math.max(1, correct.length) || choose > options.length)) fail('choose', 'invalid_choose');

    const key = stem.toLowerCase();
    if (stem && seen.has(key)) fail('stem', 'duplicate_question');
    else if (stem) seen.add(key);

    if (!bad.has(row)) {
      valid.push({
        row, section: sections.get(section.toLowerCase())!, topic: topics.get(topic.toLowerCase())!, stem, options, correct, explanation, marks,
        difficulty: (diffText || 'STANDARD') as ParsedQuestionRow['difficulty'],
        ...(correct.length > 1 && { scoring: (scoringText || 'ALL_OR_NOTHING') as 'ALL_OR_NOTHING' | 'PARTIAL' }),
        ...(choose !== undefined && correct.length > 1 && { choose }),
      });
    }
  });

  const byRow = new Map<number, string[]>();
  for (const pr of problems) byRow.set(pr.row, [...(byRow.get(pr.row) ?? []), pr.column ? `${pr.column}: ${pr.problem}` : pr.problem]);
  const errorCsv = bad.size === 0 ? '' : toCsv([
    [...table[0]!, 'problems'],
    ...[...bad].sort((a, b) => a - b).map((row) => [...table[row - 1]!, byRow.get(row)!.join('; ')]),
  ]);
  return { totalRows: table.length - 1, valid, problems, invalidRows: bad.size, headers: table[0]!.map((h) => h.trim()), errorCsv };
}
