import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ALL_TESTS } from './seed-lib';

/**
 * Applies a content revision to a live database: seed-data mocks that were trimmed (questions removed) or whose
 * explanations were reworded. sync-content only ever adds, so this is the step that takes questions OUT.
 *
 * A revision file lists, per mock slug, short fingerprints of the question stems that were removed from seed-data.
 * Only PUBLISHED questions whose stem matches a fingerprint are touched, so questions an admin added or edited are
 * never archived. Removed questions are ARCHIVED, not deleted: candidates' past answers keep pointing at them.
 *
 * Before archiving, every finished full attempt of that mock that has no explicit question list gets one (the
 * questions it was taken on), so old results and reviews keep showing the paper the candidate actually sat.
 * Attempts still in progress are left alone and are scored on the remaining questions.
 *
 * Also refreshes `durationMinutes` / `totalMarks` from seed-data and copies reworded explanations onto kept questions.
 * For mocks in the revision it also archives the second copy of any duplicated stem, and refreshes title, summary
 * and the post's name from seed-data.
 */

export const stemFingerprint = (stem: string) => createHash('sha1').update(stem.trim()).digest('hex').slice(0, 16);

export type Revision = Record<string, string[]>; // slug → removed stem fingerprints

export async function reviseContent(prisma: PrismaClient, revision: Revision, opts: { apply: boolean }) {
  const lines: string[] = [];
  let archived = 0, pinned = 0, explanations = 0, mocks = 0;

  for (const t of ALL_TESTS) {
    const removed = new Set(revision[t.slug] ?? []);
    const mock = await prisma.mockTest.findUnique({ where: { countryCode_slug: { countryCode: t.country, slug: t.slug } } });
    if (!mock) continue;

    const live = await prisma.question.findMany({
      where: { mockTestId: mock.id, status: 'PUBLISHED' },
      orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });
    // Removed from seed-data, plus (for mocks in this revision) any second copy of the same stem: a mock should never
    // show one question twice, and some live mocks picked up duplicate case questions from an earlier sync.
    const seen = new Set<string>();
    const toArchive = live.filter((q) => {
      const key = q.stem.trim();
      const duplicate = t.slug in revision && seen.has(key);
      seen.add(key);
      return duplicate || removed.has(stemFingerprint(q.stem));
    });
    const seedByStem = new Map(t.questions.map((q) => [q.stem.trim(), q]));
    const reworded = live.filter((q) => {
      const s = seedByStem.get(q.stem.trim());
      return s && s.explanation !== q.explanation && !toArchive.includes(q);
    });
    const remaining = live.filter((q) => !toArchive.includes(q));
    const totalMarks = remaining.reduce((sum, q) => sum + Number(q.marks), 0);
    // Title and summary describe the paper, so they follow seed-data for mocks this revision covers.
    const inRevision = t.slug in revision;
    const textChanged = inRevision && (mock.title !== t.title || mock.summary !== t.summary);
    const metaChanged = mock.durationMinutes !== t.minutes || Number(mock.totalMarks) !== totalMarks || textChanged;
    if (inRevision) await renameProfession(prisma, mock.examId, t.profession.name, opts.apply, lines);
    if (!toArchive.length && !reworded.length && !metaChanged) continue;

    // "No explicit question list" is checked here, not in SQL: an attempt created without one can hold NULL, which
    // Prisma's `isEmpty` filter does not match.
    const finished = toArchive.length
      ? (await prisma.attempt.findMany({
          where: { mockTestId: mock.id, kind: 'FULL', status: { not: 'IN_PROGRESS' } },
          select: { id: true, questionIds: true },
        })).filter((a) => !a.questionIds?.length)
      : [];

    mocks++;
    archived += toArchive.length;
    pinned += finished.length;
    explanations += reworded.length;
    lines.push(`${t.slug}: ${live.length} → ${remaining.length} questions (archive ${toArchive.length}), `
      + `${mock.durationMinutes} → ${t.minutes} min, pin ${finished.length} past attempt(s), ${reworded.length} explanation(s)`
      + `${textChanged ? ', title/summary updated' : ''}`);
    if (!opts.apply) continue;

    await prisma.$transaction(async (tx) => {
      if (finished.length) {
        await tx.attempt.updateMany({ where: { id: { in: finished.map((a) => a.id) } }, data: { questionIds: live.map((q) => q.id) } });
      }
      if (toArchive.length) {
        await tx.question.updateMany({ where: { id: { in: toArchive.map((q) => q.id) } }, data: { status: 'ARCHIVED' } });
      }
      for (const q of reworded) {
        await tx.question.update({ where: { id: q.id }, data: { explanation: seedByStem.get(q.stem.trim())!.explanation } });
      }
      await tx.mockTest.update({
        where: { id: mock.id },
        data: { durationMinutes: t.minutes, totalMarks, ...(textChanged ? { title: t.title, summary: t.summary } : {}) },
      });
    });
  }

  return { mocks, archived, pinned, explanations, lines };
}

/** A post renamed in seed-data (same slug, e.g. SEDO → Economic Development Officer) is renamed on its profession and exam. */
async function renameProfession(prisma: PrismaClient, examId: string, name: string, apply: boolean, lines: string[]) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { profession: true } });
  if (exam.name === name && exam.profession.name === name) return;
  const note = `profession "${exam.profession.name}" → "${name}"`;
  if (!lines.includes(note)) lines.push(note);
  if (!apply) return;
  await prisma.profession.update({ where: { id: exam.professionId }, data: { name } });
  await prisma.exam.update({ where: { id: exam.id }, data: { name } });
}
