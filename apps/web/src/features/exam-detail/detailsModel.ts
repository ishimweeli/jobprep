import type { ExamDetail } from '../../api/types';

/**
 * The three states of an unlocked test (ExamDetailUnlocked.dc): not started, in progress (Resume), taken before
 * (new attempt + "Review last attempt"). From `access.state === 'GRANTED'`, `inProgress` and `previousAttempts`.
 */
export type UnlockedState = 'not_started' | 'in_progress' | 'taken_before';

export function unlockedState(exam: Pick<ExamDetail, 'inProgress' | 'previousAttempts'>): UnlockedState {
  if (exam.inProgress) return 'in_progress';
  return exam.previousAttempts.length > 0 ? 'taken_before' : 'not_started';
}

export const PRIMARY_LABEL: Record<UnlockedState, string> = {
  not_started: 'Get started',
  in_progress: 'Resume test',
  taken_before: 'Start a new attempt',
};

const pct = (n: number) => `${Math.round(n)}%`;

/** "Review last attempt · 58%" (the percent is left out when the attempt has none). */
export function reviewLastLabel(exam: Pick<ExamDetail, 'previousAttempts'>): string | null {
  const last = exam.previousAttempts[0];
  if (!last) return null;
  return last.percent === null ? 'Review last attempt' : `Review last attempt · ${pct(last.percent)}`;
}

/** "Attempts: 2 · best 58% · unlimited attempts while your access lasts." The API lists at most 5 attempts. */
export function attemptsLine(exam: Pick<ExamDetail, 'previousAttempts' | 'attempts'>, listLimit = 5): string | null {
  const list = exam.previousAttempts;
  if (list.length === 0) return null;
  const scores = list.map((a) => a.percent).filter((p): p is number => p !== null);
  const parts = [`Attempts: ${list.length}${list.length >= listLimit ? '+' : ''}`];
  if (scores.length > 0) parts.push(`best ${pct(Math.max(...scores))}`);
  if (exam.attempts === 'UNLIMITED') parts.push('unlimited attempts while your access lasts');
  return `${parts.join(' · ')}.`;
}

/** "18 of 45 answered" progress share for the in-progress panel. */
export function answeredShare(p: { answered: number; total: number }): number {
  return p.total <= 0 ? 0 : Math.min(100, Math.round((p.answered / p.total) * 100));
}
