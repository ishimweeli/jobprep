import { describe, expect, it } from 'vitest';
import { resolveLocale, translationNote, untranslatedFor } from './i18n';

describe('resolveLocale', () => {
  it('the account language wins, then the stored one, then English', () => {
    expect(resolveLocale({ userLanguage: 'rw', stored: 'en', offered: ['en', 'rw'] })).toBe('rw');
    expect(resolveLocale({ userLanguage: null, stored: 'rw', offered: ['en', 'rw'] })).toBe('rw');
    expect(resolveLocale({ userLanguage: null, stored: null, offered: ['en', 'rw'] })).toBe('en');
  });
  it('never picks a language the country does not offer', () => {
    expect(resolveLocale({ userLanguage: 'rw', stored: 'sw', offered: ['en', 'sw'] })).toBe('sw');
    expect(resolveLocale({ userLanguage: 'rw', stored: 'rw', offered: ['en'] })).toBe('en');
  });
  it('ignores unknown codes and works while the country list is still loading', () => {
    expect(resolveLocale({ userLanguage: 'xx', stored: 'sw', offered: null })).toBe('sw');
  });
});

describe('untranslatedFor', () => {
  it('English-only tests read as such in another language', () => {
    expect(untranslatedFor('rw', ['en'])).toBe(true);
    expect(untranslatedFor('rw', ['en', 'rw'])).toBe(false);
    expect(untranslatedFor('en', ['en'])).toBe(false);
    expect(untranslatedFor('sw', [])).toBe(false);
  });
});

describe('translationNote', () => {
  it('says nothing for English or a fully translated test', () => {
    expect(translationNote(undefined)).toBeNull();
    expect(translationNote({ requested: 'en', translatedQuestions: 0, totalQuestions: 10 })).toBeNull();
    expect(translationNote({ requested: 'rw', translatedQuestions: 10, totalQuestions: 10 })).toBeNull();
  });
  it('English only when nothing is translated, partial otherwise', () => {
    expect(translationNote({ requested: 'rw', translatedQuestions: 0, totalQuestions: 10 })).toBe('english_only');
    expect(translationNote({ requested: 'sw', translatedQuestions: 4, totalQuestions: 10 })).toBe('partial');
  });
});
