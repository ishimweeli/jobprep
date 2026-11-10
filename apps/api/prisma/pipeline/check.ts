import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TESTS } from '../seed-lib';
import { CASE_SECTION } from '../seed-data/exam-structure';
import { QUESTIONS_PER_MOCK, type WorkList } from './scan';

/**
 * Daily content pipeline, step 2b: validate a writer's JSON before it is merged.
 *
 *   tsx prisma/pipeline/check.ts <worklist.json> <written.json>
 *
 * Top-ups must bring an existing mock to exactly QUESTIONS_PER_MOCK questions using its existing sections; new mocks
 * must be ones the work list asked for, with exactly QUESTIONS_PER_MOCK questions in 3–4 sections. Questions follow
 * prisma/pipeline/WRITE_BRIEF.md: 4 distinct options, no letter references, no repeats, a source, and the correct
 * answer may be the single longest option in at most a third of them.
 *
 * A new mock also follows the real exam's structure: questions 1-40 sit in its 3-4 sections (at least 8 each), and
 * questions 41-50 are two case studies of five questions each (section "Case studies", `case` 0 or 1), with a passage for
 * each case in `cases`. apply.ts then marks them 1 / 3 / 4 (100 in all).
 */

export interface WrittenQuestion { section: string; topic: string; stem: string; options: string[]; correct: number; explanation: string; source: string; case?: number }
export interface WrittenCase { title: string; passage: string[] }
export interface WrittenMock { slug: string; title: string; summary: string; free?: boolean; sections: string[]; cases?: WrittenCase[]; questions: WrittenQuestion[] }
export interface Written { topups?: Record<string, WrittenQuestion[]>; newMocks?: WrittenMock[] }

/**
 * A writer's output: one JSON file, or a folder of part files (writers save ≤ 20 questions per part, because one huge
 * write tends to stall). Parts merge by slug: top-ups concatenate; a new mock takes title/summary/sections/free from
 * the first part that has them and concatenates questions.
 */
export function loadWritten(path: string): Written {
  const files = statSync(path).isDirectory() ? readdirSync(path).filter((f) => f.endsWith('.json')).sort().map((f) => join(path, f)) : [path];
  const out: Required<Written> = { topups: {}, newMocks: [] };
  for (const f of files) {
    const d = JSON.parse(readFileSync(f, 'utf8')) as Written;
    for (const [slug, qs] of Object.entries(d.topups ?? {})) out.topups[slug] = [...(out.topups[slug] ?? []), ...qs];
    for (const m of d.newMocks ?? []) {
      const prev = out.newMocks.find((x) => x.slug === m.slug);
      if (!prev) { out.newMocks.push({ ...m, questions: [...(m.questions ?? [])] }); continue; }
      prev.title ||= m.title;
      prev.summary ||= m.summary;
      if (!prev.sections?.length && m.sections?.length) prev.sections = m.sections;
      if (!prev.cases?.length && m.cases?.length) prev.cases = m.cases;
      if (prev.free === undefined) prev.free = m.free;
      prev.questions.push(...(m.questions ?? []));
    }
  }
  return out;
}

/** The first 40 questions are plain multiple choice; the last 10 are the two case studies. */
export const CASE_START = 40;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const JOKE = /\b(lottery|banknote|airline|football|weather forecast|ignore it|give up|for no reason)\b/i;
const CATCH_ALL = /^(none|all) of the (above|mentioned)|^(none|all) (is|are) correct/i;

export function checkWritten(work: WorkList, doc: Written): { problems: string[]; summary: string } {
  const problems: string[] = [];
  const tests = new Map(ALL_TESTS.filter((t) => t.country === 'RW').map((t) => [t.slug, t]));
  const existing = new Set([...tests.values()].flatMap((t) => t.questions.map((q) => norm(q.stem))));
  const asked = new Map(work.jobs.flatMap((j) => j.newMocks.map((m) => [m.slug, m] as const)));
  const seen = new Set<string>();
  let total = 0, longest = 0, catchAll = 0;

  const checkQ = (where: string, q: WrittenQuestion, sections: string[]) => {
    const p = (m: string) => problems.push(`${where}: ${m}`);
    for (const k of ['section', 'topic', 'stem', 'explanation', 'source'] as const) if (typeof q[k] !== 'string' || !q[k].trim()) p(`missing ${k}`);
    if (!sections.includes(q.section)) p(`section "${q.section}" is not one of: ${sections.join(' | ')}`);
    if (!Array.isArray(q.options) || q.options.length !== 4) { p('needs exactly 4 options'); return; }
    if (new Set(q.options.map(norm)).size !== 4) p('options must be different');
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) p('correct must be 0–3');
    if (/\b(option|answer) [A-D]\b|\b[A-D] (and|&) [A-D]\b/i.test(`${q.explanation} ${q.options.join(' ')}`)) p('refers to options by letter');
    if (q.options.some((o) => JOKE.test(o))) p('joke distractor');
    const key = norm(q.stem ?? '');
    if (existing.has(key)) p('stem repeats an existing question');
    if (seen.has(key)) p('stem repeated in this file');
    seen.add(key);
    total++;
    const lens = q.options.map((o) => o.length);
    const max = Math.max(...lens);
    if (lens[q.correct] === max && lens.filter((l) => l === max).length === 1) longest++;
    if (q.options.some((o) => CATCH_ALL.test(o))) catchAll++;
  };

  for (const [slug, qs] of Object.entries(doc.topups ?? {})) {
    const t = tests.get(slug);
    if (!t) { problems.push(`${slug}: unknown mock`); continue; }
    const need = QUESTIONS_PER_MOCK - t.questions.length;
    if (qs.length !== need) problems.push(`${slug}: has ${qs.length} new questions, needs exactly ${need}`);
    qs.forEach((q, i) => checkQ(`${slug}#${i}`, q, t.sections.map((s) => s.name)));
  }
  for (const m of doc.newMocks ?? []) {
    if (!asked.has(m.slug)) problems.push(`${m.slug}: not a new mock the work list asked for`);
    if (tests.has(m.slug)) problems.push(`${m.slug}: slug already exists`);
    if (!m.title?.trim() || !m.summary?.trim()) problems.push(`${m.slug}: missing title or summary`);
    if ((m.summary ?? '').length > 220) problems.push(`${m.slug}: summary over 220 chars`);
    if (m.questions?.length !== QUESTIONS_PER_MOCK) problems.push(`${m.slug}: needs exactly ${QUESTIONS_PER_MOCK} questions (has ${m.questions?.length})`);
    if (!Array.isArray(m.sections) || m.sections.length < 3 || m.sections.length > 4) problems.push(`${m.slug}: needs 3–4 sections`);
    if ((m.sections ?? []).includes(CASE_SECTION)) problems.push(`${m.slug}: "${CASE_SECTION}" is added automatically, do not list it in sections`);
    const main = (m.questions ?? []).slice(0, CASE_START);
    for (const s of m.sections ?? []) {
      const c = main.filter((q) => q.section === s).length;
      if (c < 8) problems.push(`${m.slug}: section "${s}" has ${c} among questions 1–${CASE_START} (< 8)`);
    }
    if (!Array.isArray(m.cases) || m.cases.length !== 2) problems.push(`${m.slug}: needs exactly 2 cases (title + passage) for questions ${CASE_START + 1}–${QUESTIONS_PER_MOCK}`);
    for (const [ci, c] of (m.cases ?? []).entries()) {
      if (!c?.title?.trim()) problems.push(`${m.slug}: case ${ci} has no title`);
      if (!Array.isArray(c?.passage) || c.passage.join(' ').trim().length < 80) problems.push(`${m.slug}: case ${ci} needs a passage of at least 80 characters`);
    }
    (m.questions ?? []).forEach((q, i) => {
      const where = `${m.slug}#${i}`;
      checkQ(where, q, [...(m.sections ?? []), CASE_SECTION]);
      if (i < CASE_START) {
        if (q.section === CASE_SECTION || q.case !== undefined) problems.push(`${where}: questions 1–${CASE_START} are not part of a case`);
      } else {
        if (q.section !== CASE_SECTION) problems.push(`${where}: questions ${CASE_START + 1}–${QUESTIONS_PER_MOCK} belong to section "${CASE_SECTION}"`);
        const want = Math.floor((i - CASE_START) / 5);
        if (q.case !== want) problems.push(`${where}: should have case ${want} (five questions per case)`);
      }
    });
  }

  const pct = (x: number) => (total ? Math.round((100 * x) / total) : 0);
  if (total && pct(longest) > 33) problems.push(`correct answer is the single longest option in ${pct(longest)}% of questions (max 33%)`);
  if (total && pct(catchAll) > 10) problems.push(`None/All-of-the-above in ${pct(catchAll)}% (max 10%)`);
  return { problems, summary: `questions: ${total} | correct is the single longest option: ${pct(longest)}% | None/All options: ${pct(catchAll)}%` };
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  const [worklist, file] = process.argv.slice(2);
  if (!worklist || !file) throw new Error('usage: check.ts <worklist.json> <written.json | folder of parts>');
  const r = checkWritten(JSON.parse(readFileSync(worklist, 'utf8')) as WorkList, loadWritten(file));
  console.log(r.summary);
  if (r.problems.length) { console.log(`\n${r.problems.length} problem(s):\n- ${r.problems.slice(0, 80).join('\n- ')}`); process.exitCode = 1; } else console.log('OK');
}
