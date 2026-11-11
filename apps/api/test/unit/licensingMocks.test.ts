import { describe, expect, it } from 'vitest';
import { ALL_TESTS } from '../../prisma/seed-lib';
import { LICENSING_MOCKS } from '../../prisma/seed-data/licensing';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The council licensing exams and the shape of their mocks (questions per mock, minutes). */
const EXAMS: Record<string, { questions: number; minutes: number }> = {
  'ncnm-nurses-midwives-licensing-exam': { questions: 150, minutes: 180 },
  'npc-pharmacists-pre-registration-exam': { questions: 100, minutes: 180 },
  'rmdc-medical-doctors-licensing-exam': { questions: 100, minutes: 150 },
  'rahpc-biomedical-laboratory-sciences-licensing-exam': { questions: 50, minutes: 60 },
  'rahpc-clinical-medicine-licensing-exam': { questions: 50, minutes: 60 },
  'rahpc-anaesthesia-licensing-exam': { questions: 50, minutes: 60 },
};

describe('professional licensing exam mocks', () => {
  it('are all in the licensing-exams category and in the seed', () => {
    expect(LICENSING_MOCKS.length).toBeGreaterThan(0);
    const seeded = new Set(ALL_TESTS.map((t) => t.slug));
    for (const t of LICENSING_MOCKS) {
      expect(t.category, t.slug).toBe('licensing-exams');
      expect(t.country, t.slug).toBe('RW');
      expect(seeded.has(t.slug), t.slug).toBe(true);
    }
  });

  it('give every council exam at least 5 full-length mocks with exactly one free', () => {
    for (const [profession, shape] of Object.entries(EXAMS)) {
      const mocks = LICENSING_MOCKS.filter((t) => t.profession.slug === profession);
      expect(mocks.length, profession).toBeGreaterThanOrEqual(5);
      expect(mocks.filter((t) => t.free).map((t) => t.slug), profession).toEqual([mocks[0]!.slug]);
      for (const t of mocks) {
        expect(t.questions, t.slug).toHaveLength(shape.questions);
        expect(t.minutes, t.slug).toBe(shape.minutes);
      }
    }
  });

  it('gives every question four distinct options, one valid answer, an explanation and a known section', () => {
    for (const t of LICENSING_MOCKS) {
      const sections = new Set(t.sections.map((s) => s.name));
      t.questions.forEach((q, i) => {
        const where = `${t.slug}#${i + 1}`;
        expect(q.options, where).toHaveLength(4);
        expect(new Set(q.options.map((o) => o.trim().toLowerCase())).size, where).toBe(4);
        expect(typeof q.correct === 'number' && q.correct >= 0 && q.correct < 4, where).toBe(true);
        expect(q.explanation.length, where).toBeGreaterThan(20);
        expect(sections.has(q.section), where).toBe(true);
        expect(q.options.join(' | '), where).not.toMatch(/all of the above|none of the above/i);
      });
    }
  });

  it('never repeats a question across the licensing mocks', () => {
    const seen = new Map<string, string>();
    for (const t of LICENSING_MOCKS) {
      for (const q of t.questions) {
        const k = norm(q.stem);
        expect(seen.get(k), `${t.slug}: ${q.stem.slice(0, 60)}`).toBeUndefined();
        seen.set(k, t.slug);
      }
    }
  });

  it('spreads the correct answers over all four positions in every exam', () => {
    for (const profession of Object.keys(EXAMS)) {
      const counts = [0, 0, 0, 0];
      for (const t of LICENSING_MOCKS.filter((x) => x.profession.slug === profession)) for (const q of t.questions) counts[q.correct as number]!++;
      const total = counts.reduce((a, b) => a + b, 0);
      for (const c of counts) expect(c / total, `${profession} ${counts.join('/')}`).toBeGreaterThan(0.15);
    }
  });
});
