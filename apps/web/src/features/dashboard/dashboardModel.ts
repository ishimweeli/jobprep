import type { DashboardResponse } from '../../api/types';

/** Pure helpers for the dashboard (Dashboard.dc / DashboardPhone.dc). */

export function greeting(countryCode: string, firstName: string): string {
  return `${countryCode === 'RW' ? 'Muraho' : 'Hello'}, ${firstName}`;
}

export const progressWidth = (answered: number, total: number) => (total <= 0 ? 0 : Math.min(100, Math.round((answered / total) * 100)));

export interface ChartGeometry {
  width: number;
  height: number;
  baseline: number;
  /** y of the 0 % line is `baseline`; y of 100 % is `top`. */
  top: number;
  left: number;
  right: number;
  /** Where the labels under the line sit. */
  dateY: number;
  gridLines: { percent: number; y: number }[];
}

/** Desktop (viewBox 600 x 220) and phone (340 x 150) frames, with the artboards' line positions. */
export const DESKTOP_CHART: ChartGeometry = {
  width: 600, height: 220, baseline: 200, top: 20, left: 100, right: 520, dateY: 218,
  gridLines: [100, 70, 40].map((percent) => ({ percent, y: 200 - (percent / 100) * 180 })),
};
export const PHONE_CHART: ChartGeometry = {
  width: 340, height: 150, baseline: 125, top: 30, left: 50, right: 290, dateY: 144,
  gridLines: [],
};

export interface ChartPoint {
  x: number;
  y: number;
  percent: number;
  label: string;
}

/** Points spread evenly between `left` and `right`; y is linear in the percentage (0 % = baseline). */
export function chartPoints(history: { percent: number | null; label: string }[], g: ChartGeometry): ChartPoint[] {
  const pts = history.filter((h): h is { percent: number; label: string } => h.percent !== null);
  const mid = (g.left + g.right) / 2;
  return pts.map((h, i) => ({
    x: pts.length === 1 ? mid : g.left + (i * (g.right - g.left)) / (pts.length - 1),
    y: Math.round((g.baseline - (Math.max(0, Math.min(100, h.percent)) / 100) * (g.baseline - g.top)) * 10) / 10,
    percent: Math.round(h.percent),
    label: h.label,
  }));
}

/** "54 percent on 17 October, 62 percent on 24 October" for the chart's accessible name. */
export function chartAria(points: ChartPoint[], longDates: string[]): string {
  return `Scores: ${points.map((p, i) => `${p.percent} percent${longDates[i] ? ` on ${longDates[i]}` : ''}`).join(', ')}`;
}

export function longDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** Everything the artboard can show for this data. Sections without data are left out (the empty dashboard is not designed, C16). */
export function visibleSections(d: DashboardResponse) {
  return {
    resume: !!d.resume,
    recommended: !!d.recommended,
    history: d.scoreHistory.some((h) => h.percent !== null),
    topics: d.topics.strong.length + d.topics.needsWork.length > 0,
    recent: d.recentlyCompleted.length > 0,
    access: !!d.access.current,
  };
}
