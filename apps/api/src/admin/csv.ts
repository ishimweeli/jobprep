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
}

export function validateQuestionCsv(text: string, ctx: ImportContext): ImportReport | { fatal: string } {
  if (Buffer.byteLength(text) > CSV_LIMITS.maxBytes) return { fatal: 'file_too_large' };
  const table = parseCsv(text);
  if (table.length < 2) return { fatal: 'no_rows' };
  if (table.length - 1 > CSV_LIMITS.maxRows) return { fatal: 'too_many_rows' };

  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const missing = ['section', 'topic', 'stem', 'option_a', 'option_b', 'correct', 'explanation'].filter((c) => col(c) < 0);
  if (missing.length > 0) return { fatal: `missing_columns:${missing.join(',')}` };

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

  return { totalRows: table.length - 1, valid, problems, invalidRows: bad.size };
}
