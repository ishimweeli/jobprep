import type { CountryRow } from '../../api/types';
import { formatCount, plural } from '../../lib/format';

/**
 * The grey line of a country card ("RWF 2,000 · 90 tests · 4,218 users", "Price not set · 24 tests in draft",
 * "No tests yet · 212 on waiting list"), built from the list's own numbers.
 */
export function countrySummary(c: CountryRow): string {
  const parts: string[] = [];
  if (c.priceLabel) parts.push(c.priceLabel);
  else if (c.status === 'PREPARING') parts.push('Price not set');
  if (c.publishedTests + c.draftTests === 0) parts.push('No tests yet');
  else if (c.status !== 'LIVE' && c.draftTests > 0) parts.push(`${plural(c.draftTests, 'test')} in draft`);
  else parts.push(plural(c.publishedTests, 'test'));
  if (c.status === 'LIVE') {
    if (c.users > 0) parts.push(plural(c.users, 'user'));
  } else if (c.waitingList > 0) parts.push(`${formatCount(c.waitingList)} on waiting list`);
  return parts.join(' · ');
}

/** Which country opens first: the one in `?country=`, else the first still preparing (as the artboard), else the first. */
export function defaultCountry(list: CountryRow[], requested?: string | null): string | undefined {
  const want = requested?.toUpperCase();
  if (want && list.some((c) => c.code === want)) return want;
  return (list.find((c) => c.status === 'PREPARING') ?? list[0])?.code;
}

/** "N tests" per category row ("1 test"). */
export const testsLabel = (n: number) => plural(n, 'test');
