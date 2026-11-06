import { readStorage, removeStorage, writeStorage } from './storage';

export const PREFERRED_JOB_KEY = 'jobprep.preferredJob';

/**
 * A guest's last-picked job (`tests/jobs/:slug` reads this to auto-open it, same idea as `country.ts`'s
 * last-used country). Scoped to the active country by the `Exam.slug` convention (`${country}-${profession}`),
 * so a guest's Rwanda job is ignored once they switch to Kenya — no separate per-country key needed.
 */
export function getStoredPreferredJob(countryCode: string): string | null {
  const v = readStorage(PREFERRED_JOB_KEY);
  return v && v.startsWith(`${countryCode.toLowerCase()}-`) ? v : null;
}

export function setStoredPreferredJob(jobSlug: string): void {
  writeStorage(PREFERRED_JOB_KEY, jobSlug);
}

export function clearStoredPreferredJob(): void {
  removeStorage(PREFERRED_JOB_KEY);
}
