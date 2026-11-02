import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { catalogKeys, listMockTests } from '../../api/catalog';
import { toApiQuery, type CatalogFilters } from '../../lib/catalogFilters';

/** Catalog results for the current URL filters. Previous results stay on screen while the next page loads. */
export function useCatalog(slug: string, filters: CatalogFilters) {
  const query = { ...toApiQuery(filters), pageSize: 50 }; // no pagination is designed: show up to 50 results
  return useQuery({
    queryKey: catalogKeys.list(slug, query),
    queryFn: () => listMockTests(slug, query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
