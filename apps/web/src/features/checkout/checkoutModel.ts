import type { CheckoutSummary, PaymentView } from '../../api/types';
import { formatPhone, groupNational, nationalDigits } from '../../lib/phone';

/** Pure rules for the checkout screens (Checkout.dc, CheckoutKenyaPhone.dc, PayDone.dc, States.dc payment). */

export type Phase = 'form' | 'pending' | 'done' | 'failed';

/** How often the "Approve on your phone" screen asks the API. */
export const POLL_INTERVAL_MS = 3000;
/** After our own timeout a late approval is still honoured by the API, so keep looking for a while. */
export const LATE_SUCCESS_WINDOW_MS = 120_000;

/**
 * The screen follows the payment status, nothing else:
 *  PENDING -> "Approve on your phone", SUCCESSFUL -> "Payment confirmed",
 *  DECLINED / FAILED / EXPIRED -> "Payment not completed ... You were not charged."
 * No payment yet means the form. `editing` is "Use a different number" (back to the form with a payment in flight).
 */
export function phaseFor(payment: Pick<PaymentView, 'status'> | null, editing = false): Phase {
  if (!payment) return 'form';
  if (payment.status === 'SUCCESSFUL') return 'done';
  if (editing) return 'form';
  if (payment.status === 'PENDING') return 'pending';
  return 'failed';
}

/**
 * Should the poller keep asking? Always while PENDING. After EXPIRED it keeps going for `LATE_SUCCESS_WINDOW_MS`
 * (a late approval turns the screen into "Payment confirmed"). Final states stop it.
 */
export function shouldPoll(status: PaymentView['status'] | undefined, msSinceExpired: number): boolean {
  if (status === 'PENDING') return true;
  if (status === 'EXPIRED') return msSinceExpired < LATE_SUCCESS_WINDOW_MS;
  return false;
}

/** The brand colour swatch of an operator, keyed by the API's provider code. */
export const PROVIDER_SWATCH: Record<string, string> = {
  MTN_MOMO: '#FFCB05',
  AIRTEL_MONEY: '#E40000',
  MPESA: '#16A34A',
};
export const providerSwatch = (provider: string) => PROVIDER_SWATCH[provider] ?? '#CDD4DE';

/**
 * The two drawn variants of the screen, picked by the country's data: Rwanda's artboard types the whole number
 * (078 ...), Kenya's shows the dial code as a fixed chip and takes the rest.
 */
export interface CheckoutCopy {
  variant: 'national' | 'prefix';
  summaryTitle: string;
  summaryLine: string;
  note: string;
  phoneLabel: (providerLabel: string) => string;
  phoneHelp: (providerLabel: string) => string;
}

export function checkoutCopy(summary: CheckoutSummary, untilLabel: string): CheckoutCopy {
  const plan = summary.plan;
  const days = plan?.durationDays ?? 30;
  if (summary.country.code === 'RW') {
    return {
      variant: 'national',
      summaryTitle: 'JobPrep Full Access',
      summaryLine: `Every mock test, every category · ${days} days`,
      note: `Access starts once payment is confirmed · until ${untilLabel}`,
      phoneLabel: () => 'Mobile Money number',
      phoneHelp: () => 'You will approve on this phone with your PIN. We never ask for your PIN.',
    };
  }
  return {
    variant: 'prefix',
    summaryTitle: `JobPrep Full Access · ${summary.country.name}`,
    summaryLine: `Every ${summary.country.name} mock test · ${days} days`,
    note: plan?.paidOnce === false ? `Access starts once payment is confirmed · until ${untilLabel}` : 'Paid once. Nothing renews.',
    phoneLabel: (p) => `${p} phone number`,
    phoneHelp: (p) => `An ${p} prompt will appear on this phone. Enter your PIN there — we never ask for it.`,
  };
}

/** "RWF 2,000", or `null` while the country has no price: the price is left out, never replaced by a placeholder. */
export function priceText(summary: Pick<CheckoutSummary, 'plan'>): string | null {
  return summary.plan?.priceLabel ?? null;
}

/** Pay is only possible when the country has a sellable price. */
export const canPay = (summary: Pick<CheckoutSummary, 'plan'>): boolean => !!summary.plan?.checkoutAvailable && !!summary.plan.priceLabel;

/** Prefill / display of a stored number in the style of the variant: "078 812 3456" or "712 345 678". */
export function displayNumber(e164: string, dialCode: string, variant: CheckoutCopy['variant']): string {
  const national = nationalDigits(e164.startsWith('+') ? e164 : `+${e164}`, dialCode);
  if (variant === 'prefix') return groupNational(national);
  return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`.trim();
}

/** What the payer typed, as the API wants it ("+250788123456"), or null when it is not a 9-digit mobile number. */
export function toMsisdn(input: string, dialCode: string): string | null {
  const national = nationalDigits(input, dialCode);
  return /^\d{9}$/.test(national) ? `${dialCode}${national}` : null;
}

export const receiptNumber = (msisdn: string, dialCode: string, variant: CheckoutCopy['variant']) =>
  variant === 'national' ? displayNumber(msisdn, dialCode, variant) : formatPhone(msisdn, dialCode);

/** "Payment not completed" body, from the States.dc artboard. */
export function notCompletedMessage(p: Pick<PaymentView, 'status' | 'providerLabel'>): string {
  const what = p.status === 'EXPIRED' ? 'expired before it was approved' : p.status === 'DECLINED' ? 'was declined' : 'could not be completed';
  return `The ${p.providerLabel} request ${what}. You were not charged.`;
}

/** "Start Mock 1 now" from the test title, else "Start mock test". */
export function startLabel(title: string | undefined): string {
  const m = title?.match(/Mock\s+\d+/i);
  return m ? `Start ${m[0]} now` : 'Start mock test';
}
