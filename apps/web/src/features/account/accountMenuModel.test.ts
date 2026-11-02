import { describe, expect, it } from 'vitest';
import type { InProgressAttempt } from '../../api/types';
import { accessLine, accountMenuItems, languageLine, signOutPrompt } from './accountMenuModel';

const attempt = (kind: 'FULL' | 'PRACTICE', remainingSeconds = 1265): InProgressAttempt => ({
  id: 'a1', kind, startedAt: '', mockTest: { slug: 's', title: 'Teaching Profession & CBC Pedagogy', countryCode: 'RW' }, total: 40, answered: 3, remainingSeconds,
});

describe('account menu items', () => {
  const items = accountMenuItems({
    slug: 'rw', countryName: 'Rwanda', languages: ['en', 'rw'],
    access: { current: { endsAt: '2026-12-02T00:00:00Z', daysLeft: 23, endingSoon: false }, expired: null, otherCountries: [] },
  });
  it('lists the artboard rows in order', () => {
    expect(items.map((i) => i.label)).toEqual(['My progress', 'My access', 'Exam country', 'Language', 'Help and support', 'Account settings']);
  });
  it('My access shows the days left from the API', () => {
    expect(items.find((i) => i.id === 'access')?.secondary).toBe('Full Access · 23 days left');
    expect(accessLine({ current: { endsAt: 'x', daysLeft: 1, endingSoon: true } })).toBe('Full Access · 1 day left');
    expect(accessLine({ current: null })).toBeNull();
  });
  it('Exam country opens the switch-country flow, settings opens the account page', () => {
    expect(items.find((i) => i.id === 'country')).toMatchObject({ secondary: 'Rwanda · change', to: '/choose-country' });
    expect(items.find((i) => i.id === 'settings')).toMatchObject({ secondary: 'Name, phone number', to: '/account/settings' });
    expect(items.find((i) => i.id === 'progress')?.to).toBe('/rw/progress');
  });
  it('Language has no picker design: drawn, with no destination', () => {
    expect(items.find((i) => i.id === 'language')).toMatchObject({ secondary: 'English · Ikinyarwanda', to: null });
    expect(languageLine(['en', 'sw'])).toBe('English · Kiswahili');
  });
  it('Help and support has no number to show: no second line, no destination', () => {
    const help = items.find((i) => i.id === 'help')!;
    expect(help.secondary).toBeNull();
    expect(help.to).toBeNull();
    expect(JSON.stringify(items)).not.toContain('[SUPPORT');
  });
});

describe('sign out confirmation', () => {
  it('asks only when a full mock test is running, and says which and how long is left', () => {
    expect(signOutPrompt([attempt('FULL')])).toEqual({ title: 'Teaching Profession & CBC Pedagogy', clock: '21:05' });
  });
  it('a practice set has no clock, so it does not block signing out', () => {
    expect(signOutPrompt([attempt('PRACTICE')])).toBeNull();
  });
  it('nothing running, or the list could not be loaded, signs out at once', () => {
    expect(signOutPrompt([])).toBeNull();
    expect(signOutPrompt(undefined)).toBeNull();
  });
});
