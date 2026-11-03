import type { ResultResponse } from '../../api/types';
import { formatDate, trimNumber } from '../../lib/format';
import { formatClock } from '../exam/timer';

/** Pure formatting rules for the results screens (Results.dc / ResultsPhone.dc). */

/** The ring is drawn in a 120 box with r = 54: circumference 339.3 (the artboard's dash array). */
export const RING_CIRCUMFERENCE = 2 * Math.PI * 54;

/** "244.3 339.3" for 72%. */
export function ringDash(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  const arc = Math.round((p / 100) * RING_CIRCUMFERENCE * 10) / 10;
  return `${arc} ${Math.round(RING_CIRCUMFERENCE * 10) / 10}`;
}

export const percentLabel = (p: number) => `${Math.round(p)}%`;

/** "36 / 50 marks" */
export function marksLabel(score: ResultResponse['score']): string {
  return `${trimNumber(score.marks)} / ${trimNumber(score.totalMarks)} marks`;
}

/** Time spent as m:ss ("51:42"), or an en dash when the server has none. */
export function timeSpent(seconds: number | null | undefined): string {
  return seconds === null || seconds === undefined ? '–' : formatClock(seconds);
}

/** "Up 10 points" / "Down 4 points" / "No change". Whole points, as the artboard shows. */
export function deltaHeadline(delta: number | null): string | null {
  if (delta === null) return null;
  const n = Math.round(Math.abs(delta));
  if (Math.round(delta) === 0) return 'No change';
  return `${delta > 0 ? 'Up' : 'Down'} ${n} ${n === 1 ? 'point' : 'points'}`;
}

/** The topic bar colour: weak areas amber, below 70% light violet, otherwise brand violet (as drawn). */
export function topicBarColor(t: { percent: number; weak: boolean }): string {
  if (t.weak) return '#8A5300';
  return t.percent < 70 ? '#2D62CF' : '#164A7A';
}

/** Comparison bar height in px for the 160px chart (62% -> 99px, 72% -> 115px). */
export const barHeight = (percent: number) => Math.round(Math.max(0, Math.min(100, percent)) * 1.6);

/** "Time spent dropped from 54:10 to 51:42." */
export function timeSpentChange(now: number | null, before: number | null): { verb: string; from: string; to: string } | null {
  if (now === null || before === null) return null;
  const verb = now < before ? 'dropped from' : now > before ? 'rose from' : 'stayed at';
  return { verb, from: formatClock(before), to: formatClock(now) };
}

/** "Today" for the attempt just finished, else "24 Oct". */
export function historyLabel(entry: { submittedAt: string | null; current: boolean }, today: Date = new Date()): string {
  if (entry.current) {
    const d = entry.submittedAt ? new Date(entry.submittedAt) : null;
    if (!d || d.toDateString() === today.toDateString()) return 'Today';
  }
  return formatDate(entry.submittedAt);
}

export const answerText = (a: string[] | null): string | null => (a && a.length > 0 ? a.join(', ') : null);
