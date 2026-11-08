import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TESTS, slugify } from '../seed-lib';
import type { TestDef } from '../seed-data/types';
import { fetchOpenAdverts, normalise, type Advert } from './mifotra';

/**
 * Daily content pipeline, step 1: compare MIFOTRA's open advertisements with our mocks and write a work list.
 *
 *   tsx prisma/pipeline/scan.ts <out-dir> [--from <saved adverts.json>]
 *
 * Every advertised post should have TARGET_MOCKS mocks of exactly QUESTIONS_PER_MOCK questions. The work list says,
 * per post, which existing mocks need how many more questions and which new mocks to write, and a context file per
 * job gives the writers the advert and every existing question (so nothing is repeated).
 */

export const TARGET_MOCKS = 5;
export const QUESTIONS_PER_MOCK = 50;

const here = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_PATH = join(here, 'jobs-registry.json');

/** Mocks already archived on production by earlier clean-ups: never topped up, never counted. */
export function retiredSlugs(): Set<string> {
  const files = ['../remove-dummy-teaching-mocks.ts', '../remove-superseded-mocks.ts'];
  return new Set(files.flatMap((f) => [...readFileSync(join(here, f), 'utf8').matchAll(/slug: '([^']+)'/g)].map((m) => m[1]!)));
}

export const positionKey = (a: Pick<Advert, 'entityAcronym' | 'positionName'>) => `${a.entityAcronym.toUpperCase()}:${normalise(a.positionName)}`;

const CATEGORY_HINTS: [RegExp, string][] = [
  [/account|audit|financ|budget|tax|revenue/i, 'accounting-finance'],
  [/procure|logistic/i, 'procurement'],
  [/teacher|tutor|lecturer/i, 'teaching-positions'],
  [/head ?teacher|principal|school/i, 'school-leadership'],
  [/executive secretary|local government|district|sector|cell|legal|governance|administrat|protection|social|citizen/i, 'government-administration'],
];
const guessCategory = (a: Advert) => CATEGORY_HINTS.find(([re]) => re.test(`${a.positionName} ${a.entityName}`))?.[1] ?? 'other-professional';

export interface WorkJob {
  professionSlug: string;
  professionName: string;
  category: string;
  isNew: boolean;
  entity: string;
  requisitionId: string;
  jobDeadlineAt: string;
  /** When MIFOTRA opened the posting (YYYY-MM-DD), shown to users next to the closing date. */
  jobPostedAt: string;
  positionKey: string;
  contextFile: string;
  topups: { slug: string; need: number; sections: string[]; topics: string[] }[];
  newMocks: { slug: string; title: string; free: boolean }[];
  /** Mocks of this job whose stored deadline differs from the advert's closing date. */
  deadlineToUpdate: string[];
  /** Mocks of this job whose stored opening date differs from the advert's (or is missing). */
  postedToUpdate: string[];
}
export interface WorkList { generatedAt: string; adverts: number; jobs: WorkJob[] }

export function buildWorkList(adverts: Advert[], tests: TestDef[], registry: Record<string, string>, outDir: string): WorkList {
  const retired = retiredSlugs();
  const live = tests.filter((t) => t.country === 'RW' && !retired.has(t.slug) && !t.slug.includes('psychometric'));
  const byProfession = new Map<string, TestDef[]>();
  for (const t of live) byProfession.set(t.profession.slug, [...(byProfession.get(t.profession.slug) ?? []), t]);
  const nameToSlug = new Map(live.map((t) => [normalise(t.profession.name), t.profession.slug]));
  const allSlugs = new Set(tests.map((t) => t.slug));

  const jobs: WorkJob[] = [];
  const seen = new Set<string>();
  for (const a of adverts) {
    const key = positionKey(a);
    const professionSlug = registry[key] ?? nameToSlug.get(normalise(a.positionName)) ?? slugify(a.positionName);
    if (seen.has(professionSlug)) continue; // the same post advertised twice
    seen.add(professionSlug);
    const mocks = byProfession.get(professionSlug) ?? [];
    const isNew = mocks.length === 0;
    const professionName = mocks[0]?.profession.name ?? a.positionName;
    const deadline = a.closingDate.slice(0, 10);
    const posted = a.openingDate.slice(0, 10);
    const entity = a.entityAcronym || a.entityName;

    const topups = mocks
      .filter((t) => t.questions.length < QUESTIONS_PER_MOCK)
      .map((t) => ({ slug: t.slug, need: QUESTIONS_PER_MOCK - t.questions.length, sections: t.sections.map((s) => s.name), topics: [...new Set(t.questions.map((q) => q.topic))] }));

    // New mocks continue the job's own naming ("…-ndera-mock-exam-3", "… (Ndera Hospital) — Mock Exam 3").
    const newMocks: WorkJob['newMocks'] = [];
    const numbered = mocks.find((t) => /\d+$/.test(t.slug) && /\d+$/.test(t.title));
    const slugBase = numbered ? numbered.slug.replace(/\d+$/, '') : `${professionSlug}-${slugify(entity)}-mock-exam-`;
    const titleBase = numbered ? numbered.title.replace(/\d+$/, '') : `${professionName} (${entity}) — Mock Exam `;
    for (let n = mocks.length + 1; mocks.length + newMocks.length < TARGET_MOCKS; n++) {
      const slug = `${slugBase}${n}`;
      if (allSlugs.has(slug)) continue;
      newMocks.push({ slug, title: `${titleBase}${n}`, free: isNew && newMocks.length === 0 });
    }

    const contextFile = join(outDir, `job-${professionSlug}.txt`);
    writeFileSync(contextFile, contextText(a, professionName, mocks));
    if (!topups.length && !newMocks.length && mocks.every((t) => t.jobDeadlineAt === deadline && t.jobPostedAt === posted)) continue;
    jobs.push({
      professionSlug, professionName, category: mocks[0]?.category ?? guessCategory(a), isNew, entity, requisitionId: a.requisitionId,
      jobDeadlineAt: deadline, jobPostedAt: posted, positionKey: key, contextFile, topups, newMocks,
      deadlineToUpdate: mocks.filter((t) => t.jobDeadlineAt !== deadline).map((t) => t.slug),
      postedToUpdate: mocks.filter((t) => t.jobPostedAt !== posted).map((t) => t.slug),
    });
  }
  return { generatedAt: new Date().toISOString(), adverts: adverts.length, jobs };
}

function contextText(a: Advert, professionName: string, mocks: TestDef[]): string {
  const lines = [
    `# ${professionName}`,
    `MIFOTRA advert ${a.requisitionId}: ${a.positionName} — ${a.entityName} (${a.entityAcronym})`,
    `Level ${a.level}, ${a.numberOfPosts} post(s), ${a.employeeGroup}. Reports to: ${a.reportsTo || '—'}.`,
    `Opened ${a.openingDate.slice(0, 10)}, closes ${a.closingDate.slice(0, 10)}. Exams: ${Object.entries(a.exams).filter(([, v]) => v).map(([k]) => k).join(', ')}.`,
    '',
    '## Advert text',
    a.jobDescription,
    '',
    `## Existing mocks for this job (${mocks.length})`,
  ];
  for (const t of mocks) {
    lines.push('', `### ${t.slug} — ${t.questions.length} questions`, `sections: ${t.sections.map((s) => `"${s.name}"`).join(', ')}`);
    t.questions.forEach((q, i) => {
      const c = Array.isArray(q.correct) ? q.correct[0]! : q.correct;
      lines.push(`${i}. [${q.section}] ${q.stem} → ${q.options[c]}`);
    });
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const [outDir, flag, from] = process.argv.slice(2);
  if (!outDir) throw new Error('usage: scan.ts <out-dir> [--from adverts.json]');
  mkdirSync(outDir, { recursive: true });
  const adverts = flag === '--from' && from ? JSON.parse(readFileSync(from, 'utf8')) as Advert[] : await fetchOpenAdverts();
  writeFileSync(join(outDir, 'adverts.json'), JSON.stringify(adverts, null, 1));
  const registry = (JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as { positions: Record<string, string> }).positions;
  const work = buildWorkList(adverts, ALL_TESTS, registry, outDir);
  writeFileSync(join(outDir, 'worklist.json'), JSON.stringify(work, null, 1));
  const q = work.jobs.reduce((s, j) => s + j.topups.reduce((x, t) => x + t.need, 0) + j.newMocks.length * QUESTIONS_PER_MOCK, 0);
  console.log(`${work.adverts} open adverts; ${work.jobs.length} job(s) need work; ${q} question(s) to write.`);
  for (const j of work.jobs) {
    console.log(`- ${j.professionSlug}${j.isNew ? ' (NEW)' : ''}: top up ${j.topups.length} mock(s) (+${j.topups.reduce((s, t) => s + t.need, 0)}), write ${j.newMocks.length} new mock(s)${j.deadlineToUpdate.length ? `, deadline → ${j.jobDeadlineAt}` : ''}${j.postedToUpdate.length ? `, posted → ${j.jobPostedAt}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
