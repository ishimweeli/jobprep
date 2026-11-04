import { describe, expect, it } from 'vitest';
import { contactForm, contactProblems, countryPatch, exponentFor, liveWarning, parsePrice, priceConsequence, priceError, providerLines } from './countryActions';

describe('price in the currency of the country', () => {
  it('finds the minor-unit exponent from the plan label or the currency', () => {
    expect(exponentFor('RWF', { priceMinor: 2000, priceLabel: 'RWF 2,000' })).toBe(0);
    expect(exponentFor('KES', { priceMinor: 150000, priceLabel: 'KES 1,500.00' })).toBe(2);
    expect(exponentFor('KES', null)).toBe(2);
    expect(exponentFor('UGX', null)).toBe(0);
  });

  it('parses an amount into minor units and refuses the wrong shapes', () => {
    expect(parsePrice('2,000', 0)).toBe(2000);
    expect(parsePrice('1500.50', 2)).toBe(150050);
    expect(parsePrice('1500', 2)).toBe(150000);
    expect(parsePrice('1500.5', 0)).toBeNull();
    expect(parsePrice('0', 0)).toBeNull();
    expect(parsePrice('abc', 0)).toBeNull();
    expect(parsePrice('1000000001', 0)).toBeNull();
    expect(priceError('x', 0, 'RWF')).toMatch(/whole amount in RWF/);
    expect(priceError('2000', 0, 'RWF')).toBeNull();
  });

  it('says it applies to new payments only', () => {
    const t = priceConsequence('RWF', '2500', 0, 'RWF 2,000');
    expect(t).toContain('RWF 2,500 instead of RWF 2,000');
    expect(t).toContain('never shortened');
  });
});

describe('provider status in words, never a secret', () => {
  const s = { adapter: 'pawapay' as const, credentialsConfigured: false, callbackUrl: 'https://x.test/api/payments/callback/pawapay', lastPaymentAt: null, lastSuccessAt: '2026-11-01T10:00:00Z' };
  it('lists what is connected, credentials, callback and last payments', () => {
    const lines = providerLines(s);
    expect(lines[0]).toBe('Connected through pawaPay');
    expect(lines[1]).toBe('Credentials are missing: payments cannot be taken');
    expect(lines).toContain('Last payment: none yet');
    expect(lines.join(' ')).not.toMatch(/secret|token=/i);
    expect(providerLines(undefined)).toEqual([]);
  });
  it('warns before Live without credentials, not for the test provider', () => {
    expect(liveWarning(s, 'LIVE')).toMatch(/Credentials are not set/);
    expect(liveWarning(s, 'SANDBOX')).toBeNull();
    expect(liveWarning({ ...s, adapter: 'fake' }, 'LIVE')).toBeNull();
  });
});

describe('what Save country sends', () => {
  const cur = { disclaimer: 'JobPrep is independent.', legalReviewed: false, contact: contactForm({ phone: '0788', email: null }) };
  it('sends only what changed', () => {
    expect(countryPatch(cur, cur)).toBeNull();
    expect(countryPatch(cur, { ...cur, legalReviewed: true })).toEqual({ legalReviewed: true });
    const p = countryPatch(cur, { ...cur, contact: { ...cur.contact, email: 'help@x.test' } });
    expect(p?.supportContact).toEqual({ phone: '0788', whatsapp: null, email: 'help@x.test', hours: null });
  });
  it('checks the contact lines', () => {
    expect(contactProblems({ phone: '', whatsapp: '', email: 'nope', hours: 'x'.repeat(81) })).toEqual({ email: 'Enter a valid email address.', hours: 'Keep it to 80 characters or fewer.' });
  });
});
