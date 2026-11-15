import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { stemFingerprint } from './revise-content';
import { syncContent } from './sync-content';

/**
 * One-off for the 2026-11-11 licensing change (every licensing mock is 100 questions, 100 marks, 120 minutes):
 *  1. retires the 8 NCNM past-paper mocks that were re-cut into 7 sets (deleted when nobody attempted them, else archived),
 *  2. archives the 250 questions cut from the five NCNM practice mocks (150 -> 100),
 *  3. runs the normal additive sync (adds the 7 new past-paper sets, 50 more questions on every allied-health mock,
 *     and refreshes the minutes of the Pharmacy and Doctors mocks).
 * Unlike revise-content it touches nothing else (that tool also rewrites total marks on unrelated mocks).
 * Usage: tsx prisma/licensing-100-cli.ts [--apply]   (without --apply it only reports)
 */
const apply = process.argv.includes('--apply');
const OLD_PAST_PAPERS = [
  'ncnm-past-paper-2015-paper-1-medical-aspects', 'ncnm-past-paper-2015-paper-2-surgical-aspects', 'ncnm-past-paper-2015-paper-3-general',
  'ncnm-past-paper-2016-obstetrics', 'ncnm-past-paper-2018', 'ncnm-past-paper-2019-general-nursing', 'ncnm-past-paper-2019-midwifery', 'ncnm-past-paper-2020',
];
const revision = JSON.parse(readFileSync('prisma/content-revisions/2026-11-11-licensing-100-questions.json', 'utf8')) as Record<string, string[]>;

const prisma = new PrismaClient();
try {
  // Plan first, change nothing until every check has passed.
  const cuts: { slug: string; ids: string[] }[] = [];
  for (const [slug, prints] of Object.entries(revision)) {
    const mock = await prisma.mockTest.findUniqueOrThrow({ where: { countryCode_slug: { countryCode: 'RW', slug } } });
    const live = await prisma.question.findMany({ where: { mockTestId: mock.id, status: 'PUBLISHED' } });
    const want = new Set(prints);
    const ids = live.filter((q) => want.has(stemFingerprint(q.stem))).map((q) => q.id);
    if (ids.length !== prints.length) throw new Error(`${slug}: expected ${prints.length} questions to archive, found ${ids.length}; nothing changed`);
    const pins = (await prisma.attempt.findMany({ where: { mockTestId: mock.id, kind: 'FULL', status: { not: 'IN_PROGRESS' } }, select: { questionIds: true } })).filter((a) => !a.questionIds?.length);
    if (pins.length) throw new Error(`${slug}: ${pins.length} finished attempt(s) would need their question list pinned first; nothing changed`);
    cuts.push({ slug, ids });
  }
  const retire: { slug: string; id: string; attempts: number }[] = [];
  for (const slug of OLD_PAST_PAPERS) {
    const mock = await prisma.mockTest.findUnique({ where: { countryCode_slug: { countryCode: 'RW', slug } } });
    if (mock) retire.push({ slug, id: mock.id, attempts: await prisma.attempt.count({ where: { mockTestId: mock.id } }) });
  }
  console.log('archive:', cuts.map((c) => `${c.slug} ${c.ids.length}`).join(', '));
  console.log('retire:', retire.map((r) => `${r.slug} (${r.attempts} attempts -> ${r.attempts ? 'archive' : 'delete'})`).join(', ') || 'none');
  if (!apply) { console.log('Dry run (add --apply to write)'); process.exit(0); }

  for (const r of retire) {
    if (r.attempts) await prisma.mockTest.update({ where: { id: r.id }, data: { status: 'ARCHIVED' } });
    else await prisma.mockTest.delete({ where: { id: r.id } });
  }
  await prisma.$transaction(cuts.map((c) => prisma.question.updateMany({ where: { id: { in: c.ids } }, data: { status: 'ARCHIVED' } })));
  console.log('sync', await syncContent(prisma));
  for (const c of cuts) {
    const mock = await prisma.mockTest.findUniqueOrThrow({ where: { countryCode_slug: { countryCode: 'RW', slug: c.slug } } });
    console.log(c.slug, 'published', await prisma.question.count({ where: { mockTestId: mock.id, status: 'PUBLISHED' } }), 'minutes', mock.durationMinutes, 'marks', String(mock.totalMarks));
  }
} finally {
  await prisma.$disconnect();
}
