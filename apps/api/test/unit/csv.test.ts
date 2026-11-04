import { describe, expect, it } from 'vitest';
import { parseCsv, validateQuestionCsv, CSV_LIMITS } from '../../src/admin/csv';

describe('parseCsv', () => {
  it('splits rows and fields, tolerating CRLF, blank lines and a BOM', () => {
    expect(parseCsv('﻿a,b,c\r\n1,2,3\r\n\r\n4,5,6\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']]);
  });
  it('handles quoted fields: commas, escaped quotes and line breaks inside quotes', () => {
    expect(parseCsv('stem,note\n"Find x, if 2x = 4","He said ""hi"""\n"line one\nline two",end')).toEqual([
      ['stem', 'note'], ['Find x, if 2x = 4', 'He said "hi"'], ['line one\nline two', 'end'],
    ]);
  });
  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n,b,')).toEqual([['a', '', 'c'], ['', 'b', '']]);
    expect(parseCsv('a,b\n,,\nc,d')).toEqual([['a', 'b'], ['c', 'd']]); // a row with nothing in it is a blank line
  });
  it('a quote in the middle of an unquoted field is just text', () => {
    expect(parseCsv('5" pipe,x')).toEqual([['5" pipe', 'x']]);
  });
});

const ctx = { sections: ['Algebra', 'Geometry'], topics: ['Equations', 'Angles'], existingStems: ['An existing question about triangles'] };
const header = 'section,topic,stem,option_a,option_b,option_c,option_d,correct,explanation,marks,difficulty';
const ok = 'Algebra,Equations,"What is 2 + 2?",3,4,5,6,B,Because two plus two is four,1,standard';

describe('validateQuestionCsv', () => {
  it('accepts a clean file and normalises names, answers and defaults', () => {
    const r = validateQuestionCsv(`${header}\n${ok}\nalgebra,equations,What is 3 + 3?,5,6,,,b,Three plus three is six.,,`, ctx);
    if ('fatal' in r) throw new Error(r.fatal);
    expect(r.problems).toEqual([]);
    expect(r.valid).toHaveLength(2);
    expect(r.valid[1]).toMatchObject({ section: 'Algebra', topic: 'Equations', correct: ['B'], marks: 1, difficulty: 'STANDARD' });
    expect(r.valid[1]!.options.map((o) => o.key)).toEqual(['A', 'B']);
  });

  it('detects multiple-select from several correct letters, with scoring and choose', () => {
    const csv = `${header},scoring,choose\nAlgebra,Equations,Pick the primes,2,4,5,9,A;C,2 and 5 are prime numbers.,2,foundation,partial,3`;
    const r = validateQuestionCsv(csv, ctx);
    if ('fatal' in r) throw new Error(r.fatal);
    expect(r.valid[0]).toMatchObject({ correct: ['A', 'C'], scoring: 'PARTIAL', choose: 3, difficulty: 'FOUNDATION', marks: 2 });
  });

  it('reports each problem with its row and column, and keeps valid rows valid', () => {
    const csv = [
      header, ok,
      'Calculus,Equations,Unknown section here,1,2,3,4,A,Long enough explanation.,1,',
      'Algebra,Trigonometry,Unknown topic here,1,2,3,4,A,Long enough explanation.,1,',
      'Algebra,Equations,No correct answer,1,2,3,4,,Long enough explanation.,1,',
      'Algebra,Equations,Correct not an option,1,2,,,D,Long enough explanation.,1,',
      'Algebra,Equations,Gap in options,1,2,,4,A,Long enough explanation.,1,',
      'Algebra,Equations,Only one option,1,,,,A,Long enough explanation.,1,',
      'Algebra,Equations,Bad marks here,1,2,3,4,A,Long enough explanation.,-2,',
      'Algebra,Equations,Bad difficulty here,1,2,3,4,A,Long enough explanation.,1,impossible',
      'Algebra,Equations,Short explanation,1,2,3,4,A,short,1,',
      'Algebra,Equations,An existing question about triangles,1,2,3,4,A,Long enough explanation.,1,',
    ].join('\n');
    const r = validateQuestionCsv(csv, ctx);
    if ('fatal' in r) throw new Error(r.fatal);
    expect(r.valid).toHaveLength(1);
    expect(r.invalidRows).toBe(10);
    const by = Object.fromEntries(r.problems.map((p) => [p.row, `${p.column}:${p.problem}`]));
    expect(by[3]).toBe('section:unknown_section:Calculus');
    expect(by[4]).toBe('topic:unknown_topic:Trigonometry');
    expect(by[5]).toBe('correct:missing_correct');
    expect(by[6]).toBe('correct:correct_not_an_option:D');
    expect(by[7]).toBe('options:options_must_be_consecutive_from_A');
    expect(by[8]).toBe('option_b:needs_at_least_two_options');
    expect(by[9]).toBe('marks:invalid_marks');
    expect(by[10]).toBe('difficulty:invalid_difficulty:impossible');
    expect(by[11]).toBe('explanation:explanation_too_short');
    expect(by[12]).toBe('stem:duplicate_question');
  });

  it('flags duplicates inside the file itself, and a "choose" that cannot work', () => {
    const csv = `${header},choose\n${ok},\n${ok},\nAlgebra,Equations,Pick primes,2,4,5,9,A;C,Because 2 and 5 are prime.,1,,1`;
    const r = validateQuestionCsv(csv, ctx);
    if ('fatal' in r) throw new Error(r.fatal);
    expect(r.problems.map((p) => p.problem)).toEqual(['duplicate_question', 'invalid_choose']);
    expect(r.valid).toHaveLength(1);
  });

  it('stops early on a missing column, an empty file, or a file that is too big', () => {
    expect(validateQuestionCsv('section,topic,stem\nA,B,C', ctx)).toEqual({
      fatal: 'missing_columns:option_a,option_b,correct,explanation', headers: ['section', 'topic', 'stem'], missingColumns: ['option_a', 'option_b', 'correct', 'explanation'],
    });
    expect(validateQuestionCsv(header, ctx)).toEqual({ fatal: 'no_rows' });
    expect(validateQuestionCsv('x'.repeat(CSV_LIMITS.maxBytes + 1), ctx)).toEqual({ fatal: 'file_too_large' });
    const many = [header, ...Array.from({ length: CSV_LIMITS.maxRows + 1 }, () => ok)].join('\n');
    expect(validateQuestionCsv(many, ctx)).toEqual({ fatal: 'too_many_rows' });
  });
});
