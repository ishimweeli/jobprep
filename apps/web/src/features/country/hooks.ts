import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { countriesKeys, getCountry, listCountries } from '../../api/countries';
import type { CountrySummary } from '../../api/types';
import { getStoredCountry } from '../../lib/country';
import { useSession } from '../auth/session';

const STATUS_ORDER: Record<string, number> = { LIVE: 0, PREPARING: 1, PLANNED: 2 };

/** Live countries first, then preparing, then planned (the API returns them alphabetically). */
export function sortCountries<T extends Pick<CountrySummary, 'status' | 'name'>>(list: T[]): T[] {
  return [...list].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));
}

export function useCountries() {
  return useQuery({ queryKey: countriesKeys.all, queryFn: listCountries, staleTime: 5 * 60_000, select: sortCountries });
}

export function useCountryDetail(slug: string | undefined) {
  return useQuery({
    queryKey: countriesKeys.detail(slug ?? ''),
    queryFn: () => getCountry(slug!),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });
}

/**
 * The country the page is scoped to (lowercase slug): the `/:country` URL segment on country pages,
 * otherwise the signed-in user's country, the last-used country, or Rwanda (the only live country).
 */
export function useActiveCountrySlug(): string {
  const params = useParams();
  const { user } = useSession();
  return (params.country ?? user?.countryCode.toLowerCase() ?? getStoredCountry() ?? 'rw').toLowerCase();
}

export function useActiveCountry(): { slug: string; country: CountrySummary | undefined } {
  const slug = useActiveCountrySlug();
  const { data } = useCountries();
  return { slug, country: data?.find((c) => c.slug === slug) };
}

/** `/rw/tests` for `countryPath('rw', 'tests')`. */
export function countryPath(slug: string, ...parts: string[]): string {
  return ['', slug.toLowerCase(), ...parts].join('/').replace(/\/+$/, '') || '/';
}
