import { describe, expect, it } from 'vitest';
import type { CountryRow } from '../../api/types';
import { countrySummary, defaultCountry } from './countriesModel';

const row = (o: Partial<CountryRow>): CountryRow => ({ code: 'RW', name: 'Rwanda', status: 'LIVE', currencyCode: 'RWF', users: 0, publishedTests: 0, draftTests: 0, waitingList: 0, priceLabel: null, ...o });

describe('country cards', () => {
  it('live: price, tests and users', () => {
    expect(countrySummary(row({ priceLabel: 'RWF 2,000', publishedTests: 90, users: 4218 }))).toBe('RWF 2,000 · 90 tests · 4,218 users');
  });
  it('preparing without a price: says so, and counts drafts', () => {
    expect(countrySummary(row({ status: 'PREPARING', draftTests: 24, waitingList: 0 }))).toBe('Price not set · 24 tests in draft');
  });
  it('planned: no tests yet and the waiting list', () => {
    expect(countrySummary(row({ status: 'PLANNED', waitingList: 212 }))).toBe('No tests yet · 212 on waiting list');
    expect(countrySummary(row({ status: 'PLANNED' }))).toBe('No tests yet');
  });
  it('opens the requested country, else the first preparing one, else the first', () => {
    const list = [row({ code: 'RW' }), row({ code: 'KE', status: 'PREPARING' }), row({ code: 'UG', status: 'PLANNED' })];
    expect(defaultCountry(list, 'ug')).toBe('UG');
    expect(defaultCountry(list, 'XX')).toBe('KE');
    expect(defaultCountry([row({ code: 'RW' })], null)).toBe('RW');
    expect(defaultCountry([], null)).toBeUndefined();
  });
});
