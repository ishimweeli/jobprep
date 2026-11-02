import type { PaymentView } from '../../api/types';

/**
 * The checkout edge states (CheckoutStates.dc, CheckoutStatesPhone.dc) as data: icon, tone, title, body and the
 * two actions. Every failure says "You were not charged." The "number on another network" state is not here on
 * purpose: the backend has no operator-prefix rule (DECISIONS #71), so nothing can produce it.
 */
export type ResultKind = 'declined' | 'expired' | 'provider_unavailable' | 'waiting' | 'already_has_access';
export type ResultIcon = 'x' | 'clock' | 'warn' | 'hour' | 'ok';
export type ResultTone = 'red' | 'amber' | 'purple' | 'green';
export type ResultAction = 'tryAgain' | 'sendNewPrompt' | 'differentNumber' | 'payOther' | 'tryProviderAgain' | 'checkAgain' | 'dashboard';

export interface ResultCard {
  kind: ResultKind;
  icon: ResultIcon;
  tone: ResultTone;
  title: string;
  body: string;
  notCharged: boolean;
  cta: { label: string; action: ResultAction };
  alt: null | { label: string; action: ResultAction };
}

export interface ResultContext {
  providerLabel: string;
  /** Another way to pay in this country (Airtel Money when MTN failed), if there is one. */
  otherProviderLabel: string | null;
  /** The number the prompt went to, formatted for display ("+250 788 123 456"). */
  phone: string;
  countryName: string;
  /** "24 Nov 2026" */
  accessUntil: string | null;
  planDays: number | null;
}

export function resultCard(kind: ResultKind, c: ResultContext): ResultCard {
  switch (kind) {
    case 'declined':
      return {
        kind, icon: 'x', tone: 'red', notCharged: true,
        title: 'Payment declined',
        body: `${c.providerLabel} declined the request. This can happen if the PIN was wrong or the balance was too low.`,
        cta: { label: 'Try again', action: 'tryAgain' },
        alt: c.otherProviderLabel ? { label: `Pay with ${c.otherProviderLabel} instead`, action: 'payOther' } : null,
      };
    case 'expired':
      return {
        kind, icon: 'clock', tone: 'amber', notCharged: true,
        title: 'The request expired',
        body: `The prompt on ${c.phone} was not approved in time, so we cancelled it.`,
        cta: { label: 'Send a new prompt', action: 'sendNewPrompt' },
        alt: { label: 'Use a different number', action: 'differentNumber' },
      };
    case 'provider_unavailable':
      return {
        kind, icon: 'warn', tone: 'amber', notCharged: true,
        title: `${c.providerLabel} is not responding`,
        body: c.otherProviderLabel
          ? `We could not reach ${c.providerLabel} just now. Try again in a few minutes, or pay with ${c.otherProviderLabel}.`
          : `We could not reach ${c.providerLabel} just now. Try again in a few minutes.`,
        cta: c.otherProviderLabel ? { label: `Pay with ${c.otherProviderLabel}`, action: 'payOther' } : { label: 'Try again', action: 'tryProviderAgain' },
        alt: c.otherProviderLabel ? { label: `Try ${c.providerLabel} again`, action: 'tryProviderAgain' } : null,
      };
    case 'waiting':
      return {
        kind, icon: 'hour', tone: 'purple', notCharged: false,
        title: 'Still waiting for confirmation',
        // The artboard adds "If you were charged and access does not appear within 10 minutes, contact [SUPPORT PHONE]
        // with your MoMo transaction ID". There is no support number yet, so that sentence is left out.
        body: `You approved the payment, but ${c.providerLabel} has not confirmed it to us yet. This usually takes under a minute.`,
        cta: { label: 'Check again', action: 'checkAgain' },
        alt: { label: 'Go to my dashboard', action: 'dashboard' },
      };
    case 'already_has_access':
      return {
        kind, icon: 'ok', tone: 'green', notCharged: false,
        title: 'You already have Full Access',
        body: `Your ${c.countryName} Full Access runs until ${c.accessUntil ?? 'the end of your current period'}, so there is nothing to pay. You can add ${c.planDays ?? 30} more days from your dashboard when it is close to ending.`,
        cta: { label: 'Start a mock test', action: 'dashboard' },
        alt: null,
      };
  }
}

/** Which card a payment that did not succeed shows. `FAILED` keeps the older States.dc "Payment not completed" card. */
export function cardKindFor(status: PaymentView['status']): 'declined' | 'expired' | null {
  if (status === 'DECLINED') return 'declined';
  if (status === 'EXPIRED') return 'expired';
  return null;
}

/** The other payment method to offer, if the country has more than one. */
export function otherProvider<T extends { provider: string }>(methods: T[], current: string): T | null {
  return methods.find((m) => m.provider !== current) ?? null;
}

/** Inline message under the number field (CheckoutStates.dc "Invalid number"). */
export function invalidNumberMessage(countryName: string, example: string): string {
  return `Enter a 9-digit ${countryName} number, like ${example}.`;
}

const EXAMPLES: Record<string, string> = { RW: '788 123 456', KE: '712 345 678', UG: '712 345 678', TZ: '712 345 678' };
export const exampleNumber = (countryCode: string) => EXAMPLES[countryCode] ?? '712 345 678';
