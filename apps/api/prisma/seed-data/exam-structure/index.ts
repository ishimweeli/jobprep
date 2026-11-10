import type { QDef, TestDef } from '../types';
import data from './case-studies.json';

/**
 * The real MIFOTRA written exam is marked out of 100: questions 1-30 carry 1 mark, 31-40 carry 3 marks and 41-50 carry
 * 4 marks, and the last ten are two case studies of five questions each, every case with a short passage that frames its
 * questions. This gives that structure to the mocks that list their case studies in case-studies.json.
 *
 * Each case lists the stems of five questions already in the mock; they move to the end under the case, in a
 * "Case studies" section, and are marked 4 each. No question is added or removed, so every answer key keeps the check it
 * already had. Questions 31-40 are marked 3 each. 30 x 1 + 10 x 3 + 10 x 4 = 100.
 */
interface CaseData { key: string; title: string; passage: string[]; stems: string[] }
const CASES = data as unknown as Record<string, CaseData[]>;

export const CASE_SECTION = 'Case studies';

export function applyExamStructure(tests: TestDef[]): TestDef[] {
  return tests.map((t) => {
    const cases = CASES[t.slug];
    if (!cases) return t;
    const byStem = new Map(t.questions.map((q) => [q.stem, q]));
    const chosen = new Set<QDef>();
    const caseQuestions: QDef[] = [];
    for (const c of cases) {
      for (const stem of c.stems) {
        const q = byStem.get(stem);
        if (!q) throw new Error(`${t.slug}: case "${c.title}" lists a question that is not in the mock: ${stem}`);
        if (chosen.has(q)) throw new Error(`${t.slug}: question listed twice: ${stem}`);
        chosen.add(q);
        caseQuestions.push({ ...q, section: CASE_SECTION, caseKey: c.key, marks: 4 });
      }
    }
    const rest = t.questions.filter((q) => !chosen.has(q)).map((q, i) => ({ ...q, marks: i >= 30 ? 3 : 1 }));
    const used = new Set(rest.map((q) => q.section));
    return {
      ...t,
      sections: [...t.sections.filter((s) => used.has(s.name)), { name: CASE_SECTION, label: 'Case study' }],
      cases: [...(t.cases ?? []), ...cases.map((c) => ({ key: c.key, title: c.title, passage: c.passage, tables: [], notes: [] }))],
      questions: [...rest, ...caseQuestions],
    };
  });
}
