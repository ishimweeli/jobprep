import { describe, expect, it } from 'vitest';
import {
  amountFromLabel, formatCount, formatDateTime, formatDay, formatDayYear, formatLastActive, formatLocalPhone, formatLongDate, formatTime, formatTotals, initials, mmss, plural,
} from './format';

describe('numbers and money', () => {
  it('groups counts with commas', () => {
    expect(formatCount(4218)).toBe('4,218');
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(1204, 'attempt')).toBe('1,204 attempts');
    expect(plural(6, 'category', 'categories')).toBe('6 categories');
  });
  it('shows the API money labels, one per currency; nothing yet is 0', () => {
    expect(formatTotals([{ label: 'RWF 78,000' }])).toBe('RWF 78,000');
    expect(formatTotals([{ label: 'RWF 78,000' }, { label: 'KES 1,500' }])).toBe('RWF 78,000 · KES 1,500');
    expect(formatTotals([])).toBe('0');
    expect(formatTotals([{ label: null }])).toBe('0');
  });
  it('takes the amount out of a label for the price field', () => {
    expect(amountFromLabel('RWF 2,000')).toBe('2000');
    expect(amountFromLabel(null)).toBe('');
  });
  it('mm:ss for the resend wait', () => {
    expect(mmss(45)).toBe('0:45');
    expect(mmss(125)).toBe('2:05');
  });
});

describe('dates are shown in Kigali time, as the artboards write them', () => {
  const t = '2026-11-01T19:12:00Z'; // 21:12 in Kigali (UTC+2)
  it('formats', () => {
    expect(formatTime(t)).toBe('21:12');
    expect(formatDay(t)).toBe('1 Nov');
    expect(formatDayYear('2026-10-17T10:00:00Z')).toBe('17 Oct 2026');
    expect(formatDateTime(t)).toBe('1 Nov, 21:12');
    expect(formatLongDate(t)).toBe('Sunday, 1 November 2026');
  });
  it('a time after 22:00 UTC is already the next day in Kigali', () => {
    expect(formatDay('2026-10-31T23:30:00Z')).toBe('1 Nov');
  });
  it('last active: today with the time, yesterday, an older date, or never', () => {
    const now = new Date('2026-11-01T19:30:00Z');
    expect(formatLastActive('2026-11-01T19:14:00Z', now)).toBe('Today, 21:14');
    expect(formatLastActive('2026-11-01T19:14:00Z', now, { phone: true })).toBe('Today 21:14');
    expect(formatLastActive('2026-10-31T12:00:00Z', now)).toBe('Yesterday');
    expect(formatLastActive('2026-10-29T12:00:00Z', now)).toBe('29 Oct');
    expect(formatLastActive(null, now)).toBe('—');
  });
  it('bad input is empty, not "Invalid Date"', () => {
    expect(formatDay('nope')).toBe('');
    expect(formatDateTime(null)).toBe('');
  });
});

describe('people', () => {
  it('initials', () => {
    expect(initials('Aline Uwase')).toBe('AU');
    expect(initials('Jean Claude Mugisha')).toBe('JC');
    expect(initials('  ')).toBe('?');
  });
  it('local phone like the artboards', () => {
    expect(formatLocalPhone('+250788123456')).toBe('078 812 3456');
    expect(formatLocalPhone('+254712345678')).toBe('071 234 5678');
    expect(formatLocalPhone('weird')).toBe('weird');
  });
});
