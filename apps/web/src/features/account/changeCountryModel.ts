import type { CountrySummary } from '../../api/types';

/** Pure rules of Change exam country (ChangeCountry.dc). Unit-tested. */

/**
 * The country the radio list starts on: `?to=` when it is a live country other than the current one, otherwise the first
 * other live country (the artboard starts on Kenya), otherwise the current country (then "Choose a different country" is disabled).
 */
export function defaultNewCountry(countries: Pick<CountrySummary, 'code' | 'status' | 'selectable'>[], ownCode: string, to: string | null | undefined): string {
  const live = countries.filter((c) => c.status === 'LIVE' && c.selectable && c.code !== ownCode.toUpperCase());
  const wanted = to?.toUpperCase();
  return live.find((c) => c.code === wanted)?.code ?? live[0]?.code ?? ownCode.toUpperCase();
}

/**
 * The three "If you switch to Kenya" lines. Prices and payment methods are the new country's, the access line only shows
 * when there is access running, and the last line says the job goal is cleared.
 */
export function changeCountryBullets(input: { from: string; to: string; currency: string; methods: string[]; accessDaysLeft: number | null }): string[] {
  const { from, to, currency, methods, accessDaysLeft } = input;
  const lines = [`You’ll see only ${to} mock tests, prices in ${currency}${methods.length > 0 ? ` and ${methods.join(' or ')}` : ''}.`];
  if (accessDaysLeft !== null) {
    lines.push(
      `Your ${from} Full Access (${accessDaysLeft} ${accessDaysLeft === 1 ? 'day' : 'days'} left) only covers ${from} tests. It keeps running and is there if you switch back.`,
    );
  }
  lines.push(`Your ${from} results stay in your history. Your job goal is cleared, so you’ll choose one for ${to} next.`);
  return lines;
}
