import type { ExamCase, ExamQuestion } from '../../api/types';
import { plural } from '../../lib/format';
import type { LocalAnswers } from './queue';
import type { EngineSnapshot } from './saveEngine';

/** Pure view-model helpers for the exam screens, kept apart from React so the state -> UI rules are unit-tested. */

export interface ExamCounts {
  total: number;
  answered: number;
  unanswered: number;
  flagged: number;
}

export function countsOf(questions: ExamQuestion[], answers: LocalAnswers): ExamCounts {
  let answered = 0;
  let flagged = 0;
  for (const q of questions) {
    const a = answers[q.id];
    if (a && a.selected.length > 0) answered += 1;
    if (a?.flagged) flagged += 1;
  }
  return { total: questions.length, answered, unanswered: questions.length - answered, flagged };
}

export const progressPercent = (c: Pick<ExamCounts, 'answered' | 'total'>) => (c.total === 0 ? 0 : Math.round((c.answered / c.total) * 100));

/** Navigator cell state: the artboard's four looks (answered, not answered, flagged with corner mark, current ring). */
export interface CellState {
  number: number;
  answered: boolean;
  flagged: boolean;
  current: boolean;
  /** "Question 5, answered, flagged, current" (state is never colour alone). */
  aria: string;
  /** Which fill the cell uses. Flagged wins over answered, as drawn. */
  tone: 'flagged' | 'answered' | 'open';
}

export function cellState(q: ExamQuestion, answers: LocalAnswers, currentId: string | undefined, withCurrentInAria: boolean): CellState {
  const a = answers[q.id];
  const answered = !!a && a.selected.length > 0;
  const flagged = !!a?.flagged;
  const current = q.id === currentId;
  return {
    number: q.number,
    answered,
    flagged,
    current,
    tone: flagged ? 'flagged' : answered ? 'answered' : 'open',
    aria: `Question ${q.number}${answered ? ', answered' : ', not answered'}${flagged ? ', flagged' : ''}${withCurrentInAria && current ? ', current' : ''}`,
  };
}

/** Pick an option. Single-answer: choose it. Multiple-select: toggle it (interim behaviour, no new visuals; C3/C37). */
export function nextSelection(q: Pick<ExamQuestion, 'multiple'>, current: string[], key: string): string[] {
  if (!q.multiple) return [key];
  return current.includes(key) ? current.filter((k) => k !== key) : [...current, key].sort();
}

export function firstUnansweredIndex(questions: ExamQuestion[], answers: LocalAnswers): number {
  const i = questions.findIndex((q) => !(answers[q.id]?.selected.length));
  return i;
}

/** The header status line: "All answers saved" or "N answers waiting to save". */
export function savedLabel(s: Pick<EngineSnapshot, 'pending' | 'waiting'>): { waiting: boolean; text: string } {
  if (s.waiting && s.pending > 0) return { waiting: true, text: `${plural(s.pending, 'answer')} waiting to save` };
  return { waiting: false, text: 'All answers saved' };
}

export function caseFor(q: ExamQuestion | undefined, cases: ExamCase[]): ExamCase | null {
  if (!q?.caseId) return null;
  return cases.find((c) => c.id === q.caseId) ?? null;
}

/** "36–45" from the case's question numbers. */
export function caseRange(c: Pick<ExamCase, 'questionNumbers'>): string {
  const n = c.questionNumbers;
  if (n.length === 0) return '';
  const lo = Math.min(...n);
  const hi = Math.max(...n);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/** "2 of 10" position of a question inside its case. */
export function casePosition(q: ExamQuestion, c: ExamCase): { index: number; total: number } {
  const i = c.questionNumbers.indexOf(q.number);
  return { index: i + 1, total: c.questionNumbers.length };
}

/** Marks as drawn on case questions: "2.5 marks" / "1 mark". */
export function marksLabel(marks: number): string {
  const n = Number.isInteger(marks) ? String(marks) : String(Math.round(marks * 100) / 100);
  return `${n} ${marks === 1 ? 'mark' : 'marks'}`;
}
