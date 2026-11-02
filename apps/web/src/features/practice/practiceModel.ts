import type { ExamQuestion, PracticeCheckResponse } from '../../api/types';
import { pickOption } from '../exam/examModel';

/**
 * The practice runner as a state machine (Practice.dc, PracticePhone.dc): untimed; pick -> "Check answer" -> feedback
 * and explanation -> "Next question"; "End practice" (or the last question) -> summary.
 */
export interface PracticeState {
  index: number;
  /** What the user has picked, per question id (not yet checked ones included). */
  picked: Record<string, string[]>;
  /** Feedback from the API, per question id. A checked question can no longer change. */
  checked: Record<string, PracticeCheckResponse>;
  /** The last pick was refused because "Choose N" was reached. */
  blocked: boolean;
  finished: boolean;
}

export type PracticeAction =
  | { type: 'pick'; question: Pick<ExamQuestion, 'id' | 'multiple' | 'choose'>; key: string }
  | { type: 'checked'; result: PracticeCheckResponse }
  | { type: 'next'; total: number }
  | { type: 'end' };

export function initialPracticeState(questions: Pick<ExamQuestion, 'id'>[], saved: Record<string, { selected: string[] }>): PracticeState {
  const first = questions.findIndex((q) => !(saved[q.id]?.selected.length));
  const picked: Record<string, string[]> = {};
  for (const q of questions) if (saved[q.id]?.selected.length) picked[q.id] = saved[q.id]!.selected;
  return { index: first >= 0 ? first : 0, picked, checked: {}, blocked: false, finished: false };
}

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case 'pick': {
      const id = action.question.id;
      if (state.checked[id] || state.finished) return state; // after "Check answer" the options are locked
      const { selected, blocked } = pickOption(action.question, state.picked[id] ?? [], action.key);
      return { ...state, picked: { ...state.picked, [id]: selected }, blocked };
    }
    case 'checked':
      return { ...state, checked: { ...state.checked, [action.result.questionId]: action.result }, blocked: false };
    case 'next':
      return state.index >= action.total - 1 ? { ...state, finished: true } : { ...state, index: state.index + 1, blocked: false };
    case 'end':
      return { ...state, finished: true };
  }
}

/** "Check answer" needs at least one pick, and only works once per question. */
export const canCheck = (state: PracticeState, questionId: string) => (state.picked[questionId]?.length ?? 0) > 0 && !state.checked[questionId];

/** Progress bar: questions done before this one, as in the artboard (0 % on the first). */
export const practiceProgress = (index: number, total: number) => (total <= 0 ? 0 : Math.round((index / total) * 100));

/** "You answered 4 questions ... and got 3 right": counted from the questions that were checked. */
export function practiceSummary(state: PracticeState): { answered: number; right: number } {
  const results = Object.values(state.checked);
  return { answered: results.length, right: results.filter((r) => r.state === 'correct').length };
}

export type FeedbackTone = 'correct' | 'incorrect' | 'partial';

/** The feedback panel: "Correct", "Not quite — the answer is B", or for multiple-select "Partly correct". */
export function feedbackFor(result: Pick<PracticeCheckResponse, 'state' | 'correct'>): { title: string; tone: FeedbackTone } {
  if (result.state === 'correct') return { title: 'Correct', tone: 'correct' };
  if (result.state === 'partial') return { title: 'Partly correct', tone: 'partial' };
  const keys = [...result.correct].sort().join(', ');
  return { title: `Not quite — the answer ${result.correct.length === 1 ? 'is' : 'are'} ${keys}`, tone: 'incorrect' };
}

/** The tag at the end of an option after checking: "✓ Correct" on a right option, "✕ Your answer" on a wrong pick. */
export function optionTag(checked: Pick<PracticeCheckResponse, 'correct'> | undefined, key: string, picked: string[]): { text: string; kind: 'right' | 'wrong' } | null {
  if (!checked) return null;
  if (checked.correct.includes(key)) return { text: '✓ Correct', kind: 'right' };
  if (picked.includes(key)) return { text: '✕ Your answer', kind: 'wrong' };
  return null;
}

/** "Statistics & probability" / "A and B" / "A, B and C". */
export function joinNames(names: string[]): string {
  const list = [...new Set(names)];
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** The topic with most questions in the set: "Practise 15 more" practises it again. */
export function dominantTopic(questions: Pick<ExamQuestion, 'topic'>[]): { id: string; name: string } | null {
  const counts = new Map<string, { id: string; name: string; n: number }>();
  for (const q of questions) {
    const c = counts.get(q.topic.id) ?? { id: q.topic.id, name: q.topic.name, n: 0 };
    c.n += 1;
    counts.set(q.topic.id, c);
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return top ? { id: top.id, name: top.name } : null;
}
