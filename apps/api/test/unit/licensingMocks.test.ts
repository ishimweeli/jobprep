import { describe, expect, it } from 'vitest';
import { ALL_TESTS } from '../../prisma/seed-lib';
import { LICENSING_MOCKS, NCNM_PAST_PAPER_SLUGS } from '../../prisma/seed-data/licensing';
import ncnmRevision from '../../prisma/content-revisions/2026-11-11-ncnm-original-wording.json';
import { stemFingerprint } from '../../prisma/revise-content';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The council licensing exams and the shape of their practice mocks (questions per mock, minutes). */
const EXAMS: Record<string, { questions: number; minutes: number }> = {
  'ncnm-nurses-midwives-licensing-exam': { questions: 150, minutes: 180 },
  'npc-pharmacists-pre-registration-exam': { questions: 100, minutes: 180 },
  'rmdc-medical-doctors-licensing-exam': { questions: 100, minutes: 150 },
  'rahpc-biomedical-laboratory-sciences-licensing-exam': { questions: 50, minutes: 60 },
  'rahpc-clinical-medicine-licensing-exam': { questions: 50, minutes: 60 },
  'rahpc-anaesthesia-licensing-exam': { questions: 50, minutes: 60 },
};

const pastSlugs = new Set(NCNM_PAST_PAPER_SLUGS);
const PAST_PAPERS = LICENSING_MOCKS.filter((t) => pastSlugs.has(t.slug));
const PRACTICE = LICENSING_MOCKS.filter((t) => !pastSlugs.has(t.slug));
/** Real NCNM questions are published word for word, so their options are as the council set them. */
const REAL_STEMS = new Set(PAST_PAPERS.flatMap((t) => t.questions.map((q) => norm(q.stem))));

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

  it('give every council exam at least 5 full-length practice mocks with exactly one free', () => {
    for (const [profession, shape] of Object.entries(EXAMS)) {
      const all = LICENSING_MOCKS.filter((t) => t.profession.slug === profession);
      const mocks = PRACTICE.filter((t) => t.profession.slug === profession);
      expect(mocks.length, profession).toBeGreaterThanOrEqual(5);
      expect(all.filter((t) => t.free).map((t) => t.slug), profession).toEqual([mocks[0]!.slug]);
      expect(all[0]!.slug, profession).toBe(mocks[0]!.slug);
      for (const t of mocks) {
        expect(t.questions, t.slug).toHaveLength(shape.questions);
        expect(t.minutes, t.slug).toBe(shape.minutes);
      }
    }
  });

  it('gives every question four options, one valid answer, an explanation and a known section', () => {
    for (const t of LICENSING_MOCKS) {
      const sections = new Set(t.sections.map((s) => s.name));
      t.questions.forEach((q, i) => {
        const where = `${t.slug}#${i + 1}`;
        expect(q.options, where).toHaveLength(4);
        expect(typeof q.correct === 'number' && q.correct >= 0 && q.correct < 4, where).toBe(true);
        expect(q.explanation.length, where).toBeGreaterThan(20);
        expect(sections.has(q.section), where).toBe(true);
        if (REAL_STEMS.has(norm(q.stem))) return; // real question, options as originally set
        expect(new Set(q.options.map((o) => o.trim().toLowerCase())).size, where).toBe(4);
        expect(q.options.join(' | '), where).not.toMatch(/all of the above|none of the above/i);
      });
    }
  });

  it('never repeats a question across the practice mocks, nor within a past paper', () => {
    const seen = new Map<string, string>();
    for (const t of PRACTICE) {
      for (const q of t.questions) {
        const k = norm(q.stem);
        expect(seen.get(k), `${t.slug}: ${q.stem.slice(0, 60)}`).toBeUndefined();
        seen.set(k, t.slug);
      }
    }
    for (const t of PAST_PAPERS) {
      const stems = t.questions.map((q) => norm(q.stem));
      expect(new Set(stems).size, t.slug).toBe(stems.length);
    }
  });

  it('spreads the correct answers over all four positions in every exam', () => {
    for (const profession of Object.keys(EXAMS)) {
      const counts = [0, 0, 0, 0];
      for (const t of PRACTICE.filter((x) => x.profession.slug === profession)) for (const q of t.questions) counts[q.correct as number]!++;
      const total = counts.reduce((a, b) => a + b, 0);
      for (const c of counts) expect(c / total, `${profession} ${counts.join('/')}`).toBeGreaterThan(0.15);
    }
  });

  it('the 2026-11-11 revision archives only stems that left the NCNM mocks (the reworded real questions)', () => {
    const ncnm = new Map(PRACTICE.filter((t) => t.profession.slug === 'ncnm-nurses-midwives-licensing-exam').map((t) => [t.slug, t]));
    let archived = 0;
    for (const [slug, prints] of Object.entries(ncnmRevision as Record<string, string[]>)) {
      const t = ncnm.get(slug);
      expect(t, slug).toBeDefined();
      const kept = new Set(t!.questions.map((q) => stemFingerprint(q.stem)));
      for (const p of prints) expect(kept.has(p), `${slug} ${p}`).toBe(false);
      archived += prints.length;
    }
    expect(archived).toBe(195);
  });

  it('publishes the NCNM past papers as locked, one-section papers timed at the NCNM pace', () => {
    expect(PAST_PAPERS.length).toBeGreaterThanOrEqual(6);
    for (const t of PAST_PAPERS) {
      expect(t.profession.slug, t.slug).toBe('ncnm-nurses-midwives-licensing-exam');
      expect(t.free, t.slug).toBe(false);
      expect(t.sections, t.slug).toHaveLength(1);
      expect(t.questions.length, t.slug).toBeGreaterThan(0);
      expect(t.questions.length, t.slug).toBeLessThanOrEqual(150);
      expect(t.minutes, t.slug).toBe(Math.ceil((t.questions.length * 1.2) / 5) * 5);
    }
  });
});
