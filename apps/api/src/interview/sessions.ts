import { Prisma, type InterviewSession } from '@prisma/client';
import { z } from 'zod';
import { conflict } from '../http/errors';
import { buildMessages, MarkerStripper, SUMMARY_TRIGGER, WINDOW_TURNS, type TurnRow } from './engine';
import { evaluateSession, type ICtx } from './evaluate';
import { interviewerSystem, openingMessage, stateNote, SUMMARY_SYSTEM, type InterviewSetup } from './prompts';
import { jobProfileSchema, topicSchema } from './profile';
import { debitSeconds, remainingSeconds } from './wallet';

/**
 * The live interview. Time is measured on the server between signs of life (turns and 15-second heartbeats):
 * a gap longer than BEAT_CAP_SECONDS (a dropped connection) is not charged, a paused interview is not charged,
 * and nothing is charged once it has ended.
 */
export const BEAT_CAP_SECONDS = 45;
/** The goodbye after the time is up may take this long (charged); after that the interview is ended. */
export const CLOSING_GRACE_SECONDS = 90;
export const WRAP_UP_SECONDS = 60;
/** No sign of life for this long: the interview is ended ("disconnected"). */
export const STALE_ACTIVE_SECONDS = 120;
export const STALE_PAUSED_SECONDS = 30 * 60;

export const planSchema = z.object({
  topics: z.array(topicSchema),
  covered: z.array(z.string()).default([]),
  focusNotes: z.array(z.string()).default([]),
});
export type SessionPlan = z.infer<typeof planSchema>;

export interface Clock {
  activeSeconds: number;
  remainingBalance: number;
  sessionLeftSeconds: number;
  /** Ask for the close now (about a minute left of the session or of the balance). */
  wrapUp: boolean;
  /** The time is up: the next interviewer turn closes the interview. */
  timeUp: boolean;
  /** Past the closing grace (or no minutes at all): end now without another turn. */
  hardStop: boolean;
}

function clockOf(s: Pick<InterviewSession, 'activeSeconds' | 'durationMinutes'>, balance: number): Clock {
  const sessionLeft = s.durationMinutes * 60 - s.activeSeconds;
  const timeUp = sessionLeft <= 0 || balance <= 0;
  return {
    activeSeconds: s.activeSeconds,
    remainingBalance: balance,
    sessionLeftSeconds: Math.max(0, sessionLeft),
    wrapUp: !timeUp && (sessionLeft <= WRAP_UP_SECONDS || balance <= WRAP_UP_SECONDS),
    timeUp,
    hardStop: balance <= 0 || sessionLeft <= -CLOSING_GRACE_SECONDS,
  };
}

/** Charge the time since the last sign of life (capped) and return the clock. */
export async function accrue(ctx: ICtx, sessionId: string): Promise<{ session: InterviewSession; clock: Clock }> {
  const now = ctx.now();
  return ctx.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InterviewSession" WHERE id = ${sessionId} FOR UPDATE`;
    let s = await tx.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (s.status === 'ACTIVE' && s.lastBeatAt) {
      const gap = Math.floor((now.getTime() - s.lastBeatAt.getTime()) / 1000);
      const allowed = s.durationMinutes * 60 + CLOSING_GRACE_SECONDS - s.activeSeconds;
      const due = Math.max(0, Math.min(gap, BEAT_CAP_SECONDS, allowed));
      const charged = await debitSeconds(tx, s.userId, s.id, due, now);
      s = await tx.interviewSession.update({ where: { id: s.id }, data: { activeSeconds: { increment: charged }, lastBeatAt: now } });
    }
    return { session: s, clock: clockOf(s, await remainingSeconds(tx, s.userId, now)) };
  }, { timeout: 15_000 });
}

export function setupOf(s: InterviewSession, profileJson: unknown): InterviewSetup {
  const plan = planSchema.parse(s.plan);
  return {
    profile: jobProfileSchema.parse(profileJson), plan: plan.topics, mode: s.mode, kind: s.kind, level: s.level,
    durationMinutes: s.durationMinutes, focusNotes: plan.focusNotes,
  };
}

async function nextSeq(ctx: ICtx, sessionId: string) {
  const last = await ctx.prisma.interviewTurn.findFirst({ where: { sessionId }, orderBy: { seq: 'desc' }, select: { seq: true } });
  return (last?.seq ?? 0) + 1;
}

/** Saves a turn; a second request racing for the same position gets 409 turn_in_progress. */
async function saveTurn(ctx: ICtx, sessionId: string, role: 'INTERVIEWER' | 'CANDIDATE', text: string, extra: { topicId?: string | null; audioSeconds?: number } = {}) {
  try {
    return await ctx.prisma.interviewTurn.create({
      data: { sessionId, seq: await nextSeq(ctx, sessionId), role, textEnc: ctx.cipher.encrypt(text), topicId: extra.topicId ?? null, audioSeconds: extra.audioSeconds },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('turn_in_progress');
    throw e;
  }
}

export async function saveCandidateTurn(ctx: ICtx, sessionId: string, text: string, audioSeconds?: number) {
  return saveTurn(ctx, sessionId, 'CANDIDATE', text, { audioSeconds });
}

export interface InterviewerTurn { text: string; ended: boolean; topicId: string | null }

/**
 * Generate the interviewer's next turn, streaming the spoken text through `onText`. Saves it, updates topic
 * coverage and, when the interviewer closed (or the time is up), ends the interview and starts the evaluation.
 */
export async function interviewerTurn(ctx: ICtx, session: InterviewSession, clock: Clock, onText: (t: string) => void, signal?: AbortSignal): Promise<InterviewerTurn> {
  const { prisma, cipher } = ctx;
  const job = await prisma.interviewJob.findUniqueOrThrow({ where: { id: session.jobId } });
  const setup = setupOf(session, job.profile);
  const plan = planSchema.parse(session.plan);
  const rows = await prisma.interviewTurn.findMany({ where: { sessionId: session.id, seq: { gt: session.summarizedThrough } }, orderBy: { seq: 'asc' } });
  const turns: TurnRow[] = rows.map((r) => ({ seq: r.seq, role: r.role, text: cipher.decrypt(r.textEnc) }));
  const name = (id: string) => plan.topics.find((t) => t.id === id)?.name ?? id;
  const note = stateNote({
    elapsedSeconds: clock.activeSeconds, durationMinutes: session.durationMinutes,
    covered: plan.covered.map(name), remaining: plan.topics.filter((t) => !plan.covered.includes(t.id)).map((t) => t.name),
    wrapUp: clock.wrapUp, timeUp: clock.timeUp,
  });
  const messages = buildMessages({
    summary: session.summaryEnc ? cipher.decrypt(session.summaryEnc) : null, turns, opening: openingMessage(setup), note,
  });

  const stripper = new MarkerStripper();
  let spoken = '';
  const emit = (t: string) => { if (t) { spoken += t; onText(t); } };
  const r = await ctx.llm.stream({ purpose: 'turn', system: interviewerSystem(setup), messages, maxTokens: 600, effort: 'low' }, (c) => emit(stripper.push(c)), signal);
  emit(stripper.finish());
  let text = spoken.trim();
  if (!text) {
    text = clock.timeUp ? 'Thank you for your time today. That brings us to the end of the interview.' : 'Thank you. Could you tell me a little more about that?';
    onText(text);
  }
  const ended = stripper.ended || clock.timeUp;
  await saveTurn(ctx, session.id, 'INTERVIEWER', text, { topicId: stripper.topicId });
  const covered = stripper.topicId && plan.topics.some((t) => t.id === stripper.topicId) && !plan.covered.includes(stripper.topicId)
    ? [...plan.covered, stripper.topicId] : plan.covered;
  await prisma.interviewSession.update({
    where: { id: session.id },
    data: {
      plan: { ...plan, covered },
      llmInputTokens: { increment: r.usage.inputTokens }, llmOutputTokens: { increment: r.usage.outputTokens },
    },
  });
  if (ended) await endSession(ctx, session.id, stripper.ended ? 'completed' : 'time_up');
  else void maybeSummarize(ctx, session.id).catch((e) => console.error('interview summary failed', session.id, e));
  return { text, ended, topicId: stripper.topicId };
}

/** End an ACTIVE or PAUSED interview and start its evaluation in the background. */
export async function endSession(ctx: ICtx, sessionId: string, reason: string) {
  const r = await ctx.prisma.interviewSession.updateMany({
    where: { id: sessionId, status: { in: ['ACTIVE', 'PAUSED', 'READY'] } },
    data: { status: 'ENDED', endedAt: ctx.now(), endReason: reason },
  });
  if (r.count > 0) void evaluateSession(ctx, sessionId).catch((e) => console.error('interview evaluation crashed', sessionId, e));
}

/** Fold older turns into the rolling summary, keeping the last turns verbatim (starting at an interviewer turn). */
export async function maybeSummarize(ctx: ICtx, sessionId: string) {
  const { prisma, cipher } = ctx;
  const s = await prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
  const rows = await prisma.interviewTurn.findMany({ where: { sessionId, seq: { gt: s.summarizedThrough } }, orderBy: { seq: 'asc' } });
  if (rows.length <= SUMMARY_TRIGGER) return;
  let keepFrom = rows.length - Math.floor(WINDOW_TURNS / 2);
  while (keepFrom > 0 && rows[keepFrom]!.role !== 'INTERVIEWER') keepFrom--;
  const fold = rows.slice(0, keepFrom);
  if (fold.length === 0) return;
  const prior = s.summaryEnc ? `Earlier summary:\n${cipher.decrypt(s.summaryEnc)}\n\n` : '';
  const transcript = fold.map((t) => `${t.role === 'INTERVIEWER' ? 'Interviewer' : 'Candidate'}: ${cipher.decrypt(t.textEnc)}`).join('\n');
  const r = await ctx.llm.complete({ purpose: 'summary', system: SUMMARY_SYSTEM, maxTokens: 800, effort: 'low', messages: [{ role: 'user', content: `${prior}Continue the notes with this part of the interview:\n${transcript}` }] });
  // Only move forward if nothing else summarised in the meantime.
  await prisma.interviewSession.updateMany({
    where: { id: sessionId, summarizedThrough: s.summarizedThrough },
    data: {
      summaryEnc: cipher.encrypt(r.text.trim()), summarizedThrough: fold[fold.length - 1]!.seq,
      llmInputTokens: { increment: r.usage.inputTokens }, llmOutputTokens: { increment: r.usage.outputTokens },
    },
  });
}

/** Background clean-up (server.ts, every 30 s): end abandoned interviews and retry evaluations that failed. */
export async function sweepInterviews(ctx: ICtx): Promise<void> {
  const now = ctx.now().getTime();
  const stale = await ctx.prisma.interviewSession.findMany({
    where: {
      OR: [
        { status: 'ACTIVE', lastBeatAt: { lt: new Date(now - STALE_ACTIVE_SECONDS * 1000) } },
        { status: 'PAUSED', updatedAt: { lt: new Date(now - STALE_PAUSED_SECONDS * 1000) } },
      ],
    },
    select: { id: true, status: true },
    take: 50,
  });
  for (const s of stale) await endSession(ctx, s.id, s.status === 'ACTIVE' ? 'disconnected' : 'abandoned');
  const unevaluated = await ctx.prisma.interviewSession.findMany({
    where: { status: 'ENDED', updatedAt: { lt: new Date(now - 60_000) }, evaluationAttempts: { lt: 3 } },
    select: { id: true },
    take: 10,
  });
  for (const s of unevaluated) await evaluateSession(ctx, s.id).catch((e) => console.error('interview evaluation retry failed', s.id, e));
}
