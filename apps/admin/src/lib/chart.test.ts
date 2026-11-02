import { describe, expect, it } from 'vitest';
import { barHeights, chartSummary, trendOf } from './chart';

const S = [62, 48, 71, 55, 80, 66, 59, 74, 88, 92, 79, 104, 118, 131];
const P = [14, 11, 17, 13, 19, 16, 15, 18, 22, 24, 21, 28, 33, 39];

describe('the 14-day chart', () => {
  it('bar heights are a share of the tallest value of either series', () => {
    const b = barHeights(S, P);
    expect(b).toHaveLength(14);
    expect(b[13]).toEqual({ s: '100%', p: '30%' });
    expect(b[1]).toEqual({ s: '37%', p: '8%' });
  });
  it('an empty chart does not divide by zero', () => {
    expect(barHeights([0, 0], [0, 0])).toEqual([{ s: '0%', p: '0%' }, { s: '0%', p: '0%' }]);
  });
  it('the spoken summary has the real numbers and the trend', () => {
    expect(chartSummary(S, P)).toBe('Daily sign-ups ranged from 48 to 131 and payments from 11 to 39 over the last 14 days, rising towards the end.');
  });
  it('falling and level trends', () => {
    expect(trendOf([9, 9, 9, 5, 3, 1], [1, 1, 1, 0, 0, 0])).toBe('falling');
    expect(trendOf([5, 5, 5, 5, 5, 5], [1, 1, 1, 1, 1, 1])).toBe('level');
    expect(chartSummary([5, 5, 5], [1, 1, 1])).toContain('staying level');
  });
  it('the day the data starts: all in one day still reads sensibly', () => {
    const s = Array.from({ length: 14 }, (_, i) => (i === 13 ? 626 : 0));
    const p = Array.from({ length: 14 }, (_, i) => (i === 13 ? 114 : 0));
    expect(chartSummary(s, p)).toBe('Daily sign-ups ranged from 0 to 626 and payments from 0 to 114 over the last 14 days, rising towards the end.');
  });
});
