import { Router, type Request } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../http/errors';
import type { Ctx } from '../http/context';
import {
  buildState, finalizeIfExpired, getOwnedAttempt, listInProgress, MAX_CHANGES_PER_REQUEST,
  saveChanges, startAttempt, submitAttempt, type AnswerChange, type Viewer,
} from '../services/attempts';
import { timerState } from '../domain/timer';

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
    await getOwnedAttempt(ctx, String(req.params.id), viewer);
    await finalizeIfExpired(ctx, String(req.params.id)); // opening an expired attempt shows "Time is up", not a stale clock
    res.json(await buildState(ctx, String(req.params.id)));
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

  return router;
}
