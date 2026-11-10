import { describe, expect, it } from 'vitest';
import { checkWritten, type Written, type WrittenQuestion } from '../../prisma/pipeline/check';
import type { WorkList } from '../../prisma/pipeline/scan';

const work = { jobs: [{ newMocks: [{ slug: 'case-test-mock-1', title: 'Case test', free: false }] }] } as unknown as WorkList;

/** Distinct stems and four distinct options; the correct option rotates so it is not always the longest. */
const q = (n: number, section: string, extra: Partial<WrittenQuestion> = {}): WrittenQuestion => ({
  section, topic: 'Topic', stem: `Zxqv question number ${n} about a rule of pipeline test ${n * 7}?`,
  options: [`first value ${n}`, `second value ${n} longer`, `third value ${n}`, `fourth value ${n} extra`], correct: n % 4,
  explanation: `The rule says value ${n}.`, source: 'Test source', ...extra,
});

function mock(): Written {
  const sections = ['Duties', 'Laws', 'Policies'];
  const questions: WrittenQuestion[] = [];
  for (let i = 0; i < 40; i++) questions.push(q(i, sections[i % 3]!));
  for (let i = 40; i < 50; i++) questions.push(q(i, 'Case studies', { case: Math.floor((i - 40) / 5) }));
  const passage = ['One of the responsibilities of the officer is to know this subject. Suppose that you are asked to brief the district; first answer the questions.'];
  return { newMocks: [{ slug: 'case-test-mock-1', title: 'Case test', summary: 'Test.', free: false, sections, cases: [{ title: 'Law A', passage }, { title: 'Policy B', passage }], questions }] };
}

describe('daily pipeline: new mocks follow the real-exam structure', () => {
  it('accepts 40 plain questions followed by two cases of five', () => {
    expect(checkWritten(work, mock()).problems).toEqual([]);
  });

  it('rejects a mock without its two cases', () => {
    const d = mock();
    delete d.newMocks![0]!.cases;
    expect(checkWritten(work, d).problems.join('\n')).toMatch(/exactly 2 cases/);
  });

  it('rejects a case question with the wrong case number or section', () => {
    const d = mock();
    d.newMocks![0]!.questions[44]!.case = 1;
    d.newMocks![0]!.questions[45]!.section = 'Laws';
    const p = checkWritten(work, d).problems.join('\n');
    expect(p).toMatch(/#44: should have case 0/);
    expect(p).toMatch(/#45: questions 41–50 belong to section "Case studies"/);
  });

  it('rejects a plain question placed inside a case and a passage that is too short', () => {
    const d = mock();
    d.newMocks![0]!.questions[3]!.case = 0;
    d.newMocks![0]!.cases![1]!.passage = ['Too short.'];
    const p = checkWritten(work, d).problems.join('\n');
    expect(p).toMatch(/#3: questions 1–40 are not part of a case/);
    expect(p).toMatch(/case 1 needs a passage/);
  });
});
