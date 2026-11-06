import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { catalogKeys, listMockTests } from '../../api/catalog';
import type { CatalogResponse } from '../../api/types';
import { toApiQuery, type CatalogFilters } from '../../lib/catalogFilters';

export const CATALOG_PAGE_SIZE = 20;

/** The paged-list envelope shared by `CatalogResponse` and `JobCatalogResponse` — only `results`' item type differs. */
export interface PagedCatalog<T> {
  total: number;
  page: number;
  pageSize: number;
  results: T[];
  empty: boolean;
  canRequestExam: boolean;
  facets: CatalogResponse['facets'];
  hasMore?: boolean;
  nextPage?: number | null;
  totalPages?: number;
}

/** The loaded pages as one response: the first page's facets and total, every page's results in order (C31: Load more). */
export function mergePages<T>(pages: PagedCatalog<T>[]): PagedCatalog<T> | undefined {
  const first = pages[0];
  if (!first) return undefined;
  const last = pages[pages.length - 1]!;
  return { ...first, results: pages.flatMap((p) => p.results), hasMore: last.hasMore ?? last.page * last.pageSize < last.total, nextPage: last.nextPage ?? null };
}

/**
 * Catalog results for the current URL filters, one page at a time. "Load more" appends the next page; a filter change
 * starts again at page 1. Previous results stay on screen while a changed filter loads.
 */
export function useCatalog(slug: string, filters: CatalogFilters) {
  const { page: _page, ...query } = { ...toApiQuery(filters), pageSize: CATALOG_PAGE_SIZE };
  const q = useInfiniteQuery({
    queryKey: catalogKeys.list(slug, query),
    queryFn: ({ pageParam }) => listMockTests(slug, { ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ?? last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const data = q.data ? mergePages(q.data.pages) : undefined;
  return {
    data,
    isError: q.isError,
    error: q.error,
    isFetching: q.isFetching,
    refetch: q.refetch,
    hasNextPage: q.hasNextPage,
    fetchNextPage: q.fetchNextPage,
    isFetchingNextPage: q.isFetchingNextPage,
    /** Loading the next page failed (the pages already loaded stay). */
    nextPageFailed: q.isFetchNextPageError,
  };
}
