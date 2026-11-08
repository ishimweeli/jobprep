import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TESTS } from '../seed-lib';
import { applyWritten } from './apply';
import { checkWritten, loadWritten, type Written } from './check';
import { fetchOpenAdverts } from './mifotra';
import type { DailyReport, JobReport } from './report';
import { buildWorkList, REGISTRY_PATH, type WorkJob } from './scan';
import { writeJob } from './write';

/**
 * The daily content run (GitHub Actions "Daily content from MIFOTRA"):
 *
 *   tsx prisma/pipeline/run-daily.ts <out-dir>
 *
 * scan MIFOTRA → write each job that needs work with the Agent SDK → check → apply the jobs that pass → <out-dir>/report.json.
 * A job is applied only when every mock and top-up it was given is complete and check.ts finds no problem; otherwise
 * nothing of it is applied and the next run tries again. Env: PIPELINE_MAX_JOBS (default 4), PIPELINE_CONCURRENCY
 * (default 2), PIPELINE_DRY_RUN=true (write and check, apply nothing), plus write.ts's PIPELINE_* settings.
 */

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');

/** Tracked or new files changed under the repository, ignoring `outDir` when it sits inside it. */
function repoChanges(outDir: string): string[] {
  const rel = resolve(outDir).startsWith(REPO) ? resolve(outDir).slice(REPO.length + 1).replace(/\\/g, '/') : null;
  return execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
    .split('\n').filter(Boolean).map((l) => l.slice(3)).filter((p) => !rel || !p.startsWith(rel));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]!); }
  }));
  return out;
}

/** Every new mock and top-up the job was given is in the written output. */
function complete(job: WorkJob, doc: Written): boolean {
  const mocks = new Set((doc.newMocks ?? []).map((m) => m.slug));
  return job.newMocks.every((m) => mocks.has(m.slug)) && job.topups.every((t) => (doc.topups?.[t.slug]?.length ?? 0) > 0);
}

async function main() {
  const outDir = resolve(process.argv[2] ?? 'pipeline-out');
  mkdirSync(outDir, { recursive: true });
  const dryRun = process.env.PIPELINE_DRY_RUN === 'true';
  const report: DailyReport = {
    date: new Date().toISOString().slice(0, 10), dryRun, adverts: 0, jobs: [], deferred: [], deadlinesUpdated: 0, totalCostUsd: 0, error: null,
  };
  const save = () => writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));

  try {
    const before = new Set(repoChanges(outDir));

    const adverts = await fetchOpenAdverts();
    writeFileSync(join(outDir, 'adverts.json'), JSON.stringify(adverts, null, 1));
    const registry = (JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as { positions: Record<string, string> }).positions;
    const work = buildWorkList(adverts, ALL_TESTS, registry, outDir);
    writeFileSync(join(outDir, 'worklist.json'), JSON.stringify(work, null, 1));
    report.adverts = work.adverts;

    // New jobs first: they have no mocks at all yet.
    const writable = work.jobs.filter((j) => j.newMocks.length || j.topups.length).sort((a, b) => Number(b.isNew) - Number(a.isNew));
    const chosen = writable.slice(0, Number(process.env.PIPELINE_MAX_JOBS || 4));
    report.deferred = writable.slice(chosen.length).map((j) => ({ name: j.professionName, entity: j.entity }));
    console.log(`${work.adverts} open adverts; writing ${chosen.length} job(s), ${report.deferred.length} left for later.`);

    const results = await mapLimit(chosen, Number(process.env.PIPELINE_CONCURRENCY || 2), (job) => writeJob(work, job, outDir));
    const passed: Written[] = [];
    chosen.forEach((job, i) => {
      const r = results[i]!;
      report.totalCostUsd += r.costUsd;
      const doc = existsSync(r.folder) ? loadWritten(r.folder) : {};
      const checked = checkWritten({ ...work, jobs: [job] }, doc);
      const problems = [...checked.problems, ...(complete(job, doc) ? [] : [`incomplete${r.error ? ` (${r.error})` : ''}`])];
      const ok = problems.length === 0;
      if (ok) passed.push(doc);
      const entry: JobReport = {
        name: job.professionName, entity: job.entity, deadline: job.jobDeadlineAt, isNew: job.isNew, status: ok ? 'added' : 'failed',
        mocksCreated: ok ? job.newMocks.length : 0, questionsAdded: ok ? job.topups.reduce((s, t) => s + t.need, 0) : 0, problems, costUsd: r.costUsd,
      };
      report.jobs.push(entry);
      console.log(`${job.professionSlug}: ${ok ? 'OK' : `rejected: ${problems.slice(0, 3).join(' | ')}`}`);
    });

    // The writers may only write into outDir; refuse to publish anything if a repository file changed under them.
    const after = repoChanges(outDir).filter((p) => !before.has(p));
    if (after.length) throw new Error(`a writer changed repository files: ${after.slice(0, 5).join(', ')}`);

    report.deadlinesUpdated = work.jobs.reduce((s, j) => s + j.deadlineToUpdate.length, 0);
    if (!dryRun) {
      // Every job goes in, so closing dates update everywhere; only passed jobs bring questions.
      const r = applyWritten(work, passed);
      console.log(`applied: ${r.newMocks} new mock(s), ${r.toppedUp} top-up(s)`);
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    console.error(e);
    process.exitCode = 1;
  } finally {
    save();
  }
}

main();
