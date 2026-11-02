import type { ReviewFilter, ReviewItem, ReviewResponse, ReviewStatus } from '../../api/types';

/** Review rules shared by the desktop list and the phone one-at-a-time view (Review.dc / ReviewPhone.dc). */

/** Partly correct (multiple-select) answers are listed under "Incorrect": they were not fully right. */
export const isIncorrect = (s: ReviewStatus) => s === 'incorrect' || s === 'partial';

export function filterItems(items: ReviewItem[], filter: ReviewFilter): ReviewItem[] {
  switch (filter) {
    case 'incorrect':
      return items.filter((i) => isIncorrect(i.status));
    case 'flagged':
      return items.filter((i) => i.flagged);
    case 'unanswered':
      return items.filter((i) => i.status === 'unanswered');
    default:
      return items;
  }
}

/** The default tab: Incorrect, unless nothing is incorrect (then everything). */
export const defaultFilter = (counts: ReviewResponse['counts']): ReviewFilter => (counts.incorrect > 0 ? 'incorrect' : 'all');

export interface TabDef {
  filter: ReviewFilter;
  /** Desktop label; phone uses `short` for All. */
  label: string;
  short: string;
}

export function tabsFor(counts: ReviewResponse['counts']): TabDef[] {
  return [
    { filter: 'incorrect', label: `Incorrect (${counts.incorrect})`, short: `Incorrect (${counts.incorrect})` },
    { filter: 'flagged', label: `Flagged (${counts.flagged})`, short: `Flagged (${counts.flagged})` },
    { filter: 'unanswered', label: `Unanswered (${counts.unanswered})`, short: `Unanswered (${counts.unanswered})` },
    { filter: 'all', label: 'All questions', short: 'All' },
  ];
}

/** "1 of 11 incorrect" (phone position line). */
export function positionLabel(index: number, total: number, filter: ReviewFilter): string {
  const name = filter === 'all' ? 'shown' : filter;
  return `${index + 1} of ${total} ${name}`;
}

export type GridKind = 'correct' | 'incorrect' | 'unanswered';
export const gridKind = (s: ReviewStatus): GridKind => (isIncorrect(s) ? 'incorrect' : s === 'unanswered' ? 'unanswered' : 'correct');

/** "7✕" for incorrect, "24–" for unanswered, "12" for correct: the state is never colour alone. */
export function gridMark(n: number, s: ReviewStatus): string {
  const k = gridKind(s);
  return k === 'incorrect' ? `${n}✕` : k === 'unanswered' ? `${n}–` : String(n);
}

export const gridAria = (n: number, s: ReviewStatus): string => `Question ${n}, ${gridKind(s) === 'correct' ? 'correct' : gridKind(s) === 'incorrect' ? 'incorrect' : 'not answered'}`;

export const BADGE: Record<GridKind, { label: string; cls: string }> = {
  correct: { label: 'Correct', cls: 'bg-free-bg text-free' },
  incorrect: { label: 'Incorrect', cls: 'bg-incorrect-bg text-red-800' },
  unanswered: { label: 'Not answered', cls: 'bg-soft text-ink-2' },
};

export const GRID_STYLE: Record<GridKind, string> = {
  correct: 'border border-correct bg-correct-bg text-free',
  incorrect: 'border border-incorrect bg-incorrect-bg text-red-800',
  unanswered: 'border border-dashed border-muted bg-surface text-ink-2',
};

/** How an option is drawn: the correct one (✓), a wrong pick (✕), or plain. */
export function optionKind(o: ReviewItem['options'][number]): 'right' | 'wrongPick' | 'plain' {
  if (o.isCorrect) return 'right';
  return o.isYourPick ? 'wrongPick' : 'plain';
}
