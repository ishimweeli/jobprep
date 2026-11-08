import type { InterviewKind, InterviewLevel, InterviewMode, InterviewOverview, InterviewStatus } from '../../api/interviews';

/** Pure rules for the Interview Preparation screens. */

/** "4h 20m", "35m", "45s". */
export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
}

/** "remaining of 5 hours" / "free trial minutes". */
export function balanceCaption(w: InterviewOverview['wallet']): string {
  if (w.hasPackage) {
    const hours = w.totalSeconds / 3600;
    return `remaining of ${Number.isInteger(hours) ? `${hours} hour${hours === 1 ? '' : 's'}` : durationLabel(w.totalSeconds)}`;
  }
  if (w.trialRemainingSeconds > 0) return 'of free trial time left';
  return 'remaining';
}

/** Share of the balance used, 0-100 (for the bar). */
export const usedPercent = (w: InterviewOverview['wallet']) => (w.totalSeconds > 0 ? Math.min(100, Math.round((w.usedSeconds / w.totalSeconds) * 100)) : 0);

/** The interview lengths offered, given the balance. A trial (under 15 minutes) offers 5 and 10. */
export const ALL_DURATIONS = [5, 10, 15, 30, 45, 60] as const;
export function durationOptions(remainingSeconds: number): { minutes: number; enough: boolean }[] {
  const big = remainingSeconds >= 15 * 60;
  return ALL_DURATIONS.filter((m) => (big ? m >= 15 : m <= 10)).map((m) => ({ minutes: m, enough: m * 60 <= remainingSeconds }));
}

/** The best default length: the recommended one when the balance allows, else the longest that fits. */
export function defaultDuration(recommended: number, remainingSeconds: number): number {
  const opts = durationOptions(remainingSeconds);
  const fits = opts.filter((o) => o.enough);
  if (fits.some((o) => o.minutes === recommended)) return recommended;
  return (fits[fits.length - 1] ?? opts[0])?.minutes ?? 5;
}

export const MODE_LABEL: Record<InterviewMode, string> = { REAL: 'Real interview', PRACTICE: 'Practice' };
export const MODE_HINT: Record<InterviewMode, string> = {
  REAL: 'A professional interviewer. No hints; your feedback comes at the end.',
  PRACTICE: 'The interviewer coaches you: a short tip after each answer and hints when you are stuck.',
};
export const KIND_LABEL: Record<InterviewKind, string> = { MIXED: 'Mixed — Technical + HR', TECHNICAL: 'Technical only', BEHAVIORAL: 'Behavioral / HR only' };
export const LEVEL_LABEL: Record<InterviewLevel, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

export function statusLabel(s: InterviewStatus): string {
  switch (s) {
    case 'READY': return 'Not started';
    case 'ACTIVE': return 'In progress';
    case 'PAUSED': return 'Paused';
    case 'ENDED': return 'Preparing feedback';
    case 'EVALUATED': return 'Completed';
    case 'FAILED': return 'Feedback unavailable';
  }
}

/** Colour band of a score (shared by the report and the history). */
export function scoreTone(score: number | null): 'good' | 'mid' | 'low' | 'none' {
  if (score === null) return 'none';
  if (score >= 75) return 'good';
  if (score >= 55) return 'mid';
  return 'low';
}

/** "+12%" / "−4%" / "0%". */
export function signedPercent(n: number): string {
  if (n > 0) return `+${n}%`;
  if (n < 0) return `−${Math.abs(n)}%`;
  return '0%';
}

/**
 * Text-to-speech speaks whole sentences as the interviewer's words stream in: split off every finished sentence
 * (ending in . ? ! followed by a space) and keep the rest for later.
 */
export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  for (let m = /[.?!](\s+)/.exec(rest); m; m = /[.?!](\s+)/.exec(rest)) {
    const end = m.index + 1;
    const s = rest.slice(0, end).trim();
    if (s) sentences.push(s);
    rest = rest.slice(end + m[1]!.length);
  }
  return { sentences, rest };
}

/** "mm:ss" for the live clock. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Why a microphone could not be used, in plain words. */
export function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access was blocked. Allow the microphone for this site in your browser settings, or type your answers instead.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Connect one, or type your answers instead.';
  if (name === 'NotReadableError') return 'Your microphone is being used by another app. Close it and try again, or type your answers instead.';
  return 'The microphone could not be started. You can type your answers instead.';
}

/** What the server's end reason means for the person. */
export function endReasonText(reason: string | null): string | null {
  switch (reason) {
    case 'time_up': return 'The interview time was up.';
    case 'out_of_minutes': return 'Your interview minutes ran out.';
    case 'disconnected': return 'The connection was lost, so the interview was ended. Time without a connection was not charged.';
    case 'abandoned': return 'The interview was paused for too long and was ended.';
    default: return null;
  }
}
