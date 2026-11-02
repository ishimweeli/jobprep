export interface PlanPrice {
  priceMinor: number | null;
  currencyCode: string;
  currencyExponent: number;
  durationDays: number;
}

/** Price must be set (and positive) before a country can sell Full Access. */
export function isSellable(plan: Pick<PlanPrice, 'priceMinor'> | null | undefined): boolean {
  return !!plan && plan.priceMinor !== null && plan.priceMinor > 0;
}

/**
 * "RWF 2,000" / "KES 1,500.50". Always prefix-style like the design. `null` price → null,
 * so callers render a placeholder instead of inventing a number.
 */
export function formatMoney(
  amountMinor: number | null,
  currencyCode: string,
  exponent: number,
): string | null {
  if (amountMinor === null) return null;
  const major = amountMinor / 10 ** exponent;
  const text = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(major);
  return `${currencyCode} ${text}`;
}

export function parseMajorToMinor(major: number, exponent: number): number {
  return Math.round(major * 10 ** exponent);
}
