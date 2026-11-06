import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogFacets, CatalogResponse, TestCard } from '../../api/types';
import { EMPTY_FILTERS, pageItems } from '../../lib/catalogFilters';
import { renderWithProviders } from '../../test/utils';
import { FilterPanel, SORT_OPTIONS } from './FilterPanel';
import { Pagination } from './Pagination';
import { mergePages } from './queries';

const card = (n: number): TestCard => ({
  id: `t${n}`, slug: `s${n}`, title: `Test ${n}`, category: { slug: 'c', name: 'C' }, profession: 'P', questionCount: 10, durationMinutes: 20, languages: ['en'],
  difficulty: 'STANDARD', isFree: true, accessTag: 'FREE', attempts: 'UNLIMITED', publishedAt: null, jobDeadlineAt: null,
});
const page = (n: number, results: TestCard[], hasMore: boolean): CatalogResponse => ({
  total: 45, page: n, pageSize: 20, results, empty: false, canRequestExam: false, hasMore, nextPage: hasMore ? n + 1 : null, totalPages: 3,
  facets: { categories: [], subjects: [], difficulties: [], languages: [] },
});

describe('catalog pagination (C31)', () => {
  it('merges loaded pages: every result in order, the first page facets and total, hasMore from the last page', () => {
    const merged = mergePages([page(1, [card(1), card(2)], true), page(2, [card(3)], false)])!;
    expect(merged.results.map((r) => r.id)).toEqual(['t1', 't2', 't3']);
    expect(merged.total).toBe(45);
    expect(merged.hasMore).toBe(false);
    expect(mergePages([])).toBeUndefined();
  });

  it('says which jobs are showing, marks the current page and moves with Previous, Next and the numbers', async () => {
    const onPage = vi.fn();
    const u = userEvent.setup();
    renderWithProviders(<Pagination page={2} pageSize={7} total={22} itemLabel="job" onPage={onPage} />);
    expect(screen.getByText('Showing 8–14 of 22 jobs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    await u.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    await u.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenLastCalledWith(1);
    await u.click(screen.getByRole('button', { name: 'Page 4' }));
    expect(onPage).toHaveBeenLastCalledWith(4);
  });

  it('Previous is off on the first page, Next on the last, and the last page counts only what is left', () => {
    const { unmount } = renderWithProviders(<Pagination page={1} pageSize={7} total={22} itemLabel="job" onPage={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    unmount();
    renderWithProviders(<Pagination page={4} pageSize={7} total={22} itemLabel="job" onPage={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Showing 22–22 of 22 jobs')).toBeInTheDocument();
  });

  it('draws nothing when every job fits on one page', () => {
    renderWithProviders(<Pagination page={1} pageSize={7} total={7} itemLabel="job" onPage={vi.fn()} />);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('page numbers: every page when few, otherwise first, last and neighbours with gaps', () => {
    expect(pageItems(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pageItems(5, 9)).toEqual([1, null, 4, 5, 6, null, 9]);
    expect(pageItems(1, 9)).toEqual([1, 2, null, 9]);
    expect(pageItems(9, 9)).toEqual([1, null, 8, 9]);
  });
});

describe('catalog filters on the phone sheet (C32)', () => {
  const facets: CatalogFacets = {
    categories: [],
    subjects: [{ slug: 'algebra', name: 'Algebra' }],
    difficulties: ['FOUNDATION', 'STANDARD'],
    languages: ['en', 'rw'],
  };

  it('the sheet carries every filter of the desktop: subject, price, difficulty, language, plus sort incl. Free first', async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    renderWithProviders(<FilterPanel filters={EMPTY_FILTERS} facets={facets} onChange={onChange} variant="sheet" idPrefix="sheet" />);
    expect(screen.getByLabelText('Subject / role')).toBeInTheDocument();
    for (const legend of ['Price', 'Difficulty', 'Language', 'Sort by']) expect(screen.getByRole('group', { name: legend })).toBeInTheDocument();
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual(['Most relevant', 'Free first', 'Newest', 'A to Z', 'Closing soon']);
    await u.click(screen.getByRole('radio', { name: 'Free first' }));
    expect(onChange).toHaveBeenCalledWith({ sort: 'free_first' });
    await u.click(screen.getByRole('radio', { name: 'Kinyarwanda' }));
    expect(onChange).toHaveBeenCalledWith({ language: 'rw' });
  });

  it('the desktop sidebar has no sort group (it is the select above the results)', () => {
    renderWithProviders(<FilterPanel filters={EMPTY_FILTERS} facets={facets} onChange={vi.fn()} variant="aside" idPrefix="f" />);
    expect(screen.queryByRole('group', { name: 'Sort by' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
  });
});
