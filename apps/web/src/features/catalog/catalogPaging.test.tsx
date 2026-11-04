import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogFacets, CatalogResponse, TestCard } from '../../api/types';
import { EMPTY_FILTERS } from '../../lib/catalogFilters';
import { renderWithProviders } from '../../test/utils';
import { LoadMore } from './CatalogPage';
import { FilterPanel, SORT_OPTIONS } from './FilterPanel';
import { mergePages } from './queries';

const card = (n: number): TestCard => ({
  id: `t${n}`, slug: `s${n}`, title: `Test ${n}`, category: { slug: 'c', name: 'C' }, profession: 'P', questionCount: 10, durationMinutes: 20, languages: ['en'],
  difficulty: 'STANDARD', isFree: true, accessTag: 'FREE', attempts: 'UNLIMITED', publishedAt: null,
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

  it('Load more shows how many are shown and asks for the next page', async () => {
    const onLoadMore = vi.fn();
    const u = userEvent.setup();
    renderWithProviders(<LoadMore total={45} shown={20} paging={{ hasNextPage: true, loadingMore: false, failed: false, onLoadMore }} />);
    expect(screen.getByText('Showing 20 of 45')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('the loading-more state disables the button and says so', () => {
    renderWithProviders(<LoadMore total={45} shown={20} paging={{ hasNextPage: true, loadingMore: true, failed: false, onLoadMore: vi.fn() }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading more mock tests…');
    expect(screen.getByRole('button', { name: 'Load more' })).toBeDisabled();
  });

  it('a failed page offers Try again and keeps what was loaded', () => {
    renderWithProviders(<LoadMore total={45} shown={20} paging={{ hasNextPage: true, loadingMore: false, failed: true, onLoadMore: vi.fn() }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load more mock tests.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('the end of the list says so only after more than one page; a single page says nothing', () => {
    const none = { hasNextPage: false, loadingMore: false, failed: false, onLoadMore: vi.fn() };
    const { unmount } = renderWithProviders(<LoadMore total={45} shown={45} paging={none} />);
    expect(screen.getByTestId('end-of-list')).toHaveTextContent('That is all 45 mock tests.');
    unmount();
    renderWithProviders(<LoadMore total={12} shown={12} paging={none} />);
    expect(screen.queryByTestId('end-of-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('load-more')).not.toBeInTheDocument();
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
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual(['Most relevant', 'Free first', 'Newest', 'A to Z']);
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
