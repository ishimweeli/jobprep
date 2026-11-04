import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import { buildCaseBody, completeness, copyOf, describeCaseError, emptyCaseForm, emptyTable, isCaseDirty, toCaseForm, validateCase, type CaseForm } from './caseForm';

const source: CaseForm = {
  title: 'Mwalimu Primary budget',
  passage: ['The school received a grant.', 'Spending is shown below.'],
  tables: [{ caption: 'Budget', rows: [{ label: 'Item', value: 'RWF', heading: true }, { label: 'Books', value: '1,000' }] }],
  notes: ['All amounts are in RWF.'],
};

describe('case study form model', () => {
  it('starts with one empty paragraph and no tables', () => {
    expect(emptyCaseForm()).toEqual({ title: '', passage: [''], tables: [], notes: [] });
    expect(emptyTable().rows[0]?.heading).toBe(true);
  });

  it('validates with the API limits', () => {
    expect(validateCase(emptyCaseForm())).toMatchObject({ title: expect.any(String), passage: expect.any(String) });
    expect(validateCase(source)).toEqual({});
    expect(validateCase({ ...source, tables: Array.from({ length: 7 }, () => source.tables[0]!) }).tables).toMatch(/at most 6/);
    expect(validateCase({ ...source, tables: [{ caption: 'x', rows: [{ label: '', value: '1' }] }] }).tables).toMatch(/Table 1 needs/);
    expect(validateCase({ ...source, tables: [{ caption: 'x', rows: [{ label: 'a', value: 'v'.repeat(101) }] }] }).tables).toMatch(/values 100/);
    expect(validateCase({ ...source, passage: ['x'.repeat(3001)] }).passage).toMatch(/3000/);
    expect(validateCase({ ...source, notes: Array(21).fill('n') }).notes).toMatch(/at most 20/);
  });

  it('builds the body: blank paragraphs, notes and rows dropped, empty values left out', () => {
    const body = buildCaseBody({
      title: '  Title  ', passage: [' a ', '', 'b'], notes: ['', 'n'],
      tables: [{ caption: ' Cap ', rows: [{ label: 'Head', value: '', heading: true }, { label: '', value: '5' }, { label: 'Row', value: ' 7 ' }] }],
    });
    expect(body).toEqual({ title: 'Title', passage: ['a', 'b'], notes: ['n'], tables: [{ caption: 'Cap', rows: [{ label: 'Head', heading: true }, { label: 'Row', value: '7' }] }] });
  });

  it('dirty only for real changes', () => {
    const a = toCaseForm(source);
    expect(isCaseDirty(a, { ...a, passage: [...a.passage, ''] })).toBe(false);
    expect(isCaseDirty(a, { ...a, title: 'New title here' })).toBe(true);
  });

  it('translation completeness: missing, partly translated, complete', () => {
    expect(completeness(source, undefined)).toBe('missing');
    expect(completeness(source, { title: '', passage: [''], tables: [], notes: [] })).toBe('missing');
    expect(completeness(source, { ...copyOf(source), notes: [] })).toBe('partial');
    expect(completeness(source, { ...copyOf(source), title: '' })).toBe('partial');
    expect(completeness(source, copyOf(source))).toBe('complete');
  });

  it('copying the English text starts a translation without sharing arrays', () => {
    const c = copyOf(source);
    c.passage[0] = 'changed';
    expect(source.passage[0]).toBe('The school received a grant.');
  });

  it('refusals in words', () => {
    expect(describeCaseError(new ApiError(409, 'case_in_use'))).toMatch(/Questions still use/);
    expect(describeCaseError(new ApiError(400, 'exactly_one_correct_answer'))).toMatch(/multiple-select/);
    expect(describeCaseError(new ApiError(500, 'internal_error'))).not.toMatch(/internal_error/);
  });
});
