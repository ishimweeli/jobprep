import type { Difficulty, ExamDetail, JobCard, PreviousAttempt } from '../api/types';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', rw: 'Kinyarwanda', sw: 'Kiswahili' };
const LANGUAGE_SHORT: Record<string, string> = { en: 'EN', rw: 'KIN', sw: 'SW' };

export const languageName = (code: string) => LANGUAGE_NAMES[code] ?? code.toUpperCase();
/** A language in its own name, as the language controls show it ("Ikinyarwanda"). */
export const languageOwnName = (code: string) => (code === 'rw' ? 'Ikinyarwanda' : languageName(code));
export const languageShort = (code: string) => LANGUAGE_SHORT[code] ?? code.toUpperCase();
export const languageList = (codes: string[]) => codes.map(languageName).join(' · ');
export const languageListShort = (codes: string[]) => codes.map(languageShort).join(' · ');

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  FOUNDATION: 'Foundation',
  STANDARD: 'Standard',
  CHALLENGING: 'Challenging',
};

export const difficultyLabel = (d: string) => DIFFICULTY_LABEL[d as Difficulty] ?? d;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "12 Oct" (current year) or "24 Oct 2026". UTC-independent: formats in the viewer's locale. */
export function formatDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

export interface JobDeadlineLabel {
  text: string;
  /** Past its deadline: render with a quieter tone than a still-open one. */
  closed: boolean;
}

/**
 * "Application closes today" / "... tomorrow" / "... in 5 days" while open, or "Application closed 12 days ago ·
 * 24 Oct" once it's passed — the exact closed date lets someone who remembers a specific posting confirm this is
 * the same mock they were looking for, instead of the badge just disappearing once the deadline is gone.
 */
export function jobDeadlineLabel(iso: string | null | undefined): JobDeadlineLabel | null {
  if (!iso) return null;
  const deadline = new Date(iso);
  if (Number.isNaN(deadline.getTime())) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.ceil((deadline.getTime() - Date.now()) / msPerDay);
  if (days < 0) return { text: `Application closed ${plural(-days, 'day')} ago · ${formatDate(iso)}`, closed: true };
  if (days === 0) return { text: 'Application closes today', closed: false };
  if (days === 1) return { text: 'Application closes tomorrow', closed: false };
  return { text: `Application closes in ${days} days`, closed: false };
}

/** "3 free · 5 total" / "All free" / "Full Access only" — a job card's access summary across its mock tests. */
export function jobAccessSummary(freeCount: number, totalCount: number): string {
  if (freeCount === 0) return 'Full Access only';
  if (freeCount === totalCount) return 'All free';
  return `${freeCount} free · ${totalCount} total`;
}

/** "100 questions · 120 minutes each", or a range ("80–120 questions · 90–150 minutes") when a job's mocks differ. */
export function jobFactsLine(job: Pick<JobCard, 'durationMinutes' | 'durationRange' | 'questionCount' | 'questionCountRange'>): string {
  const questions = job.questionCount !== null ? `${job.questionCount} questions` : `${job.questionCountRange!.min}–${job.questionCountRange!.max} questions`;
  const minutes = job.durationMinutes !== null ? `${job.durationMinutes} minutes` : `${job.durationRange!.min}–${job.durationRange!.max} minutes`;
  const uniform = job.durationMinutes !== null && job.questionCount !== null;
  return `${questions} · ${minutes}${uniform ? ' each' : ''}`;
}

/** The job card's difficulty: the single level its mocks share, or "Mixed difficulty" when they vary. */
export function jobDifficultyLabel(difficulties: Difficulty[]): string {
  return difficulties.length === 1 ? difficultyLabel(difficulties[0]!) : 'Mixed difficulty';
}

/** "31 / 50 · 62%" — only the parts the API actually returned. */
export function attemptScore(a: PreviousAttempt): string {
  const parts: string[] = [];
  if (a.scoreMarks !== null && a.totalMarks !== null) parts.push(`${trimNumber(a.scoreMarks)} / ${trimNumber(a.totalMarks)}`);
  if (a.percent !== null) parts.push(`${Math.round(a.percent)}%`);
  return parts.join(' · ') || '—';
}

export function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * Pass-mark display rule: an official threshold is shown ONLY when the API returns `passMark`
 * (percent + source). Otherwise the "no official pass mark" note is shown. Never inferred.
 */
export type PassMarkDisplay = { kind: 'official'; percent: number; source: string } | { kind: 'none' };

export function passMarkDisplay(exam: Pick<ExamDetail, 'passMark'>): PassMarkDisplay {
  const p = exam.passMark;
  if (p && typeof p.percent === 'number' && p.source && p.source.trim()) {
    return { kind: 'official', percent: p.percent, source: p.source };
  }
  return { kind: 'none' };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** "m:ss" for the resend countdown. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
