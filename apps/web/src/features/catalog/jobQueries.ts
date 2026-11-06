import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { catalogKeys, listJobs } from '../../api/catalog';
import { toApiQuery, type CatalogFilters } from '../../lib/catalogFilters';
import { CATALOG_PAGE_SIZE, mergePages } from './queries';

/** Job-grouped catalog results for the current URL filters — same paging/filter plumbing as `useCatalog`. */
export function useJobCatalog(slug: string, filters: CatalogFilters) {
  const { page: _page, ...query } = { ...toApiQuery(filters), pageSize: CATALOG_PAGE_SIZE };
  const q = useInfiniteQuery({
    queryKey: catalogKeys.jobList(slug, query),
    queryFn: ({ pageParam }) => listJobs(slug, { ...query, page: pageParam }),
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
    nextPageFailed: q.isFetchNextPageError,
  };
}
