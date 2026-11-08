import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadWritten, type Written, type WrittenQuestion } from './check';
import { QUESTIONS_PER_MOCK, REGISTRY_PATH, type WorkList } from './scan';

/**
 * Daily content pipeline, step 3: merge writers' JSON into seed-data.
 *
 *   tsx prisma/pipeline/apply.ts <worklist.json> <written.json>...
 *
 * - top-ups are appended to the end of the existing mock's `questions` (sync-content then adds them on live
 *   databases) and its `minutes` becomes 60;
 * - new mocks go to seed-data/auto/<profession>.ts (one file per job, collected by seed-data/auto/index.ts);
 * - new posts are added to jobs-registry.json, changed closing dates are written to the job's mocks;
 * - every question's `source` is kept in content-revisions/question-sources.json for review.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SEED = join(here, '..', 'seed-data');
const AUTO = join(SEED, 'auto');
const SOURCES = join(here, '..', 'content-revisions', 'question-sources.json');
const MINUTES = 60;

const lit = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`;
const qText = (q: WrittenQuestion, indent: string) =>
  `${indent}{ section: ${lit(q.section)}, topic: ${lit(q.topic)}, stem: ${lit(q.stem)},\n` +
  `${indent}  options: [${q.options.map(lit).join(', ')}], correct: ${q.correct},\n` +
  `${indent}  explanation: ${lit(q.explanation)} }`;

type Edit = { start: number; end: number; text: string };
const prop = (o: ts.ObjectLiteralExpression, n: string) =>
  o.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === n);

/** Find TestDef object literals by slug in one source file and let `fn` produce edits for them. */
function editTests(path: string, fn: (slug: string, node: ts.ObjectLiteralExpression, src: string) => Edit[]): string[] {
  const src = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true);
  const edits: Edit[] = [];
  const touched: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const s = prop(node, 'slug');
      if (s && ts.isStringLiteralLike(s.initializer) && prop(node, 'questions')) {
        const e = fn(s.initializer.text, node, src);
        if (e.length) { edits.push(...e); touched.push(s.initializer.text); }
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (edits.length) {
    let out = src;
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    writeFileSync(path, out);
  }
  return touched;
}

export function applyWritten(work: WorkList, written: Written[]) {
  const sources: Record<string, { stem: string; source: string }[]> = {};
  const note = (slug: string, q: WrittenQuestion) => (sources[slug] ??= []).push({ stem: q.stem, source: q.source });
  const topups: Record<string, WrittenQuestion[]> = Object.assign({}, ...written.map((w) => w.topups ?? {}));
  const deadlines = new Map(work.jobs.flatMap((j) => j.deadlineToUpdate.map((slug) => [slug, j.jobDeadlineAt] as const)));
  const done = new Set<string>();

  const seedFiles = readdirSync(SEED).filter((f) => /^tests-.*\.ts$/.test(f)).map((f) => join(SEED, f));
  const autoFiles = existsSync(AUTO) ? readdirSync(AUTO).filter((f) => f !== 'index.ts' && f.endsWith('.ts')).map((f) => join(AUTO, f)) : [];
  for (const path of [...seedFiles, ...autoFiles]) {
    editTests(path, (slug, node, src) => {
      const edits: Edit[] = [];
      const qs = topups[slug];
      if (qs?.length) {
        const arr = prop(node, 'questions')!.initializer as ts.ArrayLiteralExpression;
        const last = arr.elements[arr.elements.length - 1]!;
        const lineStart = src.lastIndexOf('\n', last.getStart()) + 1;
        const indent = src.slice(lineStart, last.getStart()).match(/^\s*/)![0];
        edits.push({ start: last.getEnd(), end: last.getEnd(), text: `,\n${qs.map((q) => { note(slug, q); return qText(q, indent); }).join(',\n')}` });
        const m = prop(node, 'minutes')!.initializer;
        edits.push({ start: m.getStart(), end: m.getEnd(), text: String(MINUTES) });
        done.add(slug);
      }
      const deadline = deadlines.get(slug);
      const d = prop(node, 'jobDeadlineAt');
      if (deadline && d && ts.isStringLiteralLike(d.initializer)) edits.push({ start: d.initializer.getStart(), end: d.initializer.getEnd(), text: lit(deadline) });
      return edits;
    });
  }
  const missed = Object.keys(topups).filter((s) => !done.has(s));
  if (missed.length) throw new Error(`top-up targets not found in seed-data: ${missed.join(', ')}`);

  // New mocks, one file per job.
  const newMocks = written.flatMap((w) => w.newMocks ?? []);
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as { about: string; positions: Record<string, string> };
  mkdirSync(AUTO, { recursive: true });
  for (const job of work.jobs) {
    const mine = newMocks.filter((m) => job.newMocks.some((n) => n.slug === m.slug));
    if (!mine.length) continue;
    const file = join(AUTO, `${job.professionSlug}.ts`);
    const blocks = mine.map((m) => {
      if (m.questions.length !== QUESTIONS_PER_MOCK) throw new Error(`${m.slug}: ${m.questions.length} questions`);
      m.questions.forEach((q) => note(m.slug, q));
      return [
        '  {',
        `    country: 'RW', category: ${lit(job.category)},`,
        `    profession: { slug: ${lit(job.professionSlug)}, name: ${lit(job.professionName)} },`,
        `    slug: ${lit(m.slug)},`,
        `    title: ${lit(m.title)},`,
        `    summary: ${lit(m.summary)},`,
        `    free: ${m.free === true}, difficulty: 'STANDARD', minutes: ${MINUTES}, jobDeadlineAt: ${lit(job.jobDeadlineAt)},`,
        `    sections: [${m.sections.map((s) => `{ name: ${lit(s)} }`).join(', ')}],`,
        '    questions: [',
        `${m.questions.map((q) => qText(q, '      ')).join(',\n')},`,
        '    ],',
        '  },',
      ].join('\n');
    });
    if (existsSync(file)) {
      const src = readFileSync(file, 'utf8');
      const at = src.lastIndexOf('];');
      writeFileSync(file, `${src.slice(0, at)}${blocks.join('\n')}\n${src.slice(at)}`);
    } else {
      writeFileSync(file, [
        "import type { TestDef } from '../types';",
        '',
        `// ${job.professionName} — ${job.entity}. MIFOTRA advert ${job.requisitionId}, closing ${job.jobDeadlineAt}.`,
        '// Written by the daily content pipeline (prisma/pipeline) to the MIFOTRA written-exam pattern. Original practice',
        '// questions, not real or past exam papers; sources in prisma/content-revisions/question-sources.json.',
        '',
        'export const MOCKS: TestDef[] = [',
        ...blocks,
        '];',
        '',
      ].join('\n'));
    }
    if (job.isNew) registry.positions[job.positionKey] = job.professionSlug;
  }
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  writeAutoIndex();

  const prev = existsSync(SOURCES) ? JSON.parse(readFileSync(SOURCES, 'utf8')) as typeof sources : {};
  for (const [k, v] of Object.entries(sources)) prev[k] = [...(prev[k] ?? []), ...v];
  writeFileSync(SOURCES, `${JSON.stringify(prev, null, 1)}\n`);
  return { toppedUp: done.size, newMocks: newMocks.length };
}

/** seed-data/auto/index.ts: every job file's MOCKS, in one list (seed-lib spreads it into ALL_TESTS). */
export function writeAutoIndex() {
  const files = readdirSync(AUTO).filter((f) => f !== 'index.ts' && f.endsWith('.ts')).sort();
  const name = (f: string) => `m_${f.replace(/\.ts$/, '').replace(/[^a-z0-9]/gi, '_')}`;
  writeFileSync(join(AUTO, 'index.ts'), [
    "import type { TestDef } from '../types';",
    ...files.map((f) => `import { MOCKS as ${name(f)} } from './${f.replace(/\.ts$/, '')}';`),
    '',
    '/** Mocks written by the daily content pipeline (prisma/pipeline), one file per advertised job. Generated — do not edit. */',
    `export const AUTO_MOCKS: TestDef[] = [${files.map((f) => `...${name(f)}`).join(', ')}];`,
    '',
  ].join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  const [worklist, ...files] = process.argv.slice(2);
  if (!worklist || !files.length) throw new Error('usage: apply.ts <worklist.json> <written.json>...');
  const r = applyWritten(JSON.parse(readFileSync(worklist, 'utf8')) as WorkList, files.map(loadWritten));
  console.log(`topped up ${r.toppedUp} mock(s), wrote ${r.newMocks} new mock(s)`);
}
