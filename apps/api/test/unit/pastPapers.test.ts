import { describe, expect, it } from 'vitest';
import { ALL_TESTS, SEED_TESTS } from '../../prisma/seed-lib';
import revision from '../../prisma/content-revisions/2026-11-09-past-papers.json';
import { stemFingerprint } from '../../prisma/revise-content';

const JOBS = ['executive-secretary', 'socio-economic-development-officer', 'human-capital-social-development-officer'];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

describe('real past-paper questions in the Executive Secretary, Economic Development and Human Capital mocks', () => {
  const seedBySlug = new Map(SEED_TESTS.map((t) => [t.slug, t]));
  const jobMocks = (job: string) => ALL_TESTS.filter((t) => t.country === 'RW' && t.profession.slug === job && t.questions.length >= 40);

  it('keeps every job mock at exactly 50 questions with its section sizes unchanged', () => {
    for (const job of JOBS) {
      const mocks = jobMocks(job);
      expect(mocks.length).toBeGreaterThanOrEqual(5);
      for (const t of mocks) {
        expect(t.questions, t.slug).toHaveLength(50);
        const seed = seedBySlug.get(t.slug);
        if (!seed) continue;
        // Ten questions move into the two case studies (see exam-structure); every other section keeps its size.
        let moved = 0;
        for (const s of t.sections.filter((x) => x.name !== 'Case studies')) {
          const before = seed.questions.filter((q) => q.section === s.name).length;
          const after = t.questions.filter((q) => q.section === s.name).length;
          expect(after, `${t.slug} / ${s.name}`).toBeLessThanOrEqual(before);
          moved += before - after;
        }
        expect(moved, `${t.slug} moved into case studies`).toBe(t.questions.filter((q) => q.section === 'Case studies').length);
      }
    }
  });

  it('gives every question four distinct options, a valid answer, an explanation and a known section', () => {
    for (const job of JOBS) {
      for (const t of jobMocks(job)) {
        const sections = new Set(t.sections.map((s) => s.name));
        t.questions.forEach((q, i) => {
          const where = `${t.slug}#${i + 1}`;
          expect(sections.has(q.section), `${where} section`).toBe(true);
          expect(q.options, `${where} options`).toHaveLength(4);
          expect(new Set(q.options.map(norm)).size, `${where} distinct options`).toBe(4);
          const correct = Array.isArray(q.correct) ? q.correct[0] : q.correct;
          expect(correct, `${where} answer`).toBeGreaterThanOrEqual(0);
          expect(correct, `${where} answer`).toBeLessThan(4);
          expect(q.explanation.length, `${where} explanation`).toBeGreaterThan(9);
        });
      }
    }
  });

  it('never repeats a question stem inside one job', () => {
    for (const job of JOBS) {
      const seen = new Map<string, string>();
      for (const t of jobMocks(job)) {
        for (const q of t.questions) {
          const key = norm(q.stem);
          expect(seen.has(key), `"${q.stem.slice(0, 60)}" is in both ${seen.get(key)} and ${t.slug}`).toBe(false);
          seen.set(key, t.slug);
        }
      }
    }
  });

  it('lists in the revision exactly the generic questions that were replaced', () => {
    for (const [slug, removed] of Object.entries(revision as Record<string, string[]>)) {
      const final = ALL_TESTS.find((t) => t.slug === slug);
      expect(final, slug).toBeDefined();
      // Mocks 1-5 had generic or earlier questions replaced; extra mocks (6-10) had a question swapped out. Either way the
      // archived stems must be gone from the mock as it is seeded now.
      const finalFingerprints = new Set(final!.questions.map((q) => stemFingerprint(q.stem)));
      for (const fp of removed) expect(finalFingerprints.has(fp), `${slug}: ${fp} is still in the mock`).toBe(false);
      expect(new Set(removed).size).toBe(removed.length);
    }
  });
});
