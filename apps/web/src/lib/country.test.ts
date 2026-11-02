import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserRegion, getStoredCountry, resolveInitialCountry, setStoredCountry } from './country';
import { readStorage, writeStorage } from './storage';

const countries = [
  { slug: 'ke', status: 'PREPARING' as const },
  { slug: 'rw', status: 'LIVE' as const },
  { slug: 'ug', status: 'PLANNED' as const },
];

afterEach(() => vi.restoreAllMocks());

describe('country persistence', () => {
  it('remembers the chosen country (lowercase) and ignores junk', () => {
    setStoredCountry('RW');
    expect(getStoredCountry()).toBe('rw');
    localStorage.setItem('jobprep.country', 'rwanda!!');
    expect(getStoredCountry()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStorage('x')).toBeNull();
    expect(() => writeStorage('x', 'y')).not.toThrow();
    expect(getStoredCountry()).toBeNull();
  });
});

describe('resolveInitialCountry', () => {
  it('prefers a stored live country', () => expect(resolveInitialCountry(countries, 'rw', 'ke')).toBe('rw'));
  it('never picks a country that is not live', () => {
    expect(resolveInitialCountry(countries, 'ke', 'ug')).toBe('rw');
  });
  it('uses the browser region when it is live', () => {
    expect(resolveInitialCountry([...countries, { slug: 'tz', status: 'LIVE' }], null, 'tz')).toBe('tz');
  });
  it('is null when nothing is live', () => expect(resolveInitialCountry([{ slug: 'ke', status: 'PREPARING' }], null, null)).toBeNull());
  it('reads the region from a language tag', () => {
    expect(browserRegion('en-RW')).toBe('rw');
    expect(browserRegion('en')).toBeNull();
  });
});
