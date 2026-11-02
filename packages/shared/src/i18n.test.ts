import { describe, expect, it } from 'vitest';
import { t } from './i18n';

describe('t()', () => {
  it('translates, falls back to English per key, and interpolates', () => {
    expect(t('rw', 'exam.start')).toBe('Tangira Ikizamini');
    expect(t('rw', 'landing.headline')).toBe('Practice Smarter. Pass with Confidence.');
    expect(t('en', 'exam.waitingToSave', { count: 3 })).toBe('3 answers waiting to save');
  });
  it('lets DB overrides win and returns the key for unknown strings', () => {
    expect(t('en', 'exam.start', {}, { 'exam.start': 'Begin' })).toBe('Begin');
    expect(t('en', 'nope.key')).toBe('nope.key');
  });
});
