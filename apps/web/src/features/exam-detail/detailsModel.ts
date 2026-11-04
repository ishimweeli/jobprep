import type { ExamDetail } from '../../api/types';

/**
 * The three states of an unlocked test (ExamDetailUnlocked.dc): not started, in progress (Resume), taken before
 * (new attempt + "Review last attempt"). From `access.state === 'GRANTED'`, `inProgress` and the finished full attempts:
 * the API's `attemptStats` (count, best, last; practice sets are not counted) when present, else `previousAttempts`.
 */
export type UnlockedState = 'not_started' | 'in_progress' | 'taken_before';

type Attempts = Pick<ExamDetail, 'previousAttempts' | 'attemptStats'>;

const attemptCount = (exam: Attempts): number => exam.attemptStats?.count ?? exam.previousAttempts.length;

export function unlockedState(exam: Pick<ExamDetail, 'inProgress'> & Attempts): UnlockedState {
  if (exam.inProgress) return 'in_progress';
  return attemptCount(exam) > 0 ? 'taken_before' : 'not_started';
}

export const PRIMARY_LABEL: Record<UnlockedState, string> = {
  not_started: 'Get started',
  in_progress: 'Resume test',
  taken_before: 'Start a new attempt',
};

const pct = (n: number) => `${Math.round(n)}%`;

/** The last finished attempt: its id (the review target) and score. */
export function lastAttempt(exam: Attempts): { id: string; percent: number | null } | null {
  const s = exam.attemptStats?.last;
  if (s) return { id: s.id, percent: s.percent };
  const a = exam.previousAttempts[0];
  return a ? { id: a.id, percent: a.percent } : null;
}

/** "Review last attempt · 58%" (the percent is left out when the attempt has none). */
export function reviewLastLabel(exam: Attempts): string | null {
  const last = lastAttempt(exam);
  if (!last) return null;
  return last.percent === null ? 'Review last attempt' : `Review last attempt · ${pct(last.percent)}`;
}

/** "Attempts: 2 · best 58% · unlimited attempts while your access lasts." Exact when the API sends `attemptStats`; else the API lists at most 5 attempts. */
export function attemptsLine(exam: Attempts & Pick<ExamDetail, 'attempts'>, listLimit = 5): string | null {
  const stats = exam.attemptStats;
  const list = exam.previousAttempts;
  const count = attemptCount(exam);
  if (count === 0) return null;
  const best = stats ? stats.bestPercent : (() => {
    const scores = list.map((a) => a.percent).filter((p): p is number => p !== null);
    return scores.length > 0 ? Math.max(...scores) : null;
  })();
  const parts = [`Attempts: ${count}${!stats && list.length >= listLimit ? '+' : ''}`];
  if (best !== null) parts.push(`best ${pct(best)}`);
  if (exam.attempts === 'UNLIMITED') parts.push('unlimited attempts while your access lasts');
  return `${parts.join(' · ')}.`;
}

/** "18 of 45 answered" progress share for the in-progress panel. */
export function answeredShare(p: { answered: number; total: number }): number {
  return p.total <= 0 ? 0 : Math.min(100, Math.round((p.answered / p.total) * 100));
}
