import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { catalogKeys, listJobs } from '../../api/catalog';
import { toApiQuery, type CatalogFilters } from '../../lib/catalogFilters';

/** How many jobs one catalog page shows; testers found 7 crowded. */
export const JOB_PAGE_SIZE = 5;

/** One page of job-grouped results for the current URL filters. The previous page stays on screen while the next one loads. */
export function useJobCatalog(slug: string, filters: CatalogFilters) {
  const query = { ...toApiQuery(filters), pageSize: JOB_PAGE_SIZE };
  return useQuery({
    queryKey: catalogKeys.jobList(slug, query),
    queryFn: () => listJobs(slug, query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
