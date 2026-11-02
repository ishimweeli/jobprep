import { describe, expect, it } from 'vitest';
import { activeSheetFilterCount, applyFilterChange, EMPTY_FILTERS, filtersToSearchParams, parseFilters, toApiQuery } from './catalogFilters';

describe('catalog filters <-> query string', () => {
  it('parses every supported key', () => {
    const f = parseFilters(
      new URLSearchParams('q=accountant&category=procurement&price=free&difficulty=standard&language=en&subject=algebra&sort=recent&page=3'),
    );
    expect(f).toEqual({
      q: 'accountant',
      category: 'procurement',
      price: 'free',
      difficulty: 'STANDARD',
      language: 'en',
      subject: 'algebra',
      sort: 'recent',
      page: 3,
    });
  });

  it('ignores invalid values instead of passing them to the API', () => {
    const f = parseFilters(new URLSearchParams('price=cheap&difficulty=easy&sort=random&page=-4'));
    expect(f).toEqual(EMPTY_FILTERS);
    expect(parseFilters(new URLSearchParams('page=abc')).page).toBe(1);
  });

  it('round-trips and only writes non-default values', () => {
    const f = { ...EMPTY_FILTERS, q: ' Maths ', price: 'paid' as const, page: 2 };
    const qs = filtersToSearchParams(f).toString();
    expect(qs).toBe('q=Maths&price=paid&page=2');
    expect(parseFilters(new URLSearchParams(qs))).toMatchObject({ q: 'Maths', price: 'paid', page: 2 });
    expect(filtersToSearchParams(EMPTY_FILTERS).toString()).toBe('');
  });

  it('maps to API query params without empty values', () => {
    expect(toApiQuery({ ...EMPTY_FILTERS, q: 'x', difficulty: 'CHALLENGING' })).toMatchObject({ q: 'x', difficulty: 'CHALLENGING', category: undefined, price: undefined });
  });

  it('returns to page 1 when a filter changes, but not when only the page changes', () => {
    const on3 = { ...EMPTY_FILTERS, page: 3 };
    expect(applyFilterChange(on3, { price: 'free' }).page).toBe(1);
    expect(applyFilterChange(on3, { page: 4 }).page).toBe(4);
  });

  it('counts only the phone-sheet filters for the Filters (n) badge', () => {
    expect(activeSheetFilterCount({ ...EMPTY_FILTERS, q: 'a', category: 'b', price: 'free', subject: 's' })).toBe(2);
  });
});
