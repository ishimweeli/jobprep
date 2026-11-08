import { z } from 'zod';
import type { Ctx } from '../http/context';
import { EVALUATE_SYSTEM } from './prompts';
import { jobProfileSchema, topicSchema, type Topic } from './profile';

/**
 * The end-of-interview evaluation. The model scores the answers against a fixed rubric; the overall score is
 * computed here (the mean of the rubric) so scores are comparable from one interview to the next.
 */
export type ICtx = Pick<Ctx, 'prisma' | 'config' | 'llm' | 'stt' | 'cipher' | 'now'>;

export const RUBRIC = [
  { key: 'technical_knowledge', label: 'Technical knowledge' },
  { key: 'problem_solving', label: 'Problem-solving' },
  { key: 'communication', label: 'Communication' },
  { key: 'answer_structure', label: 'Answer structure' },
  { key: 'practical_examples', label: 'Practical examples' },
] as const;
type RubricKey = (typeof RUBRIC)[number]['key'];

const score = z.number();
export const evaluationSchema = z.object({
  rubric: z.object({ technical_knowledge: score, problem_solving: score, communication: score, answer_structure: score, practical_examples: score }),
  topicScores: z.array(z.object({ topicId: z.string(), score })),
  strengths: z.array(z.string()),
  improvements: z.array(z.object({ title: z.string(), detail: z.string() })),
  questions: z.array(z.object({
    question: z.string(), answer: z.string(), competencies: z.array(z.string()), score,
    verdict: z.string(), missing: z.array(z.string()), improvedAnswer: z.string(),
  })),
  plan: z.array(z.object({ topic: z.string(), priority: z.enum(['high', 'medium', 'low']), score, practiceQuestions: z.number() })),
  comparison: z.string(),
});

export interface ScoreLine { key: string; label: string; score: number; change: number | null }
export interface Report {
  version: 1;
  /** Too few answers to score. */
  insufficient: boolean;
  overallScore: number | null;
  headline: string;
  rubric: ScoreLine[];
  topics: ScoreLine[];
  strengths: string[];
  improvements: { title: string; detail: string }[];
  questions: { question: string; answer: string; competencies: string[]; score: number; verdict: string; missing: string[]; improvedAnswer: string }[];
  plan: { topic: string; priority: 'high' | 'medium' | 'low'; score: number; practiceQuestions: number }[];
  comparison: string;
  previous: { sessionId: string; overallScore: number | null } | null;
}

const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function headlineFor(s: number | null): string {
  if (s === null) return 'Not enough to evaluate';
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Good progress';
  if (s >= 55) return 'Getting there';
  return 'Keep practising';
}

export const MAX_EVALUATION_ATTEMPTS = 3;

/**
 * Evaluate an ENDED interview. Safe to call more than once (only one caller claims each attempt); after
 * MAX_EVALUATION_ATTEMPTS failures the interview is marked FAILED and the person can still read the transcript.
 */
export async function evaluateSession(ctx: ICtx, sessionId: string): Promise<void> {
  const { prisma, cipher } = ctx;
  const s = await prisma.interviewSession.findUnique({ where: { id: sessionId }, include: { job: true, turns: { orderBy: { seq: 'asc' } } } });
  if (!s || s.status !== 'ENDED' || s.evaluationAttempts >= MAX_EVALUATION_ATTEMPTS) return;
  const claimed = await prisma.interviewSession.updateMany({
    where: { id: s.id, status: 'ENDED', evaluationAttempts: s.evaluationAttempts },
    data: { evaluationAttempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  const turns = s.turns.map((t) => ({ role: t.role, text: cipher.decrypt(t.textEnc), topicId: t.topicId }));
  const answers = turns.filter((t) => t.role === 'CANDIDATE' && t.text.trim().split(/\s+/).length >= 3);
  const plan = z.object({ topics: z.array(topicSchema) }).parse(s.plan).topics;
  const previous = s.previousSessionId
    ? await prisma.interviewSession.findUnique({ where: { id: s.previousSessionId }, include: { scores: true } })
    : null;
  const prevScores = new Map((previous?.scores ?? []).map((x) => [x.competency, x.score]));
  const change = (key: string, v: number) => (prevScores.has(key) ? v - prevScores.get(key)! : null);

  let report: Report;
  if (answers.length < 2) {
    report = {
      version: 1, insufficient: true, overallScore: null, headline: headlineFor(null), rubric: [], topics: [], strengths: [],
      improvements: [{ title: 'Answer a few more questions', detail: 'The interview ended before there were enough answers to score. Start a new interview and answer at least two or three questions.' }],
      questions: [], plan: [], comparison: '', previous: previous && { sessionId: previous.id, overallScore: previous.overallScore },
    };
  } else {
    const profile = jobProfileSchema.parse(s.job.profile);
    const transcript = turns.map((t) => `${t.role === 'INTERVIEWER' ? 'Interviewer' : 'Candidate'}${t.topicId ? ` [${t.topicId}]` : ''}: ${t.text}`).join('\n');
    const prevText = previous
      ? `\nPrevious interview scores (same rubric): ${[...prevScores].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`
      : '';
    let out;
    try {
      out = await ctx.llm.json({
        purpose: 'evaluate', system: EVALUATE_SYSTEM, maxTokens: 12000, effort: 'medium',
        messages: [{
          role: 'user',
          content: `Job: ${profile.position}${profile.organisation ? ` at ${profile.organisation}` : ''}.
Required skills: ${profile.technicalSkills.join(', ') || '-'}. Competencies: ${profile.behavioralCompetencies.join(', ') || '-'}.
Interview: ${s.kind.toLowerCase()} interview, ${s.level.toLowerCase()} level, ${s.mode === 'REAL' ? 'formal' : 'practice'} mode.
Planned topics: ${plan.map((t: Topic) => `${t.id} = ${t.name}`).join('; ')}.${prevText}

<transcript>
${transcript}
</transcript>`,
        }],
      }, evaluationSchema);
    } catch (e) {
      console.error('interview evaluation failed', s.id, e instanceof Error ? e.message : e);
      if (s.evaluationAttempts + 1 >= MAX_EVALUATION_ATTEMPTS) {
        await prisma.interviewSession.update({ where: { id: s.id }, data: { status: 'FAILED' } });
      }
      return;
    }
    const e = out.data;
    const rubric = RUBRIC.map((r) => {
      const v = pct(e.rubric[r.key as RubricKey]);
      return { key: r.key, label: r.label, score: v, change: change(r.key, v) };
    });
    const overall = pct(rubric.reduce((sum, r) => sum + r.score, 0) / rubric.length);
    const topics = e.topicScores
      .map((t) => ({ t: plan.find((p) => p.id === t.topicId), v: pct(t.score) }))
      .filter((x): x is { t: Topic; v: number } => !!x.t)
      .map(({ t, v }) => ({ key: `topic:${t.name.toLowerCase()}`, label: t.name, score: v, change: change(`topic:${t.name.toLowerCase()}`, v) }))
      .filter((x, i, all) => all.findIndex((y) => y.key === x.key) === i);
    report = {
      version: 1, insufficient: false, overallScore: overall, headline: headlineFor(overall), rubric, topics,
      strengths: e.strengths.slice(0, 4), improvements: e.improvements.slice(0, 4),
      questions: e.questions.map((q) => ({ ...q, score: pct(q.score) })),
      plan: e.plan.map((p) => ({ ...p, score: pct(p.score), practiceQuestions: Math.max(1, Math.min(5, Math.round(p.practiceQuestions))) }))
        .sort((a, b) => a.score - b.score).slice(0, 5),
      comparison: previous ? e.comparison : '',
      previous: previous && { sessionId: previous.id, overallScore: previous.overallScore },
    };
    await prisma.interviewSession.update({
      where: { id: s.id },
      data: { llmInputTokens: { increment: out.usage.inputTokens }, llmOutputTokens: { increment: out.usage.outputTokens } },
    });
  }

  await prisma.$transaction([
    prisma.interviewScore.deleteMany({ where: { sessionId: s.id } }),
    prisma.interviewScore.createMany({ data: [...report.rubric, ...report.topics].map((r) => ({ sessionId: s.id, competency: r.key, label: r.label, score: r.score })) }),
    prisma.interviewSession.update({
      where: { id: s.id },
      data: { status: 'EVALUATED', reportEnc: cipher.encrypt(JSON.stringify(report)), overallScore: report.overallScore },
    }),
  ]);
}
