/**
 * Options arrive shuffled per attempt, so the letter a candidate sees comes from the option's position, not its stored
 * key (answers are still sent and scored by key).
 */
export const optionLetter = (index: number) => String.fromCharCode(65 + index);

/** The on-screen letter of the option with this key, for text such as "the answer is C". */
export function letterOfKey(options: { key: string }[], key: string): string {
  const i = options.findIndex((o) => o.key === key);
  return i < 0 ? key : optionLetter(i);
}
