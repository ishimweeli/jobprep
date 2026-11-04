import { isApiError } from '../../api/client';
import { usedByWords } from './mockTestForm';

/**
 * Words for the "used by N" guard of categories, sections, topics and case studies (A7, A8). The API refuses the delete
 * with 409 and `usedBy: { mockTests, topics, ... }`; the screens say who still uses the thing, in a sentence.
 */

export function inUseSentence(usedBy: unknown, what: string, tail: string): string {
  const who = usedByWords(usedBy);
  return who ? `${who}, so this ${what} cannot be deleted. ${tail}` : `This ${what} is still in use, so it cannot be deleted. ${tail}`;
}

/** The count-based version for the button's explanation before anything is tried: `{ questions: 3 }` -> "Used by 3 questions ..." */
export const blockedByCounts = (counts: Record<string, number>, what: string, tail: string): string | undefined => {
  const present = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
  return Object.keys(present).length ? inUseSentence(present, what, tail) : undefined;
};

/**
 * Runs a delete and, when the API answers 409 with the given code, writes the sentence into `errors` (the dialog's
 * code -> words map; mutated so the dialog reads it when the call fails) before the error is thrown on.
 */
export async function guarded<T>(errors: Record<string, string>, code: string, what: string, tail: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isApiError(e) && e.code === code) errors[code] = inUseSentence(e.details.usedBy, what, tail);
    throw e;
  }
}

export interface Named { id: string }
/** The ids after moving one entry, for the reorder calls. */
export const idsAfterMove = <T extends Named>(list: T[], from: number, to: number): string[] => {
  const next = list.map((x) => x.id);
  if (from < 0 || to < 0 || from >= next.length || to >= next.length || from === to) return next;
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
};

/** "Moved Teaching to position 2 of 5", for the live region after a reorder. */
export const movedAnnouncement = (name: string, position: number, total: number) => `Moved ${name} to position ${position} of ${total}.`;

// ───────────────────────── Field checks shared by the small editors
export interface NameProblem { name?: string; label?: string }
export function checkName(name: string, min = 2, max = 120): string | undefined {
  const n = name.trim().length;
  if (n < min) return `Write a name of at least ${min} characters.`;
  if (n > max) return `Keep the name to ${max} characters or fewer.`;
  return undefined;
}
