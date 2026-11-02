import { describe, expect, it } from 'vitest';
import type { DashboardResponse } from '../../api/types';
import { chartAria, chartPoints, DESKTOP_CHART, greeting, longDate, PHONE_CHART, progressWidth, visibleSections } from './dashboardModel';

describe('dashboard model', () => {
  it('greets in Kinyarwanda for Rwanda', () => {
    expect(greeting('RW', 'Aline')).toBe('Muraho, Aline');
    expect(greeting('KE', 'Aline')).toBe('Hello, Aline');
  });

  it('progress width is answered / total', () => {
    expect(progressWidth(18, 40)).toBe(45);
    expect(progressWidth(0, 0)).toBe(0);
  });

  it('chart points: evenly spread, 0 % on the baseline, higher scores higher up', () => {
    const pts = chartPoints([{ percent: 54, label: 'a' }, { percent: 62, label: 'b' }, { percent: 72, label: 'c' }], DESKTOP_CHART);
    expect(pts.map((p) => p.x)).toEqual([100, 310, 520]);
    expect(pts[0]!.y).toBeGreaterThan(pts[1]!.y);
    expect(pts[1]!.y).toBeGreaterThan(pts[2]!.y);
    expect(chartPoints([{ percent: 0, label: '' }], DESKTOP_CHART)[0]!.y).toBe(DESKTOP_CHART.baseline);
    expect(chartPoints([{ percent: 100, label: '' }], DESKTOP_CHART)[0]!.y).toBe(DESKTOP_CHART.top);
  });

  it('a single attempt sits in the middle; unscored attempts are skipped; the phone frame has its own width', () => {
    expect(chartPoints([{ percent: 50, label: '' }], PHONE_CHART)[0]!.x).toBe(170);
    expect(chartPoints([{ percent: null, label: '' }, { percent: 50, label: '' }], PHONE_CHART)).toHaveLength(1);
  });

  it('accessible name lists every score with its date', () => {
    const pts = chartPoints([{ percent: 54, label: '' }, { percent: 72.4, label: '' }], DESKTOP_CHART);
    expect(chartAria(pts, ['17 October', '1 November'])).toBe('Scores: 54 percent on 17 October, 72 percent on 1 November');
    expect(longDate('2026-10-17T09:00:00')).toBe('17 October');
  });

  it('shows only what the artboard can show for the data (empty dashboard is undesigned)', () => {
    const empty = {
      resume: null, recommended: null, scoreHistory: [], topics: { strong: [], needsWork: [] }, recentlyCompleted: [], access: { current: null, otherCountries: [] },
    } as unknown as DashboardResponse;
    expect(visibleSections(empty)).toEqual({ resume: false, recommended: false, history: false, topics: false, recent: false, access: false });
    const full = {
      ...empty,
      resume: {}, recommended: {}, scoreHistory: [{ percent: 60 }], topics: { strong: [{}], needsWork: [] }, recentlyCompleted: [{}], access: { current: { endsAt: 'x', daysLeft: 3 }, otherCountries: [] },
    } as unknown as DashboardResponse;
    expect(Object.values(visibleSections(full)).every(Boolean)).toBe(true);
  });
});
