import { describe, expect, it } from 'vitest';
import { PSYCHOMETRIC_PREP_MOCKS } from '../../prisma/seed-data/tests-psychometric-prep';

const DOMAINS = ['Critical thinking', 'Problem solving', 'Time management', 'Clear and effective communication'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

describe('psychometric mocks in the real test format (Mocks 5-9)', () => {
  const mocks = PSYCHOMETRIC_PREP_MOCKS.filter((t) => /mock-[5-9]$/.test(t.slug));

  it('has five of them, each 21 questions, 20 minutes and 60 marks', () => {
    expect(mocks.map((t) => t.slug)).toEqual([5, 6, 7, 8, 9].map((n) => `psychometric-test-preparation-mock-${n}`));
    for (const t of mocks) {
      expect(t.questions, t.slug).toHaveLength(21);
      expect(t.minutes, t.slug).toBe(20);
      expect(t.questions.reduce((n, q) => n + (q.marks ?? 1), 0), t.slug).toBe(60);
    }
  });

  it('uses the four domains, with true/false items kept as exactly True and False', () => {
    for (const t of mocks) {
      expect(new Set(t.sections.map((s) => s.name)), t.slug).toEqual(new Set(DOMAINS));
      for (const q of t.questions) {
        expect(DOMAINS, `${t.slug}: ${q.stem}`).toContain(q.section);
        const correct = Array.isArray(q.correct) ? q.correct[0]! : q.correct;
        expect(correct).toBeGreaterThanOrEqual(0);
        expect(correct).toBeLessThan(q.options.length);
        if (q.options.length === 2) expect(q.options).toEqual(['True', 'False']);
        else expect(new Set(q.options.map(norm)).size, `${t.slug}: ${q.stem}`).toBe(4);
        expect(q.explanation.length).toBeGreaterThan(20);
      }
    }
  });

  it('never repeats a question stem across the five mocks', () => {
    const seen = new Set<string>();
    for (const t of mocks) for (const q of t.questions) {
      const key = norm(q.stem);
      expect(seen.has(key), `repeated: ${q.stem}`).toBe(false);
      seen.add(key);
    }
  });
});
