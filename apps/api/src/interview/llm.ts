import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import type { Config } from '../config';

/**
 * The language model behind the interviewer, the job-description reader and the evaluator.
 * Production: Claude through OpenRouter's Anthropic-compatible Messages API. Dev/test: a scripted fake.
 */
export interface LlmMessage { role: 'user' | 'assistant'; content: string }

export interface LlmRequest {
  /** Stable instructions for this kind of call; marked cacheable. */
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  /** Thinking depth. Interview turns use `low` to keep the reply quick. */
  effort?: 'low' | 'medium' | 'high';
  /** What the call is for (logs and the fake's routing). */
  purpose: 'extract' | 'turn' | 'summary' | 'evaluate' | 'smoke';
}

export interface LlmUsage { inputTokens: number; outputTokens: number }
export interface LlmResult { text: string; usage: LlmUsage }

export class LlmError extends Error {
  constructor(public readonly code: 'llm_unavailable' | 'llm_bad_output', message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export interface LlmProvider {
  complete(req: LlmRequest): Promise<LlmResult>;
  /** Streams the reply text through `onText` as it is generated; resolves with the whole reply. */
  stream(req: LlmRequest, onText: (chunk: string) => void, signal?: AbortSignal): Promise<LlmResult>;
  /** A reply that must match `schema` (structured output). Throws LlmError('llm_bad_output') when it does not. */
  json<T>(req: LlmRequest, schema: z.ZodType<T>): Promise<{ data: T; usage: LlmUsage }>;
}

const NO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0 };

function usageOf(u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined): LlmUsage {
  if (!u) return NO_USAGE;
  return {
    inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
  };
}

/** The JSON object in a reply, tolerating a code fence or a sentence around it. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the reply');
  return JSON.parse(body.slice(start, end + 1));
}

export class OpenRouterLlmProvider implements LlmProvider {
  private readonly client: Anthropic;

  constructor(private readonly cfg: Pick<Config, 'OPENROUTER_API_KEY' | 'OPENROUTER_BASE_URL' | 'INTERVIEW_MODEL'>) {
    this.client = new Anthropic({ apiKey: cfg.OPENROUTER_API_KEY, baseURL: cfg.OPENROUTER_BASE_URL, maxRetries: 2, timeout: 60_000 });
  }

  private params(req: LlmRequest) {
    return {
      model: this.cfg.INTERVIEW_MODEL,
      max_tokens: req.maxTokens,
      system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }],
      messages: req.messages,
      ...(req.effort && { output_config: { effort: req.effort } }),
    };
  }

  private fail(e: unknown): never {
    if (e instanceof LlmError) throw e;
    throw new LlmError('llm_unavailable', e instanceof Error ? e.message : String(e), { cause: e });
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    try {
      const res = await this.client.messages.create(this.params(req));
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { text, usage: usageOf(res.usage) };
    } catch (e) {
      this.fail(e);
    }
  }

  async stream(req: LlmRequest, onText: (chunk: string) => void, signal?: AbortSignal): Promise<LlmResult> {
    try {
      const stream = this.client.messages.stream(this.params(req), { signal });
      let text = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          text += event.delta.text;
          onText(event.delta.text);
        }
      }
      const final = await stream.finalMessage();
      return { text, usage: usageOf(final.usage) };
    } catch (e) {
      this.fail(e);
    }
  }

  async json<T>(req: LlmRequest, schema: z.ZodType<T>): Promise<{ data: T; usage: LlmUsage }> {
    let res;
    try {
      res = await this.client.messages.create({
        ...this.params(req),
        output_config: { ...(req.effort && { effort: req.effort }), format: zodOutputFormat(schema as never) },
      });
    } catch (e) {
      this.fail(e);
    }
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const parsed = schema.safeParse(safeJson(text));
    if (!parsed.success) throw new LlmError('llm_bad_output', `reply did not match the schema: ${parsed.error.issues[0]?.message ?? 'unparseable'}`);
    return { data: parsed.data, usage: usageOf(res.usage) };
  }
}

function safeJson(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    return undefined;
  }
}

/** A scripted interview so the whole flow can be clicked through locally without an API key (tests set their own). */
export function demoScript(req: LlmRequest): string {
  const last = req.messages[req.messages.length - 1]?.content ?? '';
  if (req.purpose === 'extract') {
    const title = /Job title:\s*(.+)/i.exec(last)?.[1]?.trim() ?? /<job>\s*([^\n.]{3,80})/.exec(last)?.[1]?.trim() ?? 'The position';
    return JSON.stringify({
      position: title, organisation: '', experience: '', responsibilities: ['Deliver the main duties of the post'], qualifications: [],
      technicalSkills: ['Job knowledge'], behavioralCompetencies: ['Communication', 'Teamwork', 'Integrity'],
      topics: [
        { name: 'Core job knowledge', kind: 'technical', priority: 'high' },
        { name: 'Solving a work problem', kind: 'technical', priority: 'high' },
        { name: 'Working with others', kind: 'behavioral', priority: 'medium' },
      ],
      recommendedLevel: 'INTERMEDIATE', recommendedKind: 'MIXED', recommendedDurationMinutes: 15,
    });
  }
  if (req.purpose === 'evaluate') {
    return JSON.stringify({
      rubric: { technical_knowledge: 72, problem_solving: 65, communication: 80, answer_structure: 58, practical_examples: 60 },
      topicScores: [{ topicId: 't1', score: 70 }, { topicId: 't2', score: 55 }],
      strengths: ['Clear and polite answers', 'Relevant experience mentioned early'],
      improvements: [{ title: 'Answer structure', detail: 'Use situation, task, action and result so each example has a clear outcome.' }],
      questions: [{ question: 'Tell me about yourself.', answer: 'A short summary of the candidate’s background.', competencies: ['Communication'], score: 70, verdict: 'Good start', missing: ['A concrete result'], improvedAnswer: 'I have worked for three years in ... where I ...' }],
      plan: [{ topic: 'Answer structure', priority: 'high', score: 58, practiceQuestions: 3 }],
      comparison: 'This is a demo evaluation (no AI key is set).',
    });
  }
  if (req.purpose === 'summary') return 'Demo notes of the interview so far.';
  if (/TIME IS UP|about one minute left/.test(last)) return '[[topic:none]] Thank you for your time today. Your feedback report will be ready in a moment. [[end]]';
  if (/The candidate has joined/.test(last)) return '[[topic:none]] Welcome, and thank you for joining. I am your interviewer today. Could you briefly introduce yourself and your experience for this role?';
  const asked = req.messages.filter((m) => m.role === 'assistant').length;
  const lines = [
    '[[topic:t1]] Thank you. What do you see as the most important duty of this position, and why?',
    '[[topic:t2]] Tell me about a difficult problem you solved at work. What did you do, step by step?',
    '[[topic:t3]] How do you handle a disagreement with a colleague about how to do a task?',
  ];
  return lines[(asked - 1 + lines.length) % lines.length]!;
}

/** Dev/test stand-in: answers from `handler`, recording every request (dev default: `demoScript`). */
export class FakeLlmProvider implements LlmProvider {
  readonly calls: LlmRequest[] = [];
  handler: (req: LlmRequest) => string = demoScript;

  private reply(req: LlmRequest): LlmResult {
    this.calls.push(req);
    const text = this.handler(req);
    return { text, usage: { inputTokens: Math.ceil((req.system.length + JSON.stringify(req.messages).length) / 4), outputTokens: Math.ceil(text.length / 4) } };
  }

  async complete(req: LlmRequest) {
    return this.reply(req);
  }

  async stream(req: LlmRequest, onText: (chunk: string) => void) {
    const r = this.reply(req);
    // Emit in small pieces so the marker-stripping and sentence logic see realistic chunk boundaries.
    for (let i = 0; i < r.text.length; i += 7) onText(r.text.slice(i, i + 7));
    return r;
  }

  async json<T>(req: LlmRequest, schema: z.ZodType<T>) {
    const r = this.reply(req);
    const parsed = schema.safeParse(safeJson(r.text));
    if (!parsed.success) throw new LlmError('llm_bad_output', 'fake reply did not match the schema');
    return { data: parsed.data, usage: r.usage };
  }
}

export function createLlmProvider(config: Config): LlmProvider {
  return config.OPENROUTER_API_KEY ? new OpenRouterLlmProvider(config) : new FakeLlmProvider();
}
