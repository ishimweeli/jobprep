import { describe, expect, it } from 'vitest';
import { changeCountryBullets, defaultNewCountry } from './changeCountryModel';

const list = [
  { code: 'RW', status: 'LIVE' as const, selectable: true },
  { code: 'KE', status: 'LIVE' as const, selectable: true },
  { code: 'UG', status: 'PREPARING' as const, selectable: false },
];

describe('defaultNewCountry', () => {
  it('starts on the first other live country, like the artboard starts on Kenya', () => {
    expect(defaultNewCountry(list, 'RW', null)).toBe('KE');
  });
  it('?to= pre-selects a live country (the gate’s "Switch my account to Kenya")', () => {
    expect(defaultNewCountry(list, 'RW', 'ke')).toBe('KE');
  });
  it('never starts on a country that is not live or on the current one', () => {
    expect(defaultNewCountry(list, 'RW', 'UG')).toBe('KE');
    expect(defaultNewCountry(list.slice(0, 1), 'RW', null)).toBe('RW');
  });
});

describe('changeCountryBullets', () => {
  it('three lines with access running; the last says the goal is cleared', () => {
    const b = changeCountryBullets({ from: 'Rwanda', to: 'Kenya', currency: 'KES', methods: ['M-Pesa', 'Airtel Money'], accessDaysLeft: 23 });
    expect(b).toEqual([
      'You’ll see only Kenya mock tests, prices in KES and M-Pesa or Airtel Money.',
      'Your Rwanda Full Access (23 days left) only covers Rwanda tests. It keeps running and is there if you switch back.',
      'Your Rwanda results stay in your history. Your job goal is cleared, so you’ll choose one for Kenya next.',
    ]);
  });
  it('no access line without access; no invented payment methods', () => {
    const b = changeCountryBullets({ from: 'Rwanda', to: 'Kenya', currency: 'KES', methods: [], accessDaysLeft: null });
    expect(b).toHaveLength(2);
    expect(b[0]).toBe('You’ll see only Kenya mock tests, prices in KES.');
  });
  it('1 day left is singular', () => {
    expect(changeCountryBullets({ from: 'Rwanda', to: 'Kenya', currency: 'KES', methods: [], accessDaysLeft: 1 })[1]).toContain('(1 day left)');
  });
});
