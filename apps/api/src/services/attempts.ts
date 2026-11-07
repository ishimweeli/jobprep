import { randomBytes } from 'node:crypto';
import type { Attempt, Country, MockTest, Prisma, PrismaClient } from '@prisma/client';
import { canStartMockTest, type GrantLike } from '../domain/access';
import { chooseLimit, scoreAttempt, type QuestionPayload, type ScorableQuestion } from '../domain/scoring';
import { deadlineFor, SAVE_GRACE_SECONDS, timerState } from '../domain/timer';
import { conflict, forbidden, HttpError, notFound, unauthorized } from '../http/errors';

/**
 * The exam engine. Rules that matter:
 *  - the server owns the clock: deadline = startedAt + duration, remaining time is always computed here
 *  - every change is stored with the time the candidate made it; per field, the latest change wins
 *    (offline queues replayed out of order, or two devices, never overwrite newer data)
 *  - a change made before the deadline is still accepted for a short window after it, so answers given
 *    while offline during time-up are kept ("Nothing you answered was lost")
 *  - finalising is idempotent and locks the attempt row, so submit / auto-submit / sweeper can race safely
 *  - nothing returned while IN_PROGRESS reveals correct answers or explanations
 */

export const MAX_CHANGES_PER_REQUEST = 100;
/** After an automatic submit, offline answers that were made in time may still sync for this long. */
export const LATE_SYNC_WINDOW_SECONDS = 600;

export interface Ctx {
  prisma: PrismaClient;
  now: () => Date;
}

export interface Viewer {
  user: { id: string; countryCode: string } | null;
  guestTokens: string[];
}

export interface AnswerChange {
  questionId: string;
  selected?: string[];
  flagged?: boolean;
  at?: Date;
}

export type ChangeResult = {
  questionId: string;
  status: 'saved' | 'stale' | 'rejected';
  error?: 'unknown_question' | 'invalid_option' | 'too_many_choices' | 'after_deadline';
};

type Tx = Prisma.TransactionClient;

const questionInclude = {
  topic: { select: { id: true, name: true } },
  section: { select: { name: true } },
} satisfies Prisma.QuestionInclude;

const payloadOf = (q: { payload: Prisma.JsonValue }) => q.payload as unknown as QuestionPayload;

export function ownsAttempt(a: Pick<Attempt, 'userId' | 'guestToken'>, viewer: Viewer): boolean {
  if (viewer.user && a.userId === viewer.user.id) return true;
  return !!a.guestToken && viewer.guestTokens.includes(a.guestToken);
}

export async function getOwnedAttempt(ctx: Ctx, id: string, viewer: Viewer) {
  const attempt = await ctx.prisma.attempt.findUnique({ where: { id }, include: { mockTest: true } });
  // 404 (not 403) so attempt ids can't be probed.
  if (!attempt || !ownsAttempt(attempt, viewer)) throw notFound('attempt_not_found');
  return attempt;
}

async function scopeQuestions(db: Tx | PrismaClient, attempt: Pick<Attempt, 'mockTestId' | 'questionIds'>) {
  return db.question.findMany({
    where: {
      status: 'PUBLISHED',
      // An explicit question list (a practice set, which may span several tests) is authoritative.
      ...(attempt.questionIds.length > 0 ? { id: { in: attempt.questionIds } } : { mockTestId: attempt.mockTestId }),
    },
    orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    include: questionInclude,
  });
}

/** Title shown for an attempt: practice sets are named after their topics. */
export async function attemptTitle(prisma: PrismaClient, a: Attempt & { mockTest: MockTest }): Promise<string> {
  if (a.kind !== 'PRACTICE') return a.mockTest.title;
  const qs = await prisma.question.findMany({ where: { id: { in: a.questionIds } }, select: { topic: { select: { name: true } } } });
  const names = [...new Set(qs.map((q) => q.topic.name))];
  return names.length === 1 ? `${names[0]} practice set` : `Practice set: ${names.slice(0, 2).join(', ')}${names.length > 2 ? '…' : ''}`;
}

const lockAttempt = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM "Attempt" WHERE id = ${id} FOR UPDATE`;

// ───────────────────────── Start / resume

export async function startAttempt(
  ctx: Ctx,
  input: { country: Country; test: MockTest; viewer: Viewer; kind?: 'FULL' | 'PRACTICE'; questionIds?: string[] },
) {
  const { prisma, now } = ctx;
  const { country, test, viewer } = input;
  const at = now();

  if (viewer.user && viewer.user.countryCode !== country.code) {
    const own = await prisma.country.findUnique({ where: { code: viewer.user.countryCode }, select: { code: true, name: true } });
    throw new HttpError(403, 'country_mismatch', {
      requestedCountry: { code: country.code, name: country.name }, userCountry: own, test: { slug: test.slug, title: test.title },
    });
  }

  const grants: GrantLike[] = viewer.user
    ? (await prisma.accessGrant.findMany({
        where: { userId: viewer.user.id, countryCode: country.code, endsAt: { gt: at } },
      })).map((g) => ({ countryCode: g.countryCode, startsAt: g.startsAt, endsAt: g.endsAt, status: g.status }))
    : [];
  const decision = canStartMockTest(test, country.code, grants, at);
  if (!decision.allowed) {
    if (decision.reason === 'needs_full_access') {
      // A guest must sign up before paying; a signed-in user goes to checkout.
      throw viewer.user ? new HttpError(402, 'full_access_required') : unauthorized('sign_in_required');
    }
    throw forbidden(decision.reason);
  }

  const kind = input.kind ?? 'FULL';
  const questionIds = input.questionIds ?? [];
  const qCount = await prisma.question.count({
    where: { status: 'PUBLISHED', ...(questionIds.length > 0 ? { id: { in: questionIds } } : { mockTestId: test.id }) },
  });
  if (qCount === 0) throw conflict('no_questions');

  // One running attempt per person per test: refreshing or reopening the link resumes it.
  if (kind === 'FULL') {
    const owner: Prisma.AttemptWhereInput = viewer.user
      ? { userId: viewer.user.id }
      : { userId: null, guestToken: { in: viewer.guestTokens } };
    if (viewer.user || viewer.guestTokens.length > 0) {
      const running = await prisma.attempt.findFirst({
        where: { mockTestId: test.id, kind: 'FULL', status: 'IN_PROGRESS', ...owner },
        orderBy: { startedAt: 'desc' },
      });
      if (running) {
        if (at < running.deadlineAt) return { attempt: running, resumed: true, guestToken: running.userId ? null : running.guestToken };
        await finalizeIfExpired(ctx, running.id); // it ran out while nobody was looking: close it, start fresh
      }
    }
  }

  const guestToken = viewer.user ? null : (viewer.guestTokens[0] ?? randomBytes(24).toString('base64url'));
  const durationSeconds = test.durationMinutes * 60;
  const attempt = await prisma.attempt.create({
    data: {
      mockTestId: test.id,
      countryCode: country.code,
      userId: viewer.user?.id ?? null,
      guestToken,
      kind,
      questionIds,
      status: 'IN_PROGRESS',
      startedAt: at,
      durationSeconds,
      deadlineAt: deadlineFor(at, durationSeconds),
    },
  });
  return { attempt, resumed: false, guestToken };
}

// ───────────────────────── State

export async function buildState(ctx: Ctx, attemptId: string) {
  const { prisma, now } = ctx;
  const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { mockTest: true } });
  const [questions, answers] = await Promise.all([
    scopeQuestions(prisma, attempt),
    prisma.attemptAnswer.findMany({ where: { attemptId } }),
  ]);
  const caseIds = [...new Set(questions.map((q) => q.caseId).filter((x): x is string => !!x))];
  const cases = caseIds.length
    ? await prisma.case.findMany({ where: { id: { in: caseIds } }, orderBy: { sortOrder: 'asc' } })
    : [];

  const numbered = questions.map((q, i) => ({ q, number: i + 1 }));
  const answerMap = Object.fromEntries(answers.map((a) => [a.questionId, { selected: a.selected, flagged: a.flagged }]));
  const finished = attempt.status !== 'IN_PROGRESS';

  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      kind: attempt.kind,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      durationSeconds: attempt.durationSeconds,
      submittedAt: attempt.submittedAt,
      mockTest: {
        slug: attempt.mockTest.slug,
        title: await attemptTitle(prisma, attempt),
        countryCode: attempt.mockTest.countryCode,
      },
    },
    timer: timerState(attempt, now()),
    questions: numbered.map(({ q, number }) => {
      const p = payloadOf(q);
      return {
        id: q.id,
        number,
        sectionName: q.section.name,
        topic: q.topic,
        type: q.type,
        multiple: q.type === 'MULTIPLE_SELECT',
        /** "Choose N" for multiple-select questions; null otherwise. */
        choose: q.type === 'MULTIPLE_SELECT' ? chooseLimit(p) : null,
        stem: q.stem,
        // Option text only: never which ones are correct.
        options: p.options.map((o) => ({ key: o.key, text: o.text })),
        marks: Number(q.marks),
        caseId: q.caseId,
      };
    }),
    cases: cases.map((c) => ({
      id: c.id,
      title: c.title,
      passage: c.passage,
      tables: c.tables,
      notes: c.notes,
      questionNumbers: numbered.filter((x) => x.q.caseId === c.id).map((x) => x.number),
    })),
    answers: answerMap,
    counts: {
      total: questions.length,
      answered: answers.filter((a) => a.selected.length > 0).length,
      flagged: answers.filter((a) => a.flagged).length,
    },
    // After the attempt ends the web app moves on to the results screen.
    finished,
  };
}

// ───────────────────────── Finalise (submit / auto-submit / rescore)

async function scoreAndStore(tx: Tx, attempt: Attempt & { mockTest: MockTest }, status: 'SUBMITTED' | 'AUTO_SUBMITTED', submittedAt: Date) {
  const [questions, answers] = await Promise.all([
    scopeQuestions(tx, attempt),
    tx.attemptAnswer.findMany({ where: { attemptId: attempt.id } }),
  ]);
  const scorable: ScorableQuestion[] = questions.map((q) => ({
    id: q.id,
    type: q.type,
    payload: payloadOf(q),
    marks: Number(q.marks),
    topicId: q.topic.id,
    topicName: q.topic.name,
  }));
  const result = scoreAttempt(
    scorable,
    Object.fromEntries(answers.map((a) => [a.questionId, a.selected])),
    Number(attempt.mockTest.negativeMarkPerWrong),
  );

  for (const a of answers) {
    const s = result.perQuestion[a.questionId];
    if (!s) continue;
    await tx.attemptAnswer.update({
      where: { id: a.id },
      data: { isCorrect: s.state === 'unanswered' ? null : s.state === 'correct', marksAwarded: s.marksAwarded },
    });
  }
  return tx.attempt.update({
    where: { id: attempt.id },
    data: {
      status,
      submittedAt,
      scoreMarks: result.scoreMarks,
      totalMarks: result.totalMarks,
      percent: result.percent,
      topicBreakdown: result.topics as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Manual submit. Idempotent: submitting twice returns the first outcome. */
export async function submitAttempt(ctx: Ctx, attemptId: string, finalChanges: AnswerChange[] = []) {
  const { prisma, now } = ctx;
  if (finalChanges.length > 0) {
    try {
      await saveChanges(ctx, attemptId, finalChanges);
    } catch (e) {
      // Flushing the last queued answers must never block submitting.
      if (!(e instanceof HttpError)) throw e;
    }
  }
  return prisma.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId);
    const attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { mockTest: true } });
    if (attempt.status !== 'IN_PROGRESS') return attempt;
    const at = now();
    // Submitting after the deadline is an automatic submit at the deadline, not a late manual one.
    return at >= attempt.deadlineAt
      ? scoreAndStore(tx, attempt, 'AUTO_SUBMITTED', attempt.deadlineAt)
      : scoreAndStore(tx, attempt, 'SUBMITTED', at);
  }, { timeout: 15_000 });
}

/** Closes an attempt whose time has run out. Safe to call from anywhere, any number of times. */
export async function finalizeIfExpired(ctx: Ctx, attemptId: string): Promise<boolean> {
  const { prisma, now } = ctx;
  return prisma.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId);
    const attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { mockTest: true } });
    if (attempt.status !== 'IN_PROGRESS' || now() < attempt.deadlineAt) return false;
    await scoreAndStore(tx, attempt, 'AUTO_SUBMITTED', attempt.deadlineAt);
    return true;
  }, { timeout: 15_000 });
}

/** Background sweep: auto-submit everything that ran out, even if the candidate never came back. */
export async function sweepExpiredAttempts(ctx: Ctx): Promise<number> {
  const expired = await ctx.prisma.attempt.findMany({
    where: { status: 'IN_PROGRESS', deadlineAt: { lte: ctx.now() } },
    select: { id: true },
    take: 200,
  });
  let n = 0;
  for (const { id } of expired) {
    try {
      if (await finalizeIfExpired(ctx, id)) n++;
    } catch (e) {
      console.error('sweep failed for attempt', id, e);
    }
  }
  return n;
}

// ───────────────────────── Autosave

export async function saveChanges(ctx: Ctx, attemptId: string, changes: AnswerChange[]) {
  const { prisma, now } = ctx;

  return prisma.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId);
    let attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { mockTest: true } });
    const at = now();
    const graceEnd = new Date(attempt.deadlineAt.getTime() + SAVE_GRACE_SECONDS * 1000);

    // Long past the deadline and nobody closed it yet: close it now, then judge the changes as late syncs.
    if (attempt.status === 'IN_PROGRESS' && at > graceEnd) {
      await scoreAndStore(tx, attempt, 'AUTO_SUBMITTED', attempt.deadlineAt);
      attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { mockTest: true } });
    }
    if (attempt.status === 'SUBMITTED') throw conflict('attempt_closed');
    if (
      attempt.status === 'AUTO_SUBMITTED' &&
      at.getTime() > attempt.deadlineAt.getTime() + LATE_SYNC_WINDOW_SECONDS * 1000
    ) {
      throw conflict('attempt_closed');
    }

    const questions = await scopeQuestions(tx, attempt);
    const byId = new Map(questions.map((q) => [q.id, q]));
    const rows = new Map(
      (await tx.attemptAnswer.findMany({ where: { attemptId } })).map((a) => [a.questionId, a]),
    );
    const dirty = new Set<string>();
    const results: ChangeResult[] = [];

    for (const c of changes) {
      const q = byId.get(c.questionId);
      if (!q) { results.push({ questionId: c.questionId, status: 'rejected', error: 'unknown_question' }); continue; }

      // Trust the client's timestamp only within bounds: never in the future, never before the attempt began.
      const claimed = c.at ?? at;
      const effective = new Date(Math.max(attempt.startedAt.getTime(), Math.min(claimed.getTime(), at.getTime())));
      if (effective > graceEnd) { results.push({ questionId: c.questionId, status: 'rejected', error: 'after_deadline' }); continue; }

      let selected: string[] | undefined;
      if (c.selected !== undefined) {
        const keys = [...new Set(c.selected)];
        const valid = new Set(payloadOf(q).options.map((o) => o.key));
        const tooMany = q.type !== 'MULTIPLE_SELECT' && keys.length > 1;
        if (tooMany || keys.some((k) => !valid.has(k))) {
          results.push({ questionId: c.questionId, status: 'rejected', error: 'invalid_option' });
          continue;
        }
        // "Choose N": a multiple-select question accepts at most N picks.
        if (q.type === 'MULTIPLE_SELECT' && keys.length > chooseLimit(payloadOf(q))) {
          results.push({ questionId: c.questionId, status: 'rejected', error: 'too_many_choices' });
          continue;
        }
        selected = keys.sort();
      }

      const row = rows.get(c.questionId);
      let applied = false;
      const next = {
        selected: row?.selected ?? [],
        flagged: row?.flagged ?? false,
        selectedAt: row?.selectedAt ?? null,
        flaggedAt: row?.flaggedAt ?? null,
      };
      if (selected !== undefined && (!next.selectedAt || effective >= next.selectedAt)) {
        next.selected = selected; next.selectedAt = effective; applied = true;
      }
      if (c.flagged !== undefined && (!next.flaggedAt || effective >= next.flaggedAt)) {
        next.flagged = c.flagged; next.flaggedAt = effective; applied = true;
      }
      if (!applied) { results.push({ questionId: c.questionId, status: 'stale' }); continue; }

      const saved = await tx.attemptAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: c.questionId } },
        create: { attemptId, questionId: c.questionId, ...next, savedAt: at },
        update: { ...next, savedAt: at },
      });
      rows.set(c.questionId, saved);
      dirty.add(c.questionId);
      results.push({ questionId: c.questionId, status: 'saved' });
    }

    // A late sync changes the outcome: re-score, keeping the original auto-submit time.
    if (attempt.status === 'AUTO_SUBMITTED' && dirty.size > 0) {
      attempt = { ...(await scoreAndStore(tx, attempt, 'AUTO_SUBMITTED', attempt.submittedAt ?? attempt.deadlineAt)), mockTest: attempt.mockTest };
    }

    const all = [...rows.values()];
    return {
      results,
      savedAt: at,
      status: attempt.status,
      timer: timerState(attempt, at),
      counts: {
        total: questions.length,
        answered: all.filter((a) => a.selected.length > 0).length,
        flagged: all.filter((a) => a.flagged).length,
      },
    };
  }, { timeout: 15_000 });
}

// ───────────────────────── Resume prompt data

export async function listInProgress(ctx: Ctx, viewer: Viewer) {
  const { prisma, now } = ctx;
  const or: Prisma.AttemptWhereInput[] = [];
  if (viewer.user) or.push({ userId: viewer.user.id });
  if (viewer.guestTokens.length > 0) or.push({ guestToken: { in: viewer.guestTokens }, userId: null });
  if (or.length === 0) return [];

  const attempts = await prisma.attempt.findMany({
    where: { status: 'IN_PROGRESS', deadlineAt: { gt: now() }, OR: or },
    orderBy: { startedAt: 'desc' },
    include: {
      mockTest: { select: { slug: true, title: true, countryCode: true } },
      answers: { select: { selected: true } },
    },
  });
  const totals = await Promise.all(
    attempts.map((a) =>
      prisma.question.count({
        where: { status: 'PUBLISHED', ...(a.questionIds.length > 0 ? { id: { in: a.questionIds } } : { mockTestId: a.mockTestId }) },
      }),
    ),
  );
  return attempts.map((a, i) => ({
    id: a.id,
    kind: a.kind,
    startedAt: a.startedAt,
    mockTest: a.mockTest,
    total: totals[i]!,
    answered: a.answers.filter((x) => x.selected.length > 0).length,
    remainingSeconds: timerState(a, now()).remainingSeconds,
  }));
}
