import { describe, expect, it } from 'vitest';
import { ALL_TESTS } from '../../prisma/seed-lib';
import { LICENSING_MOCKS, NCNM_PAST_PAPER_SLUGS } from '../../prisma/seed-data/licensing';
import ncnmRevision from '../../prisma/content-revisions/2026-11-11-ncnm-original-wording.json';
import cutRevision from '../../prisma/content-revisions/2026-11-11-licensing-100-questions.json';
import { stemFingerprint } from '../../prisma/revise-content';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Every licensing mock is 100 questions of 1 mark each (100 marks) in 2 hours (owner decision, 2026-11-11). */
const SHAPE = { questions: 100, minutes: 120 };
const EXAMS: Record<string, typeof SHAPE> = {
  'ncnm-nurses-midwives-licensing-exam': SHAPE,
  'npc-pharmacists-pre-registration-exam': SHAPE,
  'rmdc-medical-doctors-licensing-exam': SHAPE,
  'rahpc-biomedical-laboratory-sciences-licensing-exam': SHAPE,
  'rahpc-clinical-medicine-licensing-exam': SHAPE,
  'rahpc-anaesthesia-licensing-exam': SHAPE,
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

  it('give every council exam at least 5 practice mocks of 100 questions in 2 hours with exactly one free', () => {
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

  it('gives every licensing mock exactly 100 questions of one mark each (100 marks)', () => {
    for (const t of LICENSING_MOCKS) {
      expect(t.questions, t.slug).toHaveLength(100);
      expect(t.minutes, t.slug).toBe(120);
      expect(t.questions.every((q) => (q.marks ?? 1) === 1), t.slug).toBe(true);
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

  it('the 100-question revision only archives questions cut from the five NCNM practice mocks (50 each)', () => {
    const ncnm = new Map(PRACTICE.filter((t) => t.profession.slug === 'ncnm-nurses-midwives-licensing-exam').map((t) => [t.slug, t]));
    const entries = Object.entries(cutRevision as Record<string, string[]>);
    expect(entries).toHaveLength(5);
    for (const [slug, prints] of entries) {
      expect(prints, slug).toHaveLength(50);
      const kept = new Set(ncnm.get(slug)!.questions.map((q) => stemFingerprint(q.stem)));
      for (const p of prints) expect(kept.has(p), `${slug} ${p}`).toBe(false);
    }
  });

  it('publishes the real NCNM past papers as locked sets of 100, in paper order, with real questions word for word', () => {
    expect(PAST_PAPERS.length).toBeGreaterThanOrEqual(7);
    const seen = new Set<string>();
    for (const t of PAST_PAPERS) {
      expect(t.profession.slug, t.slug).toBe('ncnm-nurses-midwives-licensing-exam');
      expect(t.free, t.slug).toBe(false);
      expect(t.sections.length, t.slug).toBeGreaterThanOrEqual(1);
      for (const q of t.questions) {
        const k = norm(q.stem);
        // a real question appears once across the sets (the extra practice questions are never real ones)
        expect(seen.has(k), `${t.slug}: ${q.stem.slice(0, 60)}`).toBe(false);
        seen.add(k);
      }
    }
    expect(seen.size).toBe(PAST_PAPERS.length * 100);
  });
});
