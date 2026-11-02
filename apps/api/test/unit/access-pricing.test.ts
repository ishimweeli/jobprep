import { describe, expect, it } from 'vitest';
import {
  activeGrantFor, canStartMockTest, daysLeft, nextGrantWindow, type GrantLike,
} from '../../src/domain/access';
import { formatMoney, isSellable, parseMajorToMinor } from '../../src/domain/pricing';
import { normalizePhone } from '../../src/domain/phone';

const now = new Date('2026-11-02T10:00:00Z');
const day = 86_400_000;
const grant = (over: Partial<GrantLike> = {}): GrantLike => ({
  countryCode: 'RW', startsAt: new Date(now.getTime() - 5 * day), endsAt: new Date(now.getTime() + 10 * day),
  status: 'ACTIVE', ...over,
});

describe('access grants', () => {
  it('is active only inside its window and while ACTIVE', () => {
    expect(activeGrantFor([grant()], 'RW', now)).not.toBeNull();
    expect(activeGrantFor([grant({ endsAt: new Date(now.getTime() - 1) })], 'RW', now)).toBeNull();
    expect(activeGrantFor([grant({ status: 'SUSPENDED' })], 'RW', now)).toBeNull();
    expect(activeGrantFor([grant({ status: 'REVOKED' })], 'RW', now)).toBeNull();
  });
  it('a Rwanda grant does not unlock Kenya', () => {
    expect(activeGrantFor([grant({ countryCode: 'RW' })], 'KE', now)).toBeNull();
  });
  it('a new purchase starts now, or extends from the current end when still active', () => {
    const fresh = nextGrantWindow([], 'RW', 30, now);
    expect(fresh.startsAt).toEqual(now);
    expect(fresh.endsAt.getTime() - now.getTime()).toBe(30 * day);

    const g = grant();
    const ext = nextGrantWindow([g], 'RW', 30, now);
    expect(ext.startsAt).toEqual(g.endsAt);
    expect(ext.endsAt.getTime() - g.endsAt.getTime()).toBe(30 * day);
  });
  it('counts days left, rounding up', () => {
    expect(daysLeft(grant({ endsAt: new Date(now.getTime() + 22.2 * day) }), now)).toBe(23);
    expect(daysLeft(grant({ endsAt: new Date(now.getTime() - day) }), now)).toBe(0);
  });
});

describe('canStartMockTest', () => {
  const free = { countryCode: 'RW', isFree: true };
  const paid = { countryCode: 'RW', isFree: false };
  it('lets anyone (guest included) start a free same-country test', () => {
    expect(canStartMockTest(free, 'RW', [], now)).toEqual({ allowed: true, reason: 'free' });
  });
  it('blocks paid tests without a same-country grant', () => {
    expect(canStartMockTest(paid, 'RW', [], now)).toEqual({ allowed: false, reason: 'needs_full_access' });
  });
  it('allows paid tests with an active grant', () => {
    expect(canStartMockTest(paid, 'RW', [grant()], now)).toEqual({ allowed: true, reason: 'full_access' });
  });
  it('never crosses countries, free or paid', () => {
    expect(canStartMockTest(free, 'KE', [], now).allowed).toBe(false);
    expect(canStartMockTest({ countryCode: 'KE', isFree: false }, 'KE', [grant({ countryCode: 'RW' })], now))
      .toEqual({ allowed: false, reason: 'needs_full_access' });
  });
});

describe('pricing', () => {
  it('formats RWF and KES like the design', () => {
    expect(formatMoney(2000, 'RWF', 0)).toBe('RWF 2,000');
    expect(formatMoney(150050, 'KES', 2)).toBe('KES 1,500.50');
  });
  it('returns null for an unset price instead of inventing one', () => {
    expect(formatMoney(null, 'KES', 2)).toBeNull();
  });
  it('is sellable only with a positive price', () => {
    expect(isSellable({ priceMinor: 2000 })).toBe(true);
    expect(isSellable({ priceMinor: null })).toBe(false);
    expect(isSellable({ priceMinor: 0 })).toBe(false);
    expect(isSellable(null)).toBe(false);
  });
  it('converts major to minor units per currency exponent', () => {
    expect(parseMajorToMinor(2000, 0)).toBe(2000);
    expect(parseMajorToMinor(1500.5, 2)).toBe(150050);
  });
});

describe('phone normalisation', () => {
  it.each([
    ['078 812 3456', '+250', '+250788123456'],
    ['0788123456', '+250', '+250788123456'],
    ['+250 788 123 456', '+250', '+250788123456'],
    ['250788123456', '+250', '+250788123456'],
    ['0712 345 678', '+254', '+254712345678'],
  ])('%s (%s) → %s', (input, dial, expected) => {
    expect(normalizePhone(input, dial)).toBe(expected);
  });
  it('rejects wrong-country, short and non-numeric input', () => {
    expect(normalizePhone('+254712345678', '+250')).toBeNull();
    expect(normalizePhone('07881', '+250')).toBeNull();
    expect(normalizePhone('07881234ab', '+250')).toBeNull();
  });
});
