import express, { Router, type Request, type Response } from 'express';
import type { InterviewSession, User } from '@prisma/client';
import { z } from 'zod';
import { requireUser, type Ctx } from '../http/context';
import { badRequest, HttpError, notFound } from '../http/errors';
import { cleanText, MAX_UPLOAD_BYTES, normalizeJobText, readDocument } from '../interview/documents';
import { evaluateSession, type Report } from '../interview/evaluate';
import { LlmError } from '../interview/llm';
import { DURATIONS, extractProfile, jobProfileSchema, KINDS, LEVELS, planTopics, type JobProfile, type Topic } from '../interview/profile';
import { accrue, endSession, interviewerTurn, planSchema, saveCandidateTurn, type Clock } from '../interview/sessions';
import { SttError } from '../interview/stt';
import { ensureTrial, getWallet } from '../interview/wallet';

/**
 * AI interview preparation (/api/interviews). Signed-in only; the whole router answers 404 while
 * INTERVIEW_PREP_ENABLED is off. Uploading, configuring, reading reports and transcripts cost nothing; only the
 * live interview (start → end) uses minutes.
 */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
/** Starting (or resuming) an interview needs at least this much balance. */
export const MIN_START_SECONDS = 60;
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|x-m4a)\b/i;

const textJobSchema = z.object({ text: z.string().min(1).max(60_000), title: z.string().trim().max(120).optional() });
const fromExamSchema = z.object({ examSlug: z.string().min(1).max(200) });
const sessionSchema = z.object({
  jobId: z.string().min(1),
  mode: z.enum(['REAL', 'PRACTICE']).default('REAL'),
  kind: z.enum(KINDS).default('MIXED'),
  level: z.enum(LEVELS).default('INTERMEDIATE'),
  durationMinutes: z.number().int().refine((d) => (DURATIONS as readonly number[]).includes(d), 'unsupported duration'),
});
const practiceSchema = z.object({
  mode: z.enum(['REAL', 'PRACTICE']).default('PRACTICE'),
  durationMinutes: z.number().int().refine((d) => (DURATIONS as readonly number[]).includes(d), 'unsupported duration').default(15),
});
const typedAnswerSchema = z.object({ text: z.string().trim().min(1).max(4000) });

function errorCode(e: unknown): string {
  if (e instanceof HttpError) return e.code;
  if (e instanceof SttError) return 'transcription_failed';
  if (e instanceof LlmError) return 'interviewer_unavailable';
  return 'internal_error';
}

/** Server-sent events: one `event:` + `data:` frame per call. Unbuffered through nginx (X-Accel-Buffering). */
function openStream(req: Request, res: Response) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive',
  });
  res.flushHeaders();
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableFinished) abort.abort(); });
  return {
    signal: abort.signal,
    send: (event: string, data: unknown) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); },
    end: () => { if (!res.writableEnded) res.end(); },
    fail: (e: unknown) => {
      if (!(e instanceof HttpError)) console.error(`[${req.id}] interview stream failed`, e);
      if (!res.writableEnded) { res.write(`event: error\ndata: ${JSON.stringify({ error: errorCode(e), requestId: req.id })}\n\n`); res.end(); }
    },
  };
}

const clockView = (c: Clock) => ({
  activeSeconds: c.activeSeconds, remainingSeconds: c.remainingBalance, sessionLeftSeconds: c.sessionLeftSeconds, wrapUp: c.wrapUp, timeUp: c.timeUp,
});

export function interviewsRouter(ctx: Ctx) {
  const router = Router();
  const { prisma, cipher, config } = ctx;

  router.use((_req, _res, next) => next(config.INTERVIEW_PREP_ENABLED ? undefined : notFound('not_found')));
  router.use(requireUser);

  const ownedJob = async (id: string, user: User) => {
    const job = await prisma.interviewJob.findUnique({ where: { id } });
    if (!job || job.userId !== user.id) throw notFound('interview_job_not_found');
    return job;
  };
  const ownedSession = async (id: string, user: User) => {
    const s = await prisma.interviewSession.findUnique({ where: { id } });
    if (!s || s.userId !== user.id) throw notFound('interview_not_found');
    return s;
  };
  const jobView = (j: { id: string; title: string; source: string; examId: string | null; fileName: string | null; profile: unknown; createdAt: Date }) =>
    ({ id: j.id, title: j.title, source: j.source, examId: j.examId, fileName: j.fileName, profile: jobProfileSchema.parse(j.profile), createdAt: j.createdAt });

  async function createJob(user: User, a: { text: string; title: string; source: 'PASTE' | 'UPLOAD' | 'JOBPREP'; fileName?: string; examId?: string }) {
    let profile: JobProfile;
    try {
      profile = (await extractProfile(ctx.llm, a.text, a.title)).profile;
    } catch (e) {
      if (e instanceof LlmError) throw new HttpError(502, 'jd_analysis_failed');
      throw e;
    }
    const job = await prisma.interviewJob.create({
      data: {
        userId: user.id, countryCode: user.countryCode, source: a.source, examId: a.examId, fileName: a.fileName,
        title: a.title.trim() || profile.position, textEnc: cipher.encrypt(a.text), profile,
      },
    });
    return jobView(job);
  }

  // ───────────────────────── Overview (the Interview Preparation home)

  router.get('/overview', async (req, res) => {
    const user = req.user!;
    const now = ctx.now();
    await ensureTrial(prisma, user.id, config.INTERVIEW_TRIAL_MINUTES);
    const [wallet, sessions, purchase] = await Promise.all([
      getWallet(prisma, user.id, now),
      prisma.interviewSession.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, include: { job: { select: { title: true } } }, take: 50 }),
      prisma.minuteBucket.findFirst({ where: { userId: user.id, source: 'PURCHASE', expiresAt: { gt: now } }, orderBy: { expiresAt: 'desc' } }),
    ]);
    const scored = sessions.filter((s) => s.overallScore !== null).reverse(); // oldest first
    const latest = sessions.find((s) => s.status === 'EVALUATED' && s.reportEnc && s.overallScore !== null);
    const latestReport = latest ? (JSON.parse(cipher.decrypt(latest.reportEnc!)) as Report) : null;
    const usedSeconds = wallet.buckets.reduce((sum, b) => sum + (b.seconds - b.remainingSeconds), 0);
    res.json({
      wallet: {
        remainingSeconds: wallet.remainingSeconds, totalSeconds: wallet.totalSeconds, usedSeconds,
        hasPackage: wallet.hasPurchased, packageExpiresAt: purchase?.expiresAt ?? null, trialRemainingSeconds: wallet.buckets.find((b) => b.source === 'TRIAL')?.remainingSeconds ?? 0,
      },
      stats: {
        interviews: scored.length,
        averageScore: scored.length ? Math.round(scored.reduce((s, x) => s + x.overallScore!, 0) / scored.length) : null,
        improvement: scored.length >= 2 ? scored[scored.length - 1]!.overallScore! - scored[0]!.overallScore! : null,
      },
      inProgress: sessions.find((s) => s.status === 'ACTIVE' || s.status === 'PAUSED')?.id ?? null,
      recent: sessions.slice(0, 10).map((s) => ({
        id: s.id, title: s.job.title, status: s.status, mode: s.mode, durationMinutes: s.durationMinutes, activeSeconds: s.activeSeconds,
        overallScore: s.overallScore, createdAt: s.createdAt,
      })),
      improvementPlan: latest && latestReport ? { sessionId: latest.id, jobTitle: latest.job.title, items: latestReport.plan } : null,
    });
  });

  // ───────────────────────── Job descriptions

  router.get('/jobs', async (req, res) => {
    const jobs = await prisma.interviewJob.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ jobs: jobs.map(jobView) });
  });

  router.post('/jobs', async (req, res) => {
    const b = textJobSchema.parse(req.body);
    const text = normalizeJobText(b.text);
    res.status(201).json(await createJob(req.user!, { text, title: b.title ?? '', source: 'PASTE' }));
  });

  router.post(
    '/jobs/upload',
    express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest('jd_unreadable');
      const fileName = decodeURIComponent(String(req.get('x-file-name') ?? '')).replace(/[^\w .()-]/g, '').slice(0, 120) || null;
      const { text } = await readDocument(req.body);
      const title = fileName ? fileName.replace(/\.(pdf|docx|txt)$/i, '') : '';
      res.status(201).json(await createJob(req.user!, { text, title, source: 'UPLOAD', fileName: fileName ?? undefined }));
    },
  );

  /** One of JobPrep's own jobs (from the job page): its name, institution and description are the starting point. */
  router.post('/jobs/from-exam', async (req, res) => {
    const user = req.user!;
    const { examSlug } = fromExamSchema.parse(req.body);
    const exam = await prisma.exam.findUnique({
      where: { slug: examSlug },
      include: {
        authority: { select: { name: true } },
        profession: { select: { name: true, category: { select: { name: true, countryCode: true } } } },
        mockTests: { where: { status: 'PUBLISHED' }, select: { summary: true }, take: 3 },
      },
    });
    if (!exam || exam.profession.category.countryCode !== user.countryCode) throw notFound('job_not_found');
    const text = [
      `Job title: ${exam.name}`,
      exam.authority ? `Institution: ${exam.authority.name}` : '',
      `Job family: ${exam.profession.category.name} / ${exam.profession.name}`,
      exam.description ? `About the job: ${exam.description}` : '',
      ...exam.mockTests.map((m) => m.summary).filter(Boolean).map((s) => `Written exam coverage: ${s}`),
    ].filter(Boolean).join('\n');
    res.status(201).json(await createJob(user, { text: cleanText(text), title: exam.name, source: 'JOBPREP', examId: exam.id }));
  });

  router.get('/jobs/:id', async (req, res) => {
    res.json(jobView(await ownedJob(String(req.params.id), req.user!)));
  });

  router.patch('/jobs/:id', async (req, res) => {
    const job = await ownedJob(String(req.params.id), req.user!);
    const profile = jobProfileSchema.parse(z.object({ profile: z.unknown() }).parse(req.body).profile);
    const updated = await prisma.interviewJob.update({ where: { id: job.id }, data: { profile, title: profile.position } });
    res.json(jobView(updated));
  });

  router.delete('/jobs/:id', async (req, res) => {
    const job = await ownedJob(String(req.params.id), req.user!);
    // Charged time stays in the audit trail (MinuteDebit.sessionId becomes null); everything else goes.
    await prisma.interviewJob.delete({ where: { id: job.id } });
    res.status(204).end();
  });

  // ───────────────────────── Sessions

  async function createSession(user: User, a: { jobId: string; mode: 'REAL' | 'PRACTICE'; kind: (typeof KINDS)[number]; level: (typeof LEVELS)[number]; durationMinutes: number; focus?: string[]; focusNotes?: string[]; previousSessionId?: string }) {
    const job = await ownedJob(a.jobId, user);
    const profile = jobProfileSchema.parse(job.profile);
    let topics: Topic[] = planTopics(profile, a.kind, a.focus);
    // Weak areas that are not one of the job's topics become topics of their own.
    const extra = (a.focus ?? []).filter((f) => !topics.some((t) => t.name.toLowerCase() === f.toLowerCase()))
      .map((name, i) => ({ id: `f${i + 1}`, name: name.slice(0, 80), kind: 'technical' as const, priority: 'high' as const }));
    topics = [...extra, ...topics].slice(0, 10);
    return prisma.interviewSession.create({
      data: {
        userId: user.id, jobId: job.id, mode: a.mode, kind: a.kind, level: a.level, durationMinutes: a.durationMinutes,
        focus: a.focus ?? [], previousSessionId: a.previousSessionId, plan: { topics, covered: [], focusNotes: a.focusNotes ?? [] },
      },
    });
  }

  router.get('/sessions', async (req, res) => {
    const sessions = await prisma.interviewSession.findMany({
      where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, include: { job: { select: { title: true } } }, take: 100,
    });
    res.json({
      sessions: sessions.map((s) => ({
        id: s.id, title: s.job.title, status: s.status, mode: s.mode, durationMinutes: s.durationMinutes, activeSeconds: s.activeSeconds,
        overallScore: s.overallScore, createdAt: s.createdAt, previousSessionId: s.previousSessionId,
      })),
    });
  });

  router.post('/sessions', async (req, res) => {
    const b = sessionSchema.parse(req.body);
    res.status(201).json(await sessionView(await createSession(req.user!, b)));
  });

  /** "Practise weak areas": a new interview on the same job, focused on what the evaluation found weakest. */
  router.post('/sessions/:id/practice', async (req, res) => {
    const prev = await ownedSession(String(req.params.id), req.user!);
    if (prev.status !== 'EVALUATED' || !prev.reportEnc) throw badRequest('interview_not_evaluated');
    const report = JSON.parse(cipher.decrypt(prev.reportEnc)) as Report;
    const b = practiceSchema.parse(req.body ?? {});
    const weak = report.plan.filter((p) => p.priority !== 'low').map((p) => p.topic);
    const focus = (weak.length ? weak : report.plan.map((p) => p.topic)).slice(0, 4);
    const focusNotes = report.improvements.map((i) => `${i.title}: ${i.detail}`).slice(0, 4);
    const s = await createSession(req.user!, {
      jobId: prev.jobId, mode: b.mode, kind: prev.kind, level: prev.level, durationMinutes: b.durationMinutes, focus, focusNotes, previousSessionId: prev.id,
    });
    res.status(201).json(await sessionView(s));
  });

  async function sessionView(s: InterviewSession) {
    const [job, turns, balance] = await Promise.all([
      prisma.interviewJob.findUniqueOrThrow({ where: { id: s.jobId } }),
      prisma.interviewTurn.findMany({ where: { sessionId: s.id }, orderBy: { seq: 'asc' } }),
      getWallet(prisma, s.userId, ctx.now()),
    ]);
    const plan = planSchema.parse(s.plan);
    return {
      id: s.id, status: s.status, mode: s.mode, kind: s.kind, level: s.level, durationMinutes: s.durationMinutes, language: s.language,
      activeSeconds: s.activeSeconds, startedAt: s.startedAt, endedAt: s.endedAt, endReason: s.endReason, createdAt: s.createdAt,
      previousSessionId: s.previousSessionId, focus: s.focus,
      job: { id: job.id, title: job.title, position: jobProfileSchema.parse(job.profile).position },
      topics: plan.topics.map((t) => ({ ...t, covered: plan.covered.includes(t.id) })),
      remainingSeconds: balance.remainingSeconds,
      transcript: turns.map((t) => ({ seq: t.seq, role: t.role, text: cipher.decrypt(t.textEnc), topicId: t.topicId, at: t.createdAt })),
      overallScore: s.overallScore,
      report: s.reportEnc ? (JSON.parse(cipher.decrypt(s.reportEnc)) as Report) : null,
    };
  }

  router.get('/sessions/:id', async (req, res) => {
    res.json(await sessionView(await ownedSession(String(req.params.id), req.user!)));
  });

  router.delete('/sessions/:id', async (req, res) => {
    const s = await ownedSession(String(req.params.id), req.user!);
    if (s.status === 'ACTIVE') await accrue(ctx, s.id); // charge the time used up to now; the debit rows stay
    await prisma.interviewSession.delete({ where: { id: s.id } });
    res.status(204).end();
  });

  /** Start: the interviewer's welcome and first question, streamed. Needs minutes. */
  router.post('/sessions/:id/start', async (req, res) => {
    const user = req.user!;
    const s = await ownedSession(String(req.params.id), user);
    if (s.status !== 'READY') throw new HttpError(409, 'interview_already_started');
    await ensureTrial(prisma, user.id, config.INTERVIEW_TRIAL_MINUTES);
    const wallet = await getWallet(prisma, user.id, ctx.now());
    // Under a minute would only be enough for the goodbye.
    if (wallet.remainingSeconds < MIN_START_SECONDS) throw new HttpError(402, 'insufficient_minutes', { remainingSeconds: wallet.remainingSeconds });
    const started = await prisma.interviewSession.updateMany({
      where: { id: s.id, status: 'READY' }, data: { status: 'ACTIVE', startedAt: ctx.now(), lastBeatAt: ctx.now() },
    });
    if (started.count === 0) throw new HttpError(409, 'interview_already_started');
    const { session, clock } = await accrue(ctx, s.id);
    const stream = openStream(req, res);
    try {
      const turn = await interviewerTurn(ctx, session, clock, (t) => stream.send('delta', { text: t }), stream.signal);
      stream.send('done', { ended: turn.ended, ...clockView(clock) });
      stream.end();
    } catch (e) {
      stream.fail(e);
    }
  });

  /** One answer: audio (transcribed, never stored) or typed text. Streams the interviewer's reply. */
  router.post(
    '/sessions/:id/turns',
    express.raw({ type: (r) => AUDIO_TYPES.test(String(r.headers['content-type'] ?? '')), limit: MAX_AUDIO_BYTES }),
    async (req, res) => {
      const user = req.user!;
      const s = await ownedSession(String(req.params.id), user);
      if (s.status !== 'ACTIVE') throw new HttpError(409, 'interview_not_active');
      const isAudio = Buffer.isBuffer(req.body);
      const typed = isAudio ? null : typedAnswerSchema.parse(req.body).text;
      if (isAudio && req.body.length === 0) throw badRequest('audio_empty');

      const { session, clock } = await accrue(ctx, s.id);
      if (clock.hardStop) {
        await endSession(ctx, s.id, clock.remainingBalance <= 0 ? 'out_of_minutes' : 'time_up');
        throw new HttpError(409, 'interview_not_active', { ended: true });
      }
      let text = typed ?? '';
      let audioSeconds: number | undefined;
      if (isAudio) {
        const r = await ctx.stt.transcribe(req.body as Buffer, String(req.headers['content-type']));
        text = r.text;
        audioSeconds = Math.round(r.durationSeconds);
        await prisma.interviewSession.update({ where: { id: s.id }, data: { sttSeconds: { increment: Math.ceil(r.durationSeconds) } } });
      }
      const stream = openStream(req, res);
      try {
        stream.send('transcript', { text });
        if (!text.trim()) {
          // Nothing understood: ask again without spending a turn.
          stream.send('done', { ended: false, unclear: true, ...clockView(clock) });
          return stream.end();
        }
        await saveCandidateTurn(ctx, s.id, text, audioSeconds);
        const turn = await interviewerTurn(ctx, session, clock, (t) => stream.send('delta', { text: t }), stream.signal);
        stream.send('done', { ended: turn.ended, ...clockView(clock) });
        stream.end();
      } catch (e) {
        stream.fail(e);
      }
    },
  );

  router.post('/sessions/:id/beat', async (req, res) => {
    const s = await ownedSession(String(req.params.id), req.user!);
    if (s.status !== 'ACTIVE') return void res.json({ status: s.status });
    const { clock } = await accrue(ctx, s.id);
    if (clock.hardStop) await endSession(ctx, s.id, clock.remainingBalance <= 0 ? 'out_of_minutes' : 'time_up');
    res.json({ status: clock.hardStop ? 'ENDED' : 'ACTIVE', ...clockView(clock) });
  });

  router.post('/sessions/:id/pause', async (req, res) => {
    const s = await ownedSession(String(req.params.id), req.user!);
    if (s.status !== 'ACTIVE') throw new HttpError(409, 'interview_not_active');
    const { clock } = await accrue(ctx, s.id);
    await prisma.interviewSession.updateMany({ where: { id: s.id, status: 'ACTIVE' }, data: { status: 'PAUSED' } });
    res.json({ status: 'PAUSED', ...clockView(clock) });
  });

  router.post('/sessions/:id/resume', async (req, res) => {
    const s = await ownedSession(String(req.params.id), req.user!);
    if (s.status !== 'PAUSED') throw new HttpError(409, 'interview_not_paused');
    if ((await getWallet(prisma, s.userId, ctx.now())).remainingSeconds <= 0) throw new HttpError(402, 'insufficient_minutes', { remainingSeconds: 0 });
    await prisma.interviewSession.update({ where: { id: s.id }, data: { status: 'ACTIVE', lastBeatAt: ctx.now() } });
    const { clock } = await accrue(ctx, s.id);
    res.json({ status: 'ACTIVE', ...clockView(clock) });
  });

  router.post('/sessions/:id/end', async (req, res) => {
    const s = await ownedSession(String(req.params.id), req.user!);
    if (s.status === 'ACTIVE') await accrue(ctx, s.id);
    if (s.status === 'ACTIVE' || s.status === 'PAUSED') await endSession(ctx, s.id, 'ended_by_candidate');
    res.json(await sessionView(await ownedSession(s.id, req.user!)));
  });

  /** Retry an evaluation that failed (FAILED → ENDED → evaluate). */
  router.post('/sessions/:id/evaluate', async (req, res) => {
    const s = await ownedSession(String(req.params.id), req.user!);
    if (s.status !== 'FAILED') throw new HttpError(409, 'interview_not_failed');
    await prisma.interviewSession.update({ where: { id: s.id }, data: { status: 'ENDED', evaluationAttempts: 0 } });
    void evaluateSession(ctx, s.id).catch((e) => console.error('interview evaluation retry failed', s.id, e));
    res.status(202).json({ status: 'ENDED' });
  });

  return router;
}
