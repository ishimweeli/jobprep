import type { CountrySummary } from '../api/types';
import { readStorage, writeStorage } from './storage';

export const COUNTRY_KEY = 'jobprep.country';
export const LANGUAGE_KEY = 'jobprep.language';

/** URL slug (lowercase) of the last-used country, if it still looks valid. */
export function getStoredCountry(): string | null {
  const v = readStorage(COUNTRY_KEY);
  return v && /^[a-z]{2}$/.test(v) ? v : null;
}

export function setStoredCountry(slug: string): void {
  writeStorage(COUNTRY_KEY, slug.toLowerCase());
}

/** Region from the browser language (en-RW -> rw); a hint only, never trusted over storage. */
export function browserRegion(lang: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.language): string | null {
  const m = lang?.match(/-([A-Za-z]{2})$/);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/**
 * Where `/` should go: the last-used country, else the browser's region when it is a live country,
 * else the first live country. Non-live countries are never auto-selected.
 */
export function resolveInitialCountry(
  countries: Pick<CountrySummary, 'slug' | 'status'>[],
  stored: string | null = getStoredCountry(),
  region: string | null = browserRegion(),
): string | null {
  const live = countries.filter((c) => c.status === 'LIVE').map((c) => c.slug);
  if (stored && live.includes(stored)) return stored;
  if (region && live.includes(region)) return region;
  return live[0] ?? null;
}
