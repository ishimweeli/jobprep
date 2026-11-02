import { describe, expect, it } from 'vitest';
import { cardKindFor, exampleNumber, invalidNumberMessage, otherProvider, resultCard, type ResultContext } from './checkoutResults';

const ctx: ResultContext = {
  providerLabel: 'MTN MoMo', otherProviderLabel: 'Airtel Money', phone: '+250 788 123 456', countryName: 'Rwanda', accessUntil: '24 Nov 2026', planDays: 30,
};

describe('checkout edge states (CheckoutStates.dc)', () => {
  it('declined: names the operator, offers the other one, and says nobody was charged', () => {
    const c = resultCard('declined', ctx);
    expect(c.title).toBe('Payment declined');
    expect(c.body).toBe('MTN MoMo declined the request. This can happen if the PIN was wrong or the balance was too low.');
    expect(c.notCharged).toBe(true);
    expect(c.cta).toEqual({ label: 'Try again', action: 'tryAgain' });
    expect(c.alt).toEqual({ label: 'Pay with Airtel Money instead', action: 'payOther' });
  });
  it('expired: the number the prompt went to, a new prompt or a different number', () => {
    const c = resultCard('expired', ctx);
    expect(c.title).toBe('The request expired');
    expect(c.body).toBe('The prompt on +250 788 123 456 was not approved in time, so we cancelled it.');
    expect(c.cta.label).toBe('Send a new prompt');
    expect(c.alt?.label).toBe('Use a different number');
    expect(c.notCharged).toBe(true);
  });
  it('provider unavailable (502): says nobody was charged and offers the other operator', () => {
    const c = resultCard('provider_unavailable', ctx);
    expect(c.title).toBe('MTN MoMo is not responding');
    expect(c.body).toBe('We could not reach MTN MoMo just now. Try again in a few minutes, or pay with Airtel Money.');
    expect(c.notCharged).toBe(true);
    expect(c.cta).toEqual({ label: 'Pay with Airtel Money', action: 'payOther' });
    expect(c.alt).toEqual({ label: 'Try MTN MoMo again', action: 'tryProviderAgain' });
  });
  it('with only one operator there is nothing to switch to', () => {
    const c = resultCard('provider_unavailable', { ...ctx, otherProviderLabel: null });
    expect(c.body).toBe('We could not reach MTN MoMo just now. Try again in a few minutes.');
    expect(c.cta.action).toBe('tryProviderAgain');
    expect(c.alt).toBeNull();
    expect(resultCard('declined', { ...ctx, otherProviderLabel: null }).alt).toBeNull();
  });
  it('still waiting: no "charged" claim either way, and no support number (there is none yet)', () => {
    const c = resultCard('waiting', ctx);
    expect(c.title).toBe('Still waiting for confirmation');
    expect(c.notCharged).toBe(false);
    expect(c.body).not.toMatch(/\[|SUPPORT/);
    expect(c.cta.label).toBe('Check again');
    expect(c.alt?.label).toBe('Go to my dashboard');
  });
  it('already has access: the end date and the days from the plan', () => {
    const c = resultCard('already_has_access', ctx);
    expect(c.title).toBe('You already have Full Access');
    expect(c.body).toBe('Your Rwanda Full Access runs until 24 Nov 2026, so there is nothing to pay. You can add 30 more days from your dashboard when it is close to ending.');
    expect(c.notCharged).toBe(false);
    expect(c.cta.label).toBe('Start a mock test');
  });
  it('every failure says "You were not charged"', () => {
    for (const k of ['declined', 'expired', 'provider_unavailable'] as const) expect(resultCard(k, ctx).notCharged).toBe(true);
  });
  it('which payment statuses get which card (FAILED keeps the older "Payment not completed")', () => {
    expect(cardKindFor('DECLINED')).toBe('declined');
    expect(cardKindFor('EXPIRED')).toBe('expired');
    expect(cardKindFor('FAILED')).toBeNull();
    expect(cardKindFor('PENDING')).toBeNull();
  });
  it('other provider and the invalid-number message', () => {
    expect(otherProvider([{ provider: 'MTN_MOMO' }, { provider: 'AIRTEL_MONEY' }], 'MTN_MOMO')).toEqual({ provider: 'AIRTEL_MONEY' });
    expect(otherProvider([{ provider: 'MPESA' }], 'MPESA')).toBeNull();
    expect(invalidNumberMessage('Rwanda', exampleNumber('RW'))).toBe('Enter a 9-digit Rwanda number, like 788 123 456.');
  });
});
