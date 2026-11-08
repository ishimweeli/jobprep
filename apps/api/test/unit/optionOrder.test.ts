import { describe, expect, it } from 'vitest';
import { optionSeed, shuffleOptions, shuffleQuestions } from '../../src/domain/optionOrder';

const qs = (spec: string) =>
  // "a1 a2 a3 | b1 b2c b3c b4" → section a: 3 questions; section b: b2/b3 share case c.
  spec.split('|').flatMap((part, s) =>
    part.trim().split(/\s+/).map((id) => ({ id, sectionId: `s${s}`, caseId: id.endsWith('c') ? `case-${s}` : null })));

describe('shuffleQuestions', () => {
  const list = qs('a1 a2 a3 a4 a5 a6 | b1 b2c b3c b4 b5');

  it('is stable for one attempt and keeps every question once', () => {
    const one = shuffleQuestions(list, 'att1');
    expect(shuffleQuestions(list, 'att1')).toEqual(one);
    expect(one.map((q) => q.id).sort()).toEqual(list.map((q) => q.id).sort());
  });

  it('keeps sections in order and case questions together, in order', () => {
    for (let n = 0; n < 50; n++) {
      const ids = shuffleQuestions(list, `att${n}`).map((q) => q.id);
      expect(ids.slice(0, 6).every((id) => id.startsWith('a'))).toBe(true);
      const at = ids.indexOf('b2c');
      expect(ids[at + 1]).toBe('b3c');
    }
  });

  it('gives different attempts different orders', () => {
    const orders = new Set(Array.from({ length: 20 }, (_, n) => shuffleQuestions(list, `att${n}`).map((q) => q.id).join()));
    expect(orders.size).toBeGreaterThan(10);
  });
});

const opts = (...texts: string[]) => texts.map((text, i) => ({ key: 'ABCDEF'[i]!, text }));

describe('shuffleOptions', () => {
  it('is stable for the same attempt and question', () => {
    const o = opts('one', 'two', 'three', 'four');
    expect(shuffleOptions(o, optionSeed('att1', 'q1'))).toEqual(shuffleOptions(o, optionSeed('att1', 'q1')));
  });

  it('never flips a True / False pair', () => {
    const o = opts('True', 'False');
    for (let n = 0; n < 30; n++) expect(shuffleOptions(o, `att${n}`).map((x) => x.text)).toEqual(['True', 'False']);
  });

  it('keeps every option and its key', () => {
    const o = opts('one', 'two', 'three', 'four');
    const out = shuffleOptions(o, 'seed');
    expect([...out].sort((a, b) => a.key.localeCompare(b.key))).toEqual(o);
  });

  it('spreads the first option across all positions over many attempts', () => {
    const o = opts('one', 'two', 'three', 'four');
    const seen = new Set<number>();
    for (let n = 0; n < 200; n++) seen.add(shuffleOptions(o, optionSeed(`att${n}`, 'q1')).findIndex((x) => x.key === 'A'));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('keeps "None is correct" / "All are correct" / "No true answer" in place', () => {
    for (const last of ['None is correct', 'None of the mentioned', 'All are correct', 'All answers are correct', 'No true answer']) {
      const o = opts('one', 'two', 'three', last);
      for (let n = 0; n < 30; n++) expect(shuffleOptions(o, `s${n}`)[3]!.text).toBe(last);
    }
  });

  it('does not shuffle options that refer to other options by letter', () => {
    const o = opts('one', 'two', 'three', 'A & C are correct');
    for (let n = 0; n < 30; n++) expect(shuffleOptions(o, `s${n}`)).toEqual(o);
  });
});
