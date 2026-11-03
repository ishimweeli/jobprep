import { formatCount } from './format';

/** The 14-day chart's numbers: bar heights as a percentage of the tallest value of either series, and the spoken summary. */

export function barHeights(signups: number[], payments: number[]): { s: string; p: string }[] {
  const max = Math.max(1, ...signups, ...payments);
  const pct = (v: number) => `${Math.round((v / max) * 100)}%`;
  return signups.map((v, i) => ({ s: pct(v), p: pct(payments[i] ?? 0) }));
}

export type Trend = 'rising' | 'falling' | 'level';

/** Compare the last third of the days with the first third (by the sum of both series). */
export function trendOf(signups: number[], payments: number[]): Trend {
  const n = Math.min(signups.length, payments.length);
  if (n < 3) return 'level';
  const k = Math.max(1, Math.floor(n / 3));
  const sum = (from: number, to: number) => {
    let t = 0;
    for (let i = from; i < to; i++) t += (signups[i] ?? 0) + (payments[i] ?? 0);
    return t;
  };
  const first = sum(0, k);
  const last = sum(n - k, n);
  if (last > first * 1.1) return 'rising';
  if (last < first * 0.9) return 'falling';
  return 'level';
}

const range = (a: number[]) => (a.length === 0 ? '0 to 0' : `${formatCount(Math.min(...a))} to ${formatCount(Math.max(...a))}`);

/**
 * The text read out for the chart (`role="img"`), built from the real numbers:
 * "Daily sign-ups ranged from 48 to 131 and payments from 11 to 39 over the last 14 days, rising towards the end."
 */
export function chartSummary(signups: number[], payments: number[]): string {
  const days = Math.max(signups.length, payments.length);
  const t = trendOf(signups, payments);
  const tail = t === 'rising' ? ', rising towards the end' : t === 'falling' ? ', falling towards the end' : ', staying level';
  return `Daily sign-ups ranged from ${range(signups)} and payments from ${range(payments)} over the last ${days} days${tail}.`;
}
