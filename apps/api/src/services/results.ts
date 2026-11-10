import type { Attempt, Country, MockTest, Prisma, PrismaClient } from '@prisma/client';
import { canStartMockTest, type GrantLike } from '../domain/access';
import { optionSeed, shuffleOptions, shuffleQuestions } from '../domain/optionOrder';
import {
  chooseLimit, scoreQuestion, WEAK_TOPIC_CUTOFF_PERCENT, weakTopics, type QuestionPayload, type ScorableQuestion, type TopicResult,
} from '../domain/scoring';
import { conflict, forbidden, notFound } from '../http/errors';
import { attemptTitle, startAttempt, type Ctx, type Viewer } from './attempts';

/** Dashboard split: ≥ 70% reads as "Strong", the rest as "Needs work". (Results screen flags < 60% as a weak area.) */
export const STRONG_TOPIC_CUTOFF_PERCENT = 70;
export const PRACTICE_SET_SIZE = 15;
export const MIN_PRACTICE_QUESTIONS = 3;
/** Practice sets are untimed; this only bounds how long an abandoned one stays open. */
export const PRACTICE_SAFETY_LIMIT_MINUTES = 12 * 60;

type AttemptWithTest = Attempt & { mockTest: MockTest };

const payloadOf = (q: { payload: Prisma.JsonValue }) => q.payload as unknown as QuestionPayload;
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

const finished = (a: Attempt) => a.status !== 'IN_PROGRESS';
export function assertFinished(a: Attempt) {
  if (!finished(a)) throw conflict('attempt_in_progress');
}

const timeSpentSeconds = (a: Attempt) =>
  a.submittedAt ? Math.max(0, Math.min(a.durationSeconds, Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000))) : null;

async function showExplanations(prisma: PrismaClient, isFree: boolean) {
  if (!isFree) return true;
  const s = await prisma.setting.findUnique({ where: { key: 'free.showExplanationsOnResults' } });
  return s?.value !== false;
}

// ───────────────────────── Results

export async function buildResult(ctx: Ctx, a: AttemptWithTest, reviewFirstLimit = 3) {
  const { prisma } = ctx;
  // Numbered in the order this attempt showed them.
  const questions = shuffleQuestions(await prisma.question.findMany({
    where: a.questionIds.length > 0 ? { id: { in: a.questionIds } } : { mockTestId: a.mockTestId, status: 'PUBLISHED' },
    orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    include: { topic: { select: { id: true, name: true } } },
  }), a.id);
  const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: a.id } });
  const byQ = new Map(answers.map((x) => [x.questionId, x]));
  const negative = Number(a.mockTest.negativeMarkPerWrong);

  let correct = 0, incorrect = 0, unanswered = 0;
  const wrong: { number: number; q: (typeof questions)[number]; selected: string[] }[] = [];
  questions.forEach((q, i) => {
    const selected = byQ.get(q.id)?.selected ?? [];
    const s = scoreQuestion(scorable(q), selected, negative);
    if (s.state === 'correct') correct++;
    else if (s.state === 'unanswered') unanswered++;
    else { incorrect++; wrong.push({ number: i + 1, q, selected }); }
  });

  const topics = ((a.topicBreakdown as unknown as TopicResult[] | null) ?? [])
    .map((t) => ({ ...t, weak: t.percent < WEAK_TOPIC_CUTOFF_PERCENT }))
    .sort((x, y) => y.percent - x.percent || x.topicName.localeCompare(y.topicName));
  const weakest = weakTopics(topics)[0] ?? null;

  // Same person, same test, earlier finished attempts → comparison and the mini history chart.
  const owner: Prisma.AttemptWhereInput = a.userId ? { userId: a.userId } : { userId: null, guestToken: a.guestToken };
  const history = a.kind === 'FULL'
    ? await prisma.attempt.findMany({
        where: { mockTestId: a.mockTestId, kind: 'FULL', status: { not: 'IN_PROGRESS' }, submittedAt: { not: null }, ...owner },
        orderBy: { submittedAt: 'asc' },
      })
    : [];
  const idx = history.findIndex((h) => h.id === a.id);
  const previous = idx > 0 ? history[idx - 1]! : null;
  const percent = num(a.percent) ?? 0;
  const prevPercent = previous ? num(previous.percent) : null;

  // "Review these first": wrong answers, weakest topics first, then by question number.
  const weakOrder = new Map(weakTopics(topics).map((t, i) => [t.topicId, i]));
  const reviewFirst = [...wrong]
    .sort((x, y) => (weakOrder.get(x.q.topicId) ?? 99) - (weakOrder.get(y.q.topicId) ?? 99) || x.number - y.number)
    .slice(0, reviewFirstLimit)
    .map(({ number, q, selected }) => {
      const p = payloadOf(q);
      const text = (keys: string[]) => keys.map((k) => p.options.find((o) => o.key === k)?.text ?? k);
      return { number, questionId: q.id, stem: q.stem, topic: q.topic.name, yourAnswer: selected.length ? text(selected) : null, correctAnswer: text(p.correct) };
    });

  const passMark = a.mockTest.passMarkPercent !== null && a.mockTest.passMarkSource
    ? { percent: Number(a.mockTest.passMarkPercent), source: a.mockTest.passMarkSource } : null;

  return {
    attempt: {
      id: a.id, kind: a.kind, status: a.status, autoSubmitted: a.status === 'AUTO_SUBMITTED',
      startedAt: a.startedAt, submittedAt: a.submittedAt, timeSpentSeconds: timeSpentSeconds(a),
    },
    mockTest: { slug: a.mockTest.slug, title: await attemptTitle(prisma, a), countryCode: a.mockTest.countryCode, isFree: a.mockTest.isFree },
    score: { marks: num(a.scoreMarks) ?? 0, totalMarks: num(a.totalMarks) ?? 0, percent },
    counts: { total: questions.length, correct, incorrect, unanswered },
    passMark,
    noOfficialPassMark: !passMark,
    comparison: previous
      ? {
          previousAttemptId: previous.id,
          previousPercent: prevPercent,
          previousSubmittedAt: previous.submittedAt,
          deltaPoints: prevPercent === null ? null : Math.round((percent - prevPercent) * 100) / 100,
          previousTimeSpentSeconds: timeSpentSeconds(previous),
        }
      : null,
    history: history.map((h) => ({ attemptId: h.id, submittedAt: h.submittedAt, percent: num(h.percent), current: h.id === a.id })).slice(-5),
    topics: topics.map((t) => ({
      topicId: t.topicId, name: t.topicName, correct: t.correct, total: t.total,
      marks: t.marks, marksAvailable: t.marksAvailable, percent: t.percent, weak: t.weak,
    })),
    weakestTopic: weakest && { topicId: weakest.topicId, name: weakest.topicName, percent: weakest.percent },
    reviewFirst,
    incorrectCount: incorrect,
    // Guests are offered "Save my result"; signed-in users already have it.
    isGuest: !a.userId,
    // The candidate's optional feedback on this exam (null until they send some).
    feedback: await prisma.examFeedback.findUnique({ where: { attemptId: a.id }, select: { rating: true, comment: true } }),
    canPractice: topics.some((t) => t.weak),
    // Edge states of the results screen.
    edge: {
      noneAnswered: questions.length > 0 && unanswered === questions.length,
      perfect: questions.length > 0 && correct === questions.length,
      noWeakAreas: topics.length > 0 && !topics.some((t) => t.weak),
      allTopicsStrong: topics.length > 0 && topics.every((t) => t.percent >= STRONG_TOPIC_CUTOFF_PERCENT),
    },
  };
}

function scorable(q: { id: string; type: ScorableQuestion['type']; payload: Prisma.JsonValue; marks: Prisma.Decimal; topic: { id: string; name: string } }): ScorableQuestion {
  return { id: q.id, type: q.type, payload: payloadOf(q), marks: Number(q.marks), topicId: q.topic.id, topicName: q.topic.name };
}

// ───────────────────────── Review

export const REVIEW_FILTERS = ['incorrect', 'flagged', 'unanswered', 'all'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export async function buildReview(ctx: Ctx, a: AttemptWithTest, filter: ReviewFilter) {
  const { prisma } = ctx;
  // Same order (and numbers) the exam showed.
  const questions = shuffleQuestions(await prisma.question.findMany({
    where: a.questionIds.length > 0 ? { id: { in: a.questionIds } } : { mockTestId: a.mockTestId, status: 'PUBLISHED' },
    orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    include: { topic: { select: { id: true, name: true } }, mockTest: { select: { isFree: true } } },
  }), a.id);
  const answers = new Map((await prisma.attemptAnswer.findMany({ where: { attemptId: a.id } })).map((x) => [x.questionId, x]));
  const negative = Number(a.mockTest.negativeMarkPerWrong);
  const caseIds = [...new Set(questions.map((q) => q.caseId).filter((x): x is string => !!x))];
  const cases = caseIds.length ? await prisma.case.findMany({ where: { id: { in: caseIds } } }) : [];
  const explain = await showExplanations(prisma, a.mockTest.isFree);

  const all = questions.map((q, i) => {
    const row = answers.get(q.id);
    const selected = row?.selected ?? [];
    const p = payloadOf(q);
    const s = scoreQuestion(scorable(q), selected, negative);
    return {
      number: i + 1,
      id: q.id,
      topic: q.topic.name,
      type: q.type,
      multiple: q.type === 'MULTIPLE_SELECT',
      /** "Choose N" as the exam showed it (null for single-answer questions). */
      choose: q.type === 'MULTIPLE_SELECT' ? chooseLimit(p) : null,
      status: (s.state === 'correct' ? 'correct' : s.state === 'unanswered' ? 'unanswered' : s.state === 'partial' ? 'partial' : 'incorrect') as 'correct' | 'incorrect' | 'partial' | 'unanswered',
      flagged: row?.flagged ?? false,
      stem: q.stem,
      // Same order the candidate saw in the exam.
      options: shuffleOptions(p.options, optionSeed(a.id, q.id)).map((o) => ({ key: o.key, text: o.text, isCorrect: p.correct.includes(o.key), isYourPick: selected.includes(o.key) })),
      yourAnswer: selected,
      marks: Number(q.marks),
      marksAwarded: Math.max(0, s.marksAwarded),
      explanation: explain ? q.explanation : null,
      caseId: q.caseId,
    };
  });

  // Partly correct answers belong under "Incorrect" — they were not fully right.
  const isIncorrect = (x: (typeof all)[number]) => x.status === 'incorrect' || x.status === 'partial';
  const counts = {
    incorrect: all.filter(isIncorrect).length,
    flagged: all.filter((x) => x.flagged).length,
    unanswered: all.filter((x) => x.status === 'unanswered').length,
    all: all.length,
  };
  const items = all.filter((x) =>
    filter === 'all' ? true : filter === 'flagged' ? x.flagged : filter === 'unanswered' ? x.status === 'unanswered' : isIncorrect(x));

  return {
    attempt: { id: a.id, kind: a.kind, status: a.status },
    mockTest: { slug: a.mockTest.slug, title: await attemptTitle(prisma, a) },
    filter,
    counts,
    items,
    // The jump grid always covers every question, whatever the filter: ✕ incorrect, – not answered.
    grid: all.map((x) => ({ number: x.number, questionId: x.id, status: x.status, flagged: x.flagged })),
    cases: cases.map((c) => ({
      id: c.id, title: c.title, passage: c.passage, tables: c.tables, notes: c.notes,
      questionNumbers: all.filter((x) => x.caseId === c.id).map((x) => x.number),
    })),
  };
}

// ───────────────────────── Practice sets

interface PracticeInput {
  country: Country;
  viewer: Viewer;
  topicIds: string[];
  limit?: number;
}

/** Standalone questions, from tests the viewer can open, in the chosen topics. */
export async function loadPracticePool(ctx: Ctx, input: { country: Country; viewer: Viewer; topicIds: string[] }) {
  const { prisma, now } = ctx;
  const { country, viewer, topicIds } = input;
  const at = now();
  const grants: GrantLike[] = viewer.user
    ? (await prisma.accessGrant.findMany({ where: { userId: viewer.user.id, countryCode: country.code, endsAt: { gt: at } } }))
        .map((g) => ({ countryCode: g.countryCode, startsAt: g.startsAt, endsAt: g.endsAt, status: g.status }))
    : [];
  const pool = await prisma.question.findMany({
    where: {
      topicId: { in: topicIds }, status: 'PUBLISHED', caseId: null, // case questions need their passage; practice stays standalone
      mockTest: { countryCode: country.code, status: 'PUBLISHED' },
    },
    include: { mockTest: true },
  });
  return pool.filter((q) => canStartMockTest(q.mockTest, country.code, grants, at).allowed);
}

/**
 * Builds a short practice set from chosen (weak) topics. Only questions from tests the viewer can
 * actually open are used — a free-only visitor never gets paid content through practice.
 * Priority: questions the viewer got wrong or skipped before → never seen → answered correctly.
 */
export async function createPracticeAttempt(ctx: Ctx, input: PracticeInput) {
  const { prisma } = ctx;
  const { country, viewer, topicIds } = input;
  if (viewer.user && viewer.user.countryCode !== country.code) throw forbidden('country_mismatch');
  if (topicIds.length === 0) throw conflict('no_topics');

  const allowed = await loadPracticePool(ctx, { country, viewer, topicIds });

  const owner: Prisma.AttemptAnswerWhereInput['attempt'] = viewer.user
    ? { userId: viewer.user.id, status: { not: 'IN_PROGRESS' } }
    : { userId: null, guestToken: { in: viewer.guestTokens }, status: { not: 'IN_PROGRESS' } };
  const past = viewer.user || viewer.guestTokens.length > 0
    ? await prisma.attemptAnswer.findMany({ where: { questionId: { in: allowed.map((q) => q.id) }, attempt: owner }, select: { questionId: true, selected: true, isCorrect: true } })
    : [];
  const rank = new Map<string, number>(); // lower = show first
  for (const q of allowed) rank.set(q.id, 1);
  for (const r of past) rank.set(r.questionId, r.isCorrect === true ? 2 : 0);

  const shuffled = [...allowed].sort(() => Math.random() - 0.5);
  const picked = shuffled.sort((x, y) => rank.get(x.id)! - rank.get(y.id)!).slice(0, input.limit ?? PRACTICE_SET_SIZE);
  if (picked.length < MIN_PRACTICE_QUESTIONS) throw conflict('not_enough_questions');

  // The attempt hangs off the test contributing most questions; its own question list is authoritative.
  const counts = new Map<string, number>();
  for (const q of picked) counts.set(q.mockTestId, (counts.get(q.mockTestId) ?? 0) + 1);
  const anchorId = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]![0];
  const anchor = picked.find((q) => q.mockTestId === anchorId)!.mockTest;
  // The designed practice runner is untimed. The attempt keeps a long safety limit so it is eventually closed.

  const { attempt, guestToken } = await startAttempt(ctx, {
    country, test: { ...anchor, durationMinutes: PRACTICE_SAFETY_LIMIT_MINUTES }, viewer, kind: 'PRACTICE', questionIds: picked.map((q) => q.id),
  });
  return { attempt, guestToken, questionCount: picked.length, minutes: null as number | null, untimed: true };
}

/** Topics to practise from a finished attempt: its weak areas (lowest first). */
export async function weakTopicIdsFor(a: Attempt): Promise<{ topicId: string; name: string; percent: number }[]> {
  const topics = (a.topicBreakdown as unknown as TopicResult[] | null) ?? [];
  return weakTopics(topics).map((t) => ({ topicId: t.topicId, name: t.topicName, percent: t.percent }));
}

// ───────────────────────── Practice feedback

/** Practice mode only: reveal the right answer + explanation for a question the candidate has answered. */
export async function checkPracticeAnswer(ctx: Ctx, a: AttemptWithTest, questionId: string) {
  if (a.kind !== 'PRACTICE') throw forbidden('not_a_practice_attempt');
  if (!a.questionIds.includes(questionId)) throw notFound('unknown_question');
  const [q, row] = await Promise.all([
    ctx.prisma.question.findUniqueOrThrow({ where: { id: questionId }, include: { topic: { select: { id: true, name: true } }, mockTest: { select: { isFree: true } } } }),
    ctx.prisma.attemptAnswer.findUnique({ where: { attemptId_questionId: { attemptId: a.id, questionId } } }),
  ]);
  // No peeking: the answer must be saved first.
  if (!row || row.selected.length === 0) throw conflict('answer_first');
  const p = payloadOf(q);
  const s = scoreQuestion(scorable(q), row.selected, 0);
  return {
    questionId,
    state: s.state,
    correct: p.correct,
    yourAnswer: row.selected,
    explanation: (await showExplanations(ctx.prisma, q.mockTest.isFree)) ? q.explanation : null,
  };
}
