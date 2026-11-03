import { useQueries } from '@tanstack/react-query';
import { countriesKeys, listCategories } from '../../api/countries';
import type { CountrySummary } from '../../api/types';
import { plural } from '../../lib/format';

/** Mock tests per live country (the sum of its categories' counts), by country code. Countries not live have none to count. */
export function useTestCounts(countries: Pick<CountrySummary, 'code' | 'status' | 'selectable'>[]): Record<string, number> {
  const live = countries.filter((c) => c.status === 'LIVE' && c.selectable);
  const results = useQueries({
    queries: live.map((c) => ({
      queryKey: countriesKeys.categories(c.code),
      queryFn: () => listCategories(c.code),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const out: Record<string, number> = {};
  live.forEach((c, i) => {
    const data = results[i]?.data;
    if (data) out[c.code] = data.reduce((n, cat) => n + cat.mockTestCount, 0);
  });
  return out;
}

/** "Suggested · 90 mock tests" / "24 mock tests" / "Suggested" while the count loads (no currency beside a country). */
export function countryMeta(opts: { suggested?: boolean; count?: number }): string {
  return [opts.suggested && 'Suggested', opts.count !== undefined && plural(opts.count, 'mock test')].filter(Boolean).join(' · ');
}
