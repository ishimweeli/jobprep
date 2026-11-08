import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { QUESTIONS_PER_MOCK, type WorkJob, type WorkList } from './scan';

/**
 * Daily content pipeline, step 2a: one Claude Agent SDK run writes one job's questions, as part files in its own
 * folder, following WRITE_BRIEF.md and checking itself with check.ts until it passes.
 *
 * Auth comes from the environment (ANTHROPIC_API_KEY, or ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN for a gateway such
 * as OpenRouter). The writer may read anything, write only inside its folder, and run only check.ts; run-daily.ts
 * also refuses to apply anything if a tracked file changed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(here, '..', '..');

export interface WriteResult { folder: string; costUsd: number; turns: number; error: string | null }

/** Permission rules take absolute paths as `//abs/path` (Windows drives as `//c/...`). */
const ruleRoot = (abs: string) => `//${abs.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_m, d: string) => d.toLowerCase()).replace(/^\/+/, '')}`;

function prompt(job: WorkJob, worklistPath: string, folder: string): string {
  const tasks = [
    ...job.newMocks.map((m) => `- NEW mock "${m.slug}", title "${m.title}", free: ${m.free}: exactly ${QUESTIONS_PER_MOCK} questions, 3–4 sections of at least 8.`),
    ...job.topups.map((t) => `- TOP UP "${t.slug}" with exactly ${t.need} questions, using only these sections: ${t.sections.map((s) => `"${s}"`).join(', ')}.`),
  ];
  return [
    `Write MIFOTRA-pattern mock-exam questions for the job "${job.professionName}" (${job.entity}, closing ${job.jobDeadlineAt}).`,
    '',
    'Read these two files first and follow the brief exactly (real-exam pattern, accuracy, no repeats, part-file shape):',
    `- Brief: ${join(here, 'WRITE_BRIEF.md')}`,
    `- Job context (the advert and every existing question): ${job.contextFile}`,
    '',
    'Your work list:',
    ...tasks,
    '',
    `Write part files of at most 20 questions to ${folder} (part01.json, part02.json, …), nowhere else.`,
    `After each part run: npx tsx prisma/pipeline/check.ts ${worklistPath} ${folder}`,
    'Fix every problem it reports. You are done only when it prints OK and every item of the work list above is complete.',
    'Verify facts with web search / fetch. If a fact cannot be verified, do not write that question; write a different one.',
    'Do not modify any other file and do not run any other command.',
  ].join('\n');
}

/** Write one job. Never throws for a failed run: the folder is checked by the caller either way. */
export async function writeJob(work: WorkList, job: WorkJob, outDir: string, log: (line: string) => void = console.log): Promise<WriteResult> {
  const folder = join(outDir, `written-${job.professionSlug}`);
  mkdirSync(folder, { recursive: true });
  // check.ts sees only this job, so another job's missing work never fails this one.
  const worklistPath = join(outDir, `worklist-${job.professionSlug}.json`);
  writeFileSync(worklistPath, JSON.stringify({ ...work, jobs: [job] }, null, 1));

  const result: WriteResult = { folder, costUsd: 0, turns: 0, error: null };
  try {
    for await (const message of query({
      prompt: prompt(job, worklistPath, folder),
      options: {
        cwd: API_DIR,
        additionalDirectories: [outDir],
        model: process.env.PIPELINE_MODEL || 'claude-opus-5-5',
        settingSources: [],
        tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'WebSearch', 'WebFetch', 'TodoWrite'],
        allowedTools: [
          'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite',
          `Write(${ruleRoot(folder)}/**)`, `Edit(${ruleRoot(folder)}/**)`,
          'Bash(npx tsx prisma/pipeline/check.ts *)',
        ],
        // Anything not allowed above is refused rather than waiting for a person who is not there.
        permissionMode: 'dontAsk',
        maxTurns: Number(process.env.PIPELINE_MAX_TURNS || 400),
        maxBudgetUsd: Number(process.env.PIPELINE_JOB_BUDGET_USD || 25),
      },
    })) {
      if (message.type !== 'result') continue;
      result.costUsd = message.total_cost_usd;
      result.turns = message.num_turns;
      if (message.subtype !== 'success') result.error = `${message.subtype}${'errors' in message && message.errors.length ? `: ${message.errors.join('; ')}` : ''}`;
      else if (message.is_error) result.error = message.result.slice(0, 300);
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  log(`${job.professionSlug}: ${result.error ? `writer stopped (${result.error})` : 'writer finished'}, ${result.turns} turns, ~$${result.costUsd.toFixed(2)}`);
  return result;
}
