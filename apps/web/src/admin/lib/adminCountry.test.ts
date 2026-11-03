import { describe, expect, it } from 'vitest';
import { allowedCountryCodes, resolveCountry } from './adminCountry';

describe('the admin country filter', () => {
  it('an admin without a scope may pick any known country', () => {
    expect(allowedCountryCodes([])).toEqual(['RW', 'KE', 'UG', 'TZ']);
    expect(allowedCountryCodes(['RW'])).toEqual(['RW']);
  });

  it('the URL wins, then the remembered choice, then all countries', () => {
    expect(resolveCountry('ke', 'RW', [])).toBe('KE');
    expect(resolveCountry(null, 'RW', [])).toBe('RW');
    expect(resolveCountry(null, 'ALL', [])).toBeUndefined();
    expect(resolveCountry(null, null, [])).toBeUndefined();
  });

  it('ignores a country outside the admin scope', () => {
    expect(resolveCountry('KE', null, ['RW', 'UG'])).toBeUndefined();
    expect(resolveCountry(null, 'KE', ['RW', 'UG'])).toBeUndefined();
    expect(resolveCountry('UG', 'RW', ['RW', 'UG'])).toBe('UG');
  });

  it('an admin with exactly one country always has that country', () => {
    expect(resolveCountry(null, 'ALL', ['RW'])).toBe('RW');
    expect(resolveCountry('KE', null, ['RW'])).toBe('RW');
  });
});
