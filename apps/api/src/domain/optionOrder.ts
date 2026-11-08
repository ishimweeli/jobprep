/**
 * Per-attempt ordering: question order (see `shuffleQuestions` below) and option order.
 *
 * The order a candidate sees a question's options in. Options are shuffled per attempt so the right answer is not
 * always in the same place (seed content leans heavily towards A and B), and the order is stable: the same attempt
 * and question always give the same order, so a reload, the review page and practice feedback all match.
 *
 * Option keys never change, so answers are still saved and scored by key; the web app letters options by position.
 *
 * - "None of the above" / "All are correct" style options keep their place (they read as a last option).
 * - A question whose options refer to other options by letter ("A & B", "Both A and C") is not shuffled.
 */

const CATCH_ALL = /^\s*((none|all)\b.*\b(above|correct|mentioned|options|answers|these|of them)\b|no (true|correct) answer)/i;
const LETTER_REF = /\b[A-F]\s*(&|and|\+)\s*[A-F]\b|\bboth [A-F]\b|\b(option|answer)s? [A-F]\b/i;

/** FNV-1a: a small, stable string hash. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a deterministic PRNG from a 32-bit seed. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleOptions<T extends { text: string }>(options: T[], seed: string): T[] {
  if (options.some((o) => LETTER_REF.test(o.text))) return options;
  const movable = options.map((o, i) => ({ o, i })).filter(({ o }) => !CATCH_ALL.test(o.text));
  const order = shuffleInPlace(movable.map(({ o }) => o), random(hash(seed)));
  const out = [...options];
  movable.forEach(({ i }, n) => (out[i] = order[n]!));
  return out;
}

/** The seed for one question in one attempt. */
export const optionSeed = (attemptId: string, questionId: string) => `${attemptId}:${questionId}`;

function shuffleInPlace<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/**
 * The order an attempt shows its questions in. `questions` arrive in authored order (section, then sortOrder).
 * Sections keep their order; inside each section the questions are shuffled per attempt (stable for that attempt),
 * and the questions of one case stay together, in their authored order, as a single block.
 */
export function shuffleQuestions<T extends { id: string; sectionId: string; caseId: string | null }>(questions: T[], attemptId: string): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < questions.length) {
    const sectionId = questions[i]!.sectionId;
    const units: T[][] = [];
    const caseUnit = new Map<string, T[]>();
    for (; i < questions.length && questions[i]!.sectionId === sectionId; i++) {
      const q = questions[i]!;
      if (q.caseId === null) units.push([q]);
      else if (caseUnit.has(q.caseId)) caseUnit.get(q.caseId)!.push(q);
      else {
        const unit = [q];
        caseUnit.set(q.caseId, unit);
        units.push(unit);
      }
    }
    out.push(...shuffleInPlace(units, random(hash(`${attemptId}:section:${sectionId}`))).flat());
  }
  return out;
}
