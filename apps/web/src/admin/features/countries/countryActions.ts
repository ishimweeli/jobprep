import type { ProviderStatus } from '../../api/governance';
import type { CountryPatch, ProviderMode, SupportContact } from '../../api/types';
import { formatDateTime } from '../../lib/format';

/** The country actions as a plain model (A14): price in the country's currency, provider status in words, support contact. */

/** Currencies with cents; everything else the platform sells in has no minor unit (the API stores whole francs / shillings). */
const EXPONENT: Record<string, number> = { KES: 2 };

/** Minor-unit exponent: read from the plan's own label ("KES 1,500.00" -> 2) when there is one, else by currency. */
export function exponentFor(currencyCode: string, plan?: { priceMinor: number | null; priceLabel: string | null } | null): number {
  const m = plan?.priceLabel ? /\.(\d+)\s*$/.exec(plan.priceLabel) : null;
  if (m) return m[1]!.length;
  if (plan?.priceMinor && plan.priceLabel) return 0;
  return EXPONENT[currencyCode] ?? 0;
}

export const MAX_PRICE_MINOR = 100_000_000;

/** "1500" or "1,500.50" -> minor units, or null when it is not a positive amount with the currency's decimals. */
export function parsePrice(text: string, exponent: number): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  if (frac.length > exponent) return null;
  const minor = Number(whole) * 10 ** exponent + Number(frac.padEnd(exponent, '0') || 0);
  return Number.isSafeInteger(minor) && minor >= 1 && minor <= MAX_PRICE_MINOR ? minor : null;
}

export const priceError = (text: string, exponent: number, currency: string): string | null =>
  parsePrice(text, exponent) !== null ? null : exponent === 0 ? `Enter a whole amount in ${currency}, like 2000.` : `Enter an amount in ${currency} with at most ${exponent} decimals, like 1500.00.`;

/** "Candidates who pay from now on pay RWF 2,500." */
export function priceConsequence(currency: string, text: string, exponent: number, old: string | null): string {
  const minor = parsePrice(text, exponent);
  const now = minor === null ? 'the new price' : `${currency} ${(minor / 10 ** exponent).toLocaleString('en-US', { minimumFractionDigits: exponent, maximumFractionDigits: exponent })}`;
  return `People who pay from now on pay ${now}${old ? ` instead of ${old}` : ''}. Payments already started keep the price they saw, and Full Access that is already active is never shortened.`;
}

export const MODE_CHOICES: { value: ProviderMode; label: string; help: string }[] = [
  { value: 'SANDBOX', label: 'Sandbox', help: 'Test mode: no real money moves.' },
  { value: 'LIVE', label: 'Live', help: 'Real money. Candidates can pay with this method.' },
  { value: 'DISABLED', label: 'Off', help: 'Candidates cannot choose this method.' },
];

const ADAPTER: Record<ProviderStatus['adapter'], string> = { pawapay: 'Connected through pawaPay', direct: 'Connected directly to the operator', fake: 'Built-in test provider (no real money)' };

/** The provider status without any secret: what is connected, whether credentials are set, the callback address and the last payments. */
export function providerLines(s: ProviderStatus | undefined): string[] {
  if (!s) return [];
  const when = (d: string | null, none: string) => (d ? formatDateTime(d) : none);
  return [
    ADAPTER[s.adapter],
    s.credentialsConfigured ? 'Credentials are set on the server' : s.adapter === 'fake' ? 'No credentials needed' : 'Credentials are missing: payments cannot be taken',
    `Callback address: ${s.callbackUrl}`,
    `Last payment: ${when(s.lastPaymentAt, 'none yet')}`,
    `Last successful payment: ${when(s.lastSuccessAt, 'none yet')}`,
  ];
}

/** Switching a method to Live without credentials is allowed by the API, but the screen warns first. */
export const liveWarning = (s: ProviderStatus | undefined, to: ProviderMode): string | null =>
  to === 'LIVE' && s && !s.credentialsConfigured && s.adapter !== 'fake' ? 'Credentials are not set for this method on the server, so live payments will fail until they are.' : null;

export interface ContactForm { phone: string; whatsapp: string; email: string; hours: string }
export const contactForm = (c: SupportContact | null | undefined): ContactForm => ({ phone: c?.phone ?? '', whatsapp: c?.whatsapp ?? '', email: c?.email ?? '', hours: c?.hours ?? '' });

export function contactProblems(f: ContactForm): Partial<Record<keyof ContactForm, string>> {
  const out: Partial<Record<keyof ContactForm, string>> = {};
  for (const k of Object.keys(f) as (keyof ContactForm)[]) if (f[k].trim().length > 80) out[k] = 'Keep it to 80 characters or fewer.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) out.email = 'Enter a valid email address.';
  return out;
}

/** What "Save country" sends: only what changed (the notice, the legal flag, the contact lines). `null` when nothing did. */
export function countryPatch(
  cur: { disclaimer: string; legalReviewed: boolean; contact: ContactForm },
  next: { disclaimer: string; legalReviewed: boolean; contact: ContactForm },
): CountryPatch | null {
  const patch: CountryPatch = {};
  if (next.disclaimer.trim() !== cur.disclaimer.trim()) patch.disclaimer = next.disclaimer.trim();
  if (next.legalReviewed !== cur.legalReviewed) patch.legalReviewed = next.legalReviewed;
  if ((Object.keys(next.contact) as (keyof ContactForm)[]).some((k) => next.contact[k].trim() !== cur.contact[k].trim())) {
    patch.supportContact = Object.fromEntries((Object.keys(next.contact) as (keyof ContactForm)[]).map((k) => [k, next.contact[k].trim() || null]));
  }
  return Object.keys(patch).length ? patch : null;
}

export const COUNTRY_ERRORS: Record<string, string> = {
  go_live_blocked: 'This country cannot go live yet: some items on the checklist are not done.',
  plan_not_found: 'This country has no Full Access plan to change.',
  payment_method_not_found: 'This payment method does not exist for this country.',
  country_not_found: 'That country is not available to you.',
  reason_required: 'A reason is required.',
};
