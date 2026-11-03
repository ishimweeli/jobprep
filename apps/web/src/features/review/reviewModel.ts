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

export type GridKind = 'correct' | 'incorrect' | 'partial' | 'unanswered';
export const gridKind = (s: ReviewStatus): GridKind => (s === 'partial' ? 'partial' : s === 'incorrect' ? 'incorrect' : s === 'unanswered' ? 'unanswered' : 'correct');

/** "7✕" for incorrect, "7◐" for partly correct, "24–" for unanswered, "12" for correct: never colour alone. */
export function gridMark(n: number, s: ReviewStatus): string {
  const k = gridKind(s);
  return k === 'incorrect' ? `${n}✕` : k === 'partial' ? `${n}◐` : k === 'unanswered' ? `${n}–` : String(n);
}

const GRID_WORD: Record<GridKind, string> = { correct: 'correct', incorrect: 'incorrect', partial: 'partly correct', unanswered: 'not answered' };
export const gridAria = (n: number, s: ReviewStatus): string => `Question ${n}, ${GRID_WORD[gridKind(s)]}`;

export const BADGE: Record<GridKind, { label: string; cls: string }> = {
  correct: { label: 'Correct', cls: 'bg-free-bg text-free' },
  incorrect: { label: 'Incorrect', cls: 'bg-incorrect-bg text-incorrect' },
  partial: { label: 'Partly correct', cls: 'bg-[#FFEDD5] text-[#9A3412]' },
  unanswered: { label: 'Not answered', cls: 'bg-soft text-ink-2' },
};

export const GRID_STYLE: Record<GridKind, string> = {
  correct: 'border border-correct bg-correct-bg text-free',
  incorrect: 'border border-incorrect bg-incorrect-bg text-incorrect',
  partial: 'border border-[#9A3412] bg-[#FFEDD5] text-[#9A3412]',
  unanswered: 'border border-dashed border-muted bg-surface text-ink-2',
};

/** How an option is drawn: the correct one (✓), a wrong pick (✕), or plain. */
export function optionKind(o: ReviewItem['options'][number]): 'right' | 'wrongPick' | 'plain' {
  if (o.isCorrect) return 'right';
  return o.isYourPick ? 'wrongPick' : 'plain';
}

// ───────────────────────── Multiple-select in the review (MultiSelect.dc, "Review: partly correct")

/** "0.33 of 1 mark" / "1 of 2 marks": marks awarded of marks available. */
export function marksOfLabel(awarded: number, marks: number): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
  return `${n(awarded)} of ${n(marks)} ${marks === 1 ? 'mark' : 'marks'}`;
}

/** How many answers the question asked for. The review has no `choose` field, so it is the number of correct options. */
export const chooseCount = (item: Pick<ReviewItem, 'options'>): number => item.options.filter((o) => o.isCorrect).length;

/** The line under each option of a multiple-select question. Empty for an option that is neither right nor picked. */
export function multiOptionNote(o: Pick<ReviewItem['options'][number], 'isCorrect' | 'isYourPick'>): string {
  if (o.isCorrect && o.isYourPick) return '✓ Correct · your choice';
  if (o.isCorrect) return '✓ Correct · you missed this one';
  if (o.isYourPick) return '✕ Not correct · your choice';
  return '';
}
