import type { PrismaClient, QuestionType } from '@prisma/client';
import { ALL_TESTS } from './seed-lib';
import { CASE_SECTION } from './seed-data/exam-structure';
import cases from './seed-data/exam-structure/case-studies.json';

/**
 * Brings live mocks to the real-exam structure that seed-data now describes (seed-data/exam-structure): questions 1-30 are
 * worth 1 mark, 31-40 worth 3, and 41-50 are two case studies of five questions worth 4 each.
 *
 * sync-content cannot do this (it only adds, and refuses to add a case to a mock that is already live), so this step
 * moves the questions that are already live: it creates the "Case studies" section and the two cases when missing, then sets
 * each question's section, case, type, marks and order from seed-data. Questions are matched by stem; nothing is added,
 * archived or deleted, so candidates' past answers keep pointing at the same questions. Running it again changes nothing.
 */
export async function restructureContent(prisma: PrismaClient, opts: { apply: boolean }) {
  const lines: string[] = [];
  let mocks = 0, questions = 0;

  for (const t of ALL_TESTS) {
    if (!(t.slug in cases)) continue;
    const mock = await prisma.mockTest.findUnique({ where: { countryCode_slug: { countryCode: t.country, slug: t.slug } } });
    if (!mock) { lines.push(`${t.slug}: not on this database, skipped`); continue; }

    const live = await prisma.question.findMany({ where: { mockTestId: mock.id, status: 'PUBLISHED' } });
    const liveByStem = new Map(live.map((q) => [q.stem.trim(), q]));
    const missing = t.questions.filter((q) => !liveByStem.has(q.stem.trim()));
    if (missing.length) { lines.push(`${t.slug}: ${missing.length} seed question(s) are not live, SKIPPED (run sync-content first)`); continue; }

    const sections = await prisma.section.findMany({ where: { mockTestId: mock.id } });
    const liveCases = await prisma.case.findMany({ where: { mockTestId: mock.id } });
    const needSection = !sections.some((s) => s.name === CASE_SECTION);
    const needCases = t.cases!.filter((c) => !liveCases.some((l) => l.title === c.title));
    // Per question: only what differs from seed-data.
    const sectionIdByName = new Map(sections.map((s) => [s.name, s.id]));
    const caseIdByTitle = new Map(liveCases.map((c) => [c.title, c.id]));
    const changes = t.questions.flatMap((q, i) => {
      const l = liveByStem.get(q.stem.trim())!;
      const c = q.caseKey ? t.cases!.find((x) => x.key === q.caseKey)! : null;
      const type: QuestionType = q.caseKey ? 'CASE_BASED' : l.type === 'CASE_BASED' ? 'SINGLE_CHOICE' : l.type;
      const differs = l.sortOrder !== i || Number(l.marks) !== (q.marks ?? 1) || l.type !== type
        || sectionIdByName.get(q.section) !== l.sectionId || (c ? caseIdByTitle.get(c.title) : null) !== (l.caseId ?? null);
      return differs ? [{ q, l, i, type, c }] : [];
    });
    const totalMarks = t.questions.reduce((s, q) => s + (q.marks ?? 1), 0);
    if (!changes.length && !needSection && !needCases.length && Number(mock.totalMarks) === totalMarks) continue;

    mocks++;
    questions += changes.length;
    lines.push(`${t.slug}: ${changes.length} question(s) to update${needSection ? ', + Case studies section' : ''}${needCases.length ? `, + ${needCases.length} case(s)` : ''}, total ${Number(mock.totalMarks)} → ${totalMarks} marks`);
    if (!opts.apply) continue;

    await prisma.$transaction(async (tx) => {
      const secId = new Map(sectionIdByName);
      if (needSection) {
        const s = await tx.section.create({
          data: { mockTestId: mock.id, name: CASE_SECTION, questionTypeLabel: 'Case study', sortOrder: Math.max(-1, ...sections.map((x) => x.sortOrder)) + 1 },
        });
        secId.set(CASE_SECTION, s.id);
      }
      const caseId = new Map(caseIdByTitle);
      for (const c of needCases) {
        const created = await tx.case.create({
          data: { mockTestId: mock.id, title: c.title, passage: c.passage, notes: c.notes, tables: c.tables as never, sortOrder: t.cases!.indexOf(c) },
        });
        caseId.set(c.title, created.id);
      }
      for (const { q, l, i, type, c } of changes) {
        await tx.question.update({
          where: { id: l.id },
          data: { sectionId: secId.get(q.section)!, caseId: c ? caseId.get(c.title)! : null, type, marks: q.marks ?? 1, sortOrder: i },
        });
      }
      await tx.mockTest.update({ where: { id: mock.id }, data: { totalMarks } });
      // A section left with no question at all (published or archived) is removed so the mock shows no empty block.
      for (const s of sections) {
        if (t.sections.some((x) => x.name === s.name)) continue;
        if (!(await tx.question.count({ where: { sectionId: s.id } }))) await tx.section.delete({ where: { id: s.id } });
      }
    });
  }
  return { mocks, questions, lines };
}
