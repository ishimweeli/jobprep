export type QuestionTypeCode = 'SINGLE_CHOICE' | 'MULTIPLE_SELECT' | 'CASE_BASED';

export interface QuestionPayload {
  options: { key: string; text: string }[];
  correct: string[];
  /** MULTIPLE_SELECT only. Defaults to ALL_OR_NOTHING. */
  scoring?: 'ALL_OR_NOTHING' | 'PARTIAL';
  /** MULTIPLE_SELECT only: "Choose N" — the most options a candidate may pick. Defaults to the number of correct options. */
  choose?: number;
}

/** The pick limit shown as "Choose N" and enforced on save. */
export function chooseLimit(p: QuestionPayload): number {
  return p.choose && p.choose >= 1 ? p.choose : p.correct.length;
}

export interface ScorableQuestion {
  id: string;
  type: QuestionTypeCode;
  payload: QuestionPayload;
  marks: number;
  topicId: string;
  topicName: string;
}

export interface QuestionScore {
  state: 'correct' | 'partial' | 'incorrect' | 'unanswered';
  marksAwarded: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One implementation per question type behind a single interface, so the exam engine never
 * branches on type. `negativePerWrong` is 0 unless the exam configures negative marking.
 */
export interface QuestionTypeHandler {
  score(q: ScorableQuestion, selected: string[], negativePerWrong: number): QuestionScore;
}

const unanswered: QuestionScore = { state: 'unanswered', marksAwarded: 0 };

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((k) => b.includes(k));
}

const singleChoice: QuestionTypeHandler = {
  score(q, selected, negativePerWrong) {
    if (selected.length === 0) return unanswered;
    const right = selected.length === 1 && q.payload.correct.includes(selected[0]!);
    return right
      ? { state: 'correct', marksAwarded: q.marks }
      : { state: 'incorrect', marksAwarded: -negativePerWrong };
  },
};

const multipleSelect: QuestionTypeHandler = {
  score(q, selected, negativePerWrong) {
    if (selected.length === 0) return unanswered;
    const correct = q.payload.correct;
    if (sameSet(selected, correct)) return { state: 'correct', marksAwarded: q.marks };

    if (q.payload.scoring === 'PARTIAL') {
      // Each correct pick earns marks/|correct|; each wrong pick removes the same share. Floor at 0.
      const share = q.marks / correct.length;
      const right = selected.filter((k) => correct.includes(k)).length;
      const wrong = selected.length - right;
      const marks = Math.max(0, round2((right - wrong) * share));
      if (marks > 0) return { state: 'partial', marksAwarded: marks };
    }
    return { state: 'incorrect', marksAwarded: -negativePerWrong };
  },
};

export const questionTypes: Record<QuestionTypeCode, QuestionTypeHandler> = {
  SINGLE_CHOICE: singleChoice,
  CASE_BASED: singleChoice,
  MULTIPLE_SELECT: multipleSelect,
};

export function scoreQuestion(
  q: ScorableQuestion,
  selected: string[],
  negativePerWrong = 0,
): QuestionScore {
  return questionTypes[q.type].score(q, selected, negativePerWrong);
}

export interface TopicResult {
  topicId: string;
  topicName: string;
  correct: number;
  total: number;
  marks: number;
  marksAvailable: number;
  percent: number;
}

export interface AttemptScore {
  scoreMarks: number;
  totalMarks: number;
  percent: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  perQuestion: Record<string, QuestionScore>;
  topics: TopicResult[];
}

export function scoreAttempt(
  questions: ScorableQuestion[],
  answers: Record<string, string[]>,
  negativePerWrong = 0,
): AttemptScore {
  const perQuestion: Record<string, QuestionScore> = {};
  const topics = new Map<string, TopicResult>();
  let scoreMarks = 0;
  let totalMarks = 0;
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;

  for (const q of questions) {
    const s = scoreQuestion(q, answers[q.id] ?? [], negativePerWrong);
    perQuestion[q.id] = s;
    scoreMarks += s.marksAwarded;
    totalMarks += q.marks;
    if (s.state === 'correct') correct++;
    else if (s.state === 'unanswered') unanswered++;
    else incorrect++; // partial and incorrect both count as "not fully correct"

    const t = topics.get(q.topicId) ?? {
      topicId: q.topicId,
      topicName: q.topicName,
      correct: 0,
      total: 0,
      marks: 0,
      marksAvailable: 0,
      percent: 0,
    };
    t.total++;
    t.marksAvailable += q.marks;
    t.marks += Math.max(0, s.marksAwarded);
    if (s.state === 'correct') t.correct++;
    topics.set(q.topicId, t);
  }

  scoreMarks = Math.max(0, round2(scoreMarks));
  const topicList = [...topics.values()].map((t) => ({
    ...t,
    marks: round2(t.marks),
    percent: t.marksAvailable === 0 ? 0 : round2((t.marks / t.marksAvailable) * 100),
  }));

  return {
    scoreMarks,
    totalMarks: round2(totalMarks),
    percent: totalMarks === 0 ? 0 : round2((scoreMarks / totalMarks) * 100),
    correct,
    incorrect,
    unanswered,
    perQuestion,
    topics: topicList,
  };
}

/** A topic is a "weak area" when its percentage is below the cut-off (default 60%). */
export const WEAK_TOPIC_CUTOFF_PERCENT = 60;

/** Lowest-scoring topics first. Used for "Review these first" and weak-area practice sets. */
export function weakTopics(topics: TopicResult[], cutoff = WEAK_TOPIC_CUTOFF_PERCENT): TopicResult[] {
  return topics
    .filter((t) => t.percent < cutoff)
    .sort((a, b) => a.percent - b.percent || b.total - a.total);
}
