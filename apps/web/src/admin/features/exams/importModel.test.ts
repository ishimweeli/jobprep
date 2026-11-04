import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import {
  buildColumnMap, checkFile, countRows, fileErrorWords, formatBytes, groupByRow, mappingComplete, problemWords, readImportFailure, stepLabel, STEPS,
} from './importModel';

describe('CSV import model', () => {
  it('has four steps with the "Step n of 4" wording', () => {
    expect(STEPS).toHaveLength(4);
    expect(stepLabel(2)).toBe('Step 2 of 4');
  });

  it('every problem code the API can report is a sentence, with its argument', () => {
    const codes = [
      'missing_section', 'unknown_section:Algebra', 'missing_topic', 'unknown_topic:Fractions', 'missing_stem', 'explanation_too_short', 'needs_at_least_two_options',
      'options_must_be_consecutive_from_A', 'missing_correct', 'correct_not_an_option:E', 'invalid_marks', 'invalid_difficulty:hard', 'invalid_scoring', 'invalid_choose', 'duplicate_question',
    ];
    for (const c of codes) {
      const w = problemWords({ problem: c });
      expect(w, c).toMatch(/[A-Za-z]{4}/);
      expect(w, c).not.toContain(c.split(':')[0]!); // never the raw code
      expect(w.endsWith('.'), c).toBe(true);
    }
    expect(problemWords({ problem: 'unknown_section:Algebra' })).toContain('“Algebra”');
    expect(problemWords({ problem: 'correct_not_an_option:A;C' })).toContain('A, C');
    expect(problemWords({ problem: 'something_new' })).toMatch(/problem/);
  });

  it('whole-file refusals', () => {
    expect(fileErrorWords('file_too_large')).toMatch(/1 MB/);
    expect(fileErrorWords('no_rows')).toMatch(/header row/);
    expect(fileErrorWords('too_many_rows')).toMatch(/1,000|1000/);
  });

  it('missing columns ask for a mapping, other refusals show a reason', () => {
    const f = readImportFailure(new ApiError(400, 'missing_columns:section,topic', { headers: ['Cat', 'Q'], missingColumns: ['section', 'topic'] }));
    expect(f).toEqual({ kind: 'mapping', headers: ['Cat', 'Q'], missing: ['section', 'topic'] });
    // an older answer without the body fields still names the columns
    expect(readImportFailure(new ApiError(400, 'missing_columns:stem', {}))).toEqual({ kind: 'mapping', headers: [], missing: ['stem'] });
    expect(readImportFailure(new ApiError(400, 'no_rows'))).toMatchObject({ kind: 'file' });
    expect(readImportFailure(new ApiError(0, 'network_error'))).toMatchObject({ kind: 'file', message: expect.stringMatching(/reach the server/) });
    expect(readImportFailure(new Error('x'))).toMatchObject({ kind: 'file' });
  });

  it('checks the file before sending it', () => {
    expect(checkFile({ name: 'q.csv', size: 1200 }).ok).toBe(true);
    expect(checkFile({ name: 'q.xlsx', size: 1200 }).message).toMatch(/\.csv/);
    expect(checkFile({ name: 'q.csv', size: 0 }).message).toMatch(/empty/);
    expect(checkFile({ name: 'Q.CSV', size: 2_000_000 }).message).toMatch(/1 MB/);
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
  });

  it('counts question rows, not line breaks inside quotes', () => {
    expect(countRows('a,b\n1,2\n3,4\n')).toBe(2);
    expect(countRows('a,b\r\n"line one\nline two",2\r\n')).toBe(1);
    expect(countRows('')).toBe(0);
    expect(countRows('a,b')).toBe(0);
  });

  it('column mapping: only chosen columns are sent, and every missing one needs a choice', () => {
    expect(buildColumnMap({ section: 'Category', topic: '', stem: 'Question' })).toEqual({ section: 'Category', stem: 'Question' });
    expect(mappingComplete(['section', 'topic'], { section: 'A' })).toBe(false);
    expect(mappingComplete(['section', 'topic'], { section: 'A', topic: 'B' })).toBe(true);
  });

  it('groups problems per row for the phone cards', () => {
    const g = groupByRow([{ row: 5, problem: 'a' }, { row: 2, problem: 'b' }, { row: 5, problem: 'c' }]);
    expect(g.map((x) => [x.row, x.items.length])).toEqual([[2, 1], [5, 2]]);
  });
});
