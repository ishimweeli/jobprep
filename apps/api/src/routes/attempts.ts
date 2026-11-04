import { Router, type Request } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../http/errors';
import type { Ctx } from '../http/context';
import {
  buildState, finalizeIfExpired, getOwnedAttempt, listInProgress, MAX_CHANGES_PER_REQUEST,
  saveChanges, startAttempt, submitAttempt, type AnswerChange, type Viewer,
} from '../services/attempts';
import { canStartMockTest, type GrantLike } from '../domain/access';
import { timerState } from '../domain/timer';
import { langQuery, overlayLanguage } from '../services/translate';
import {
  assertFinished, buildResult, buildReview, checkPracticeAnswer, createPracticeAttempt, REVIEW_FILTERS, weakTopicIdsFor,
} from '../services/results';

/**
 * Guests identify their attempts with the `X-Guest-Token` header (a secret handed out when the attempt
 * started; the web app keeps it in localStorage). Signed-in users are identified by their session.
 */
export function viewerFromReq(req: Request): Viewer {
  const raw = req.get('x-guest-token') ?? '';
  const guestTokens = raw.split(',').map((t) => t.trim()).filter((t) => t.length >= 8 && t.length <= 100).slice(0, 20);
  return {
    user: req.user ? { id: req.user.id, countryCode: req.user.countryCode } : null,
    guestTokens,
  };
}

const changeSchema = z
  .object({
    questionId: z.string().min(1).max(40),
    selected: z.array(z.string().min(1).max(8)).max(8).optional(),
    flagged: z.boolean().optional(),
    /** When the candidate made the change (ISO). Optional; defaults to "now". */
    at: z.iso.datetime().optional(),
  })
  .refine((c) => c.selected !== undefined || c.flagged !== undefined, { message: 'selected or flagged required' });

const saveSchema = z.object({ changes: z.array(changeSchema).min(1).max(MAX_CHANGES_PER_REQUEST) });
const submitSchema = z.object({ changes: z.array(changeSchema).max(MAX_CHANGES_PER_REQUEST).optional() });

const toChanges = (list: z.infer<typeof changeSchema>[]): AnswerChange[] =>
  list.map((c) => ({ questionId: c.questionId, selected: c.selected, flagged: c.flagged, at: c.at ? new Date(c.at) : undefined }));

export function attemptsRouter(ctx: Ctx) {
  const router = Router();
  const { prisma } = ctx;

  /** Start (or resume) a mock test. Free tests need no account; paid ones need an active same-country grant. */
  router.post('/countries/:code/mock-tests/:slug/attempts', async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const country = await prisma.country.findUnique({ where: { code } });
    if (!country) throw notFound('country_not_found');
    if (country.status !== 'LIVE') throw notFound('country_not_available');
    const test = await prisma.mockTest.findFirst({
      where: { countryCode: code, slug: String(req.params.slug), status: 'PUBLISHED' },
    });
    if (!test) throw notFound('mock_test_not_found');

    const { attempt, resumed, guestToken } = await startAttempt(ctx, { country, test, viewer: viewerFromReq(req) });
    res.status(resumed ? 200 : 201).json({
      attemptId: attempt.id,
      resumed,
      // Only for guests: keep it, send it back as X-Guest-Token, and use it to "Save my result" later.
      guestToken,
      timer: timerState(attempt, ctx.now()),
    });
  });

  router.get('/attempts/in-progress', async (req, res) => {
    res.json({ attempts: await listInProgress(ctx, viewerFromReq(req)) });
  });

  /** Full state for the exam screen — also what a refresh or another device loads to resume. */
  router.get('/attempts/:id', async (req, res) => {
    const viewer = viewerFromReq(req);
    const lang = langQuery.parse(req.query.lang);
    await getOwnedAttempt(ctx, String(req.params.id), viewer);
    await finalizeIfExpired(ctx, String(req.params.id)); // opening an expired attempt shows "Time is up", not a stale clock
    const state = await buildState(ctx, String(req.params.id));
    const language = await overlayLanguage(prisma, lang, { questions: state.questions, cases: state.cases });

    // Reopening a finished attempt ("This attempt has ended"): can the person start a new one?
    let reopen = null;
    if (state.finished) {
      const attempt = await getOwnedAttempt(ctx, String(req.params.id), viewer);
      const test = attempt.mockTest;
      let canStartNew = false;
      let startNewReason: string | null = null;
      if (attempt.kind === 'PRACTICE') startNewReason = 'practice';
      else if (test.status !== 'PUBLISHED') startNewReason = 'unavailable';
      else {
        const grants: GrantLike[] = viewer.user
          ? (await prisma.accessGrant.findMany({ where: { userId: viewer.user.id, countryCode: test.countryCode, endsAt: { gt: ctx.now() } } }))
              .map((g) => ({ countryCode: g.countryCode, startsAt: g.startsAt, endsAt: g.endsAt, status: g.status }))
          : [];
        const decision = canStartMockTest(test, test.countryCode, grants, ctx.now());
        canStartNew = decision.allowed;
        startNewReason = decision.allowed ? null : decision.reason;
      }
      reopen = { ended: true, autoSubmitted: attempt.status === 'AUTO_SUBMITTED', canStartNew, startNewReason, mockTestSlug: test.slug, countryCode: test.countryCode };
    }
    res.json({ ...state, reopen, ...(language && { language }) });
  });

  /** Cheap clock resync for the display-only client timer. */
  router.get('/attempts/:id/timer', async (req, res) => {
    await getOwnedAttempt(ctx, String(req.params.id), viewerFromReq(req));
    await finalizeIfExpired(ctx, String(req.params.id));
    const a = await prisma.attempt.findUniqueOrThrow({ where: { id: String(req.params.id) } });
    res.json({ status: a.status, ...timerState(a, ctx.now()) });
  });

  /** Autosave: a batch of answer / flag changes. Safe to resend (idempotent), safe out of order. */
  router.put('/attempts/:id/answers', async (req, res) => {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('validation_error', { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    await getOwnedAttempt(ctx, String(req.params.id), viewerFromReq(req));
    res.json(await saveChanges(ctx, String(req.params.id), toChanges(parsed.data.changes)));
  });

  /** Submit. Optionally flushes the last queued changes first. Idempotent. */
  router.post('/attempts/:id/submit', async (req, res) => {
    const body = submitSchema.parse(req.body ?? {});
    await getOwnedAttempt(ctx, String(req.params.id), viewerFromReq(req));
    const done = await submitAttempt(ctx, String(req.params.id), toChanges(body.changes ?? []));
    const state = await buildState(ctx, done.id);
    res.json({
      status: done.status,
      autoSubmitted: done.status === 'AUTO_SUBMITTED',
      submittedAt: done.submittedAt,
      counts: state.counts,
      unanswered: state.counts.total - state.counts.answered,
      // Time is up screen: "submitted automatically with 47 of 50 questions answered. Nothing you answered was lost."
    });
  });

  // ───────────────────────── After the exam

  /** Score, counts, per-topic performance, comparison with the previous attempt, "review these first". */
  router.get('/attempts/:id/result', async (req, res) => {
    const attempt = await getOwnedAttempt(ctx, String(req.params.id), viewerFromReq(req));
    await finalizeIfExpired(ctx, attempt.id);
    const fresh = await getOwnedAttempt(ctx, attempt.id, viewerFromReq(req));
    assertFinished(fresh);
    res.json(await buildResult(ctx, fresh));
  });

  /** Answer review with correct answers and explanations. Filters: incorrect | flagged | unanswered | all. */
  router.get('/attempts/:id/review', async (req, res) => {
    const { filter } = z.object({ filter: z.enum(REVIEW_FILTERS).default('incorrect') }).parse(req.query);
    const lang = langQuery.parse(req.query.lang);
    const attempt = await getOwnedAttempt(ctx, String(req.params.id), viewerFromReq(req));
    await finalizeIfExpired(ctx, attempt.id);
    const fresh = await getOwnedAttempt(ctx, attempt.id, viewerFromReq(req));
    assertFinished(fresh);
    const review = await buildReview(ctx, fresh, filter);
    // The language note must cover the whole attempt, not just the filtered items: overlay every question of the grid via the items we hold.
    const language = await overlayLanguage(prisma, lang, { questions: review.items, cases: review.cases });
    res.json({ ...review, ...(language && { language }) });
  });

  /** "Practice Weak Areas": a short set built from this attempt's lowest-scoring topics. */
  router.post('/attempts/:id/practice', async (req, res) => {
    const attempt = await getOwnedAttempt(ctx, String(req.params.id), viewerFromReq(req));
    assertFinished(attempt);
    const weak = await weakTopicIdsFor(attempt);
    if (weak.length === 0) throw badRequest('no_weak_areas');
    const country = await prisma.country.findUniqueOrThrow({ where: { code: attempt.countryCode } });
    const out = await createPracticeAttempt(ctx, {
      country, viewer: viewerFromReq(req), topicIds: weak.slice(0, 3).map((t) => t.topicId),
    });
    res.status(201).json({ attemptId: out.attempt.id, guestToken: out.guestToken, questionCount: out.questionCount, minutes: out.minutes, untimed: out.untimed, topics: weak.slice(0, 3) });
  });

  /** Practice mode only: reveal the answer and explanation for a question you have just answered. */
  router.post('/attempts/:id/check', async (req, res) => {
    const { questionId } = z.object({ questionId: z.string().min(1).max(40) }).parse(req.body);
    const attempt = await getOwnedAttempt(ctx, String(req.params.id), viewerFromReq(req));
    res.json(await checkPracticeAnswer(ctx, attempt, questionId));
  });

  /** Dashboard "Start practice": a set for one chosen topic, in the caller's country. */
  router.post('/countries/:code/practice', async (req, res) => {
    const { topicId } = z.object({ topicId: z.string().min(1).max(40) }).parse(req.body);
    const code = String(req.params.code).toUpperCase();
    const country = await prisma.country.findUnique({ where: { code } });
    if (!country) throw notFound('country_not_found');
    if (country.status !== 'LIVE') throw notFound('country_not_available');
    const topic = await prisma.topic.findFirst({ where: { id: topicId, category: { countryCode: code } } });
    if (!topic) throw notFound('topic_not_found');
    const out = await createPracticeAttempt(ctx, { country, viewer: viewerFromReq(req), topicIds: [topic.id] });
    res.status(201).json({ attemptId: out.attempt.id, guestToken: out.guestToken, questionCount: out.questionCount, minutes: out.minutes, untimed: out.untimed, topics: [{ topicId: topic.id, name: topic.name }] });
  });

  /**
   * "Report a question": a candidate flags a question that looks wrong. It lands in the admin reports queue.
   * Only their own attempt, only a question that was in it, and only once per attempt and question.
   */
  router.post('/attempts/:id/reports', async (req, res) => {
    const { questionId, message } = z.object({ questionId: z.string().min(1).max(40), message: z.string().trim().min(5).max(500) }).parse(req.body);
    const attempt = await getOwnedAttempt(ctx, String(req.params.id), viewerFromReq(req));
    const q = await prisma.question.findFirst({
      where: { AND: [{ id: questionId }, attempt.questionIds.length > 0 ? { id: { in: attempt.questionIds } } : { mockTestId: attempt.mockTestId }] },
      select: { id: true },
    });
    if (!q) throw notFound('unknown_question');
    if (await prisma.questionReport.findFirst({ where: { questionId, attemptId: attempt.id, status: 'OPEN' }, select: { id: true } })) throw badRequest('already_reported');
    await prisma.questionReport.create({ data: { questionId, attemptId: attempt.id, userId: attempt.userId, message } });
    res.status(201).json({ ok: true });
  });

  return router;
}
