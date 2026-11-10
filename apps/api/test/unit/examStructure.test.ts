import { describe, expect, it } from 'vitest';
import { ALL_TESTS } from '../../prisma/seed-lib';
import cases from '../../prisma/seed-data/exam-structure/case-studies.json';

/** The real MIFOTRA exam: 30 x 1 mark, 10 x 3 marks, 10 x 4 marks (two case studies of five), 100 marks, 120 minutes. */
describe('real-exam marking and case studies in the Executive Secretary, Economic Development and Human Capital mocks', () => {
  const slugs = Object.keys(cases);
  const mocks = slugs.map((s) => ALL_TESTS.find((t) => t.slug === s)!);

  it('covers all 30 mocks of the three jobs', () => {
    expect(slugs).toHaveLength(30);
    mocks.forEach((t, i) => expect(t, slugs[i]).toBeDefined());
  });

  it('marks questions 1-30 with 1, 31-40 with 3 and 41-50 with 4, 100 in all', () => {
    for (const t of mocks) {
      expect(t.questions, t.slug).toHaveLength(50);
      t.questions.forEach((q, i) => expect(q.marks, `${t.slug}#${i + 1}`).toBe(i < 30 ? 1 : i < 40 ? 3 : 4));
      expect(t.questions.reduce((s, q) => s + (q.marks ?? 1), 0), t.slug).toBe(100);
      expect(t.minutes, t.slug).toBe(120);
    }
  });

  it('ends with two cases of five questions each, with a passage', () => {
    for (const t of mocks) {
      expect(t.cases, t.slug).toHaveLength(2);
      for (const c of t.cases!) {
        expect(c.passage.join(' ').length, `${t.slug} ${c.key} passage`).toBeGreaterThan(80);
        expect(t.questions.filter((q) => q.caseKey === c.key), `${t.slug} ${c.key}`).toHaveLength(5);
      }
      expect(t.questions.slice(40).every((q) => q.caseKey && q.section === 'Case studies'), t.slug).toBe(true);
      expect(t.questions.slice(0, 40).some((q) => q.caseKey), t.slug).toBe(false);
      expect(t.sections.map((s) => s.name), t.slug).toContain('Case studies');
    }
  });

  it('keeps every section non-empty and never repeats a question', () => {
    for (const t of mocks) {
      for (const s of t.sections) expect(t.questions.some((q) => q.section === s.name), `${t.slug} / ${s.name}`).toBe(true);
      expect(new Set(t.questions.map((q) => q.stem)).size, t.slug).toBe(50);
    }
  });
});
