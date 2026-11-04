import { describe, expect, it } from 'vitest';
import { accessSummaryView, goalName, goalRowLine, tidyName, validateName } from './accountModel';
import { goalScreenCopy } from './changeGoalModel';

const fmt = (iso: string) => `D(${iso.slice(0, 10)})`;

describe('name validation (C14)', () => {
  it('needs 2 to 80 characters after trimming', () => {
    expect(validateName(' a ')).toBe('Enter your name (at least 2 characters).');
    expect(validateName('Al')).toBeNull();
    expect(validateName('x'.repeat(81))).toBe('Keep your name under 80 characters.');
  });
  it('tidies spaces before saving', () => {
    expect(tidyName('  Aline   Uwase ')).toBe('Aline Uwase');
  });
});

describe('goal row (C14 / C15)', () => {
  const cats = [{ id: 'c1', name: 'Teaching positions' }];
  it('names the goal from the country categories, or says it is not chosen', () => {
    expect(goalName({ goalCategoryId: 'c1' }, cats)).toBe('Teaching positions');
    expect(goalName({ goalCategoryId: null }, cats)).toBeNull();
    expect(goalName({ goalCategoryId: 'gone' }, cats)).toBeNull();
    expect(goalRowLine(null)).toBe('Not chosen yet');
  });
  it('the change-goal screen is "Choose your goal" when there is none', () => {
    expect(goalScreenCopy({ hasGoal: false, countryName: 'Kenya' }).title).toBe('Choose your goal');
    expect(goalScreenCopy({ hasGoal: true, countryName: 'Rwanda' })).toMatchObject({ title: 'Change your goal', keep: 'Keep my current goal' });
  });
});

describe('access summary on the account page (C14)', () => {
  it('active, ending soon, ended, other country, none', () => {
    expect(accessSummaryView({ current: { endsAt: '2026-12-01T00:00:00Z', daysLeft: 20, endingSoon: false }, expired: null, otherCountries: [] }, 'Rwanda', fmt)).toEqual({
      title: 'Full Access · active',
      body: 'Until D(2026-12-01) (20 days left). It covers every Rwanda mock test.',
      tone: 'active',
    });
    expect(accessSummaryView({ current: { endsAt: '2026-11-06T00:00:00Z', daysLeft: 1, endingSoon: true }, expired: null, otherCountries: [] }, 'Rwanda', fmt)).toMatchObject({
      title: 'Full Access · ending soon',
      tone: 'ending',
    });
    expect(accessSummaryView({ current: null, expired: { endedAt: '2026-10-15T00:00:00Z' }, otherCountries: [] }, 'Rwanda', fmt).body).toBe('Your Rwanda Full Access ended on D(2026-10-15).');
    expect(accessSummaryView({ current: null, expired: null, otherCountries: [{ countryCode: 'KE', endsAt: '', daysLeft: 3 }] }, 'Rwanda', fmt).body).toMatch(
      /another country does not cover Rwanda/,
    );
    expect(accessSummaryView(undefined, 'Rwanda', fmt)).toMatchObject({ title: 'Free tests only', tone: 'none' });
  });
});
