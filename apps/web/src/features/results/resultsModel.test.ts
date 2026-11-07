import { describe, expect, it } from 'vitest';
import { answerText, barHeight, JOBPREP_PASS_MARK, passVerdict, deltaHeadline, historyLabel, marksLabel, percentLabel, RING_CIRCUMFERENCE, ringDash, timeSpent, timeSpentChange, topicBarColor } from './resultsModel';

describe('score ring', () => {
  it('uses the artboard geometry: 72% is "244.3 339.3"', () => {
    expect(RING_CIRCUMFERENCE).toBeCloseTo(339.29, 1);
    expect(ringDash(72)).toBe('244.3 339.3');
  });
  it('0%, 100% and out-of-range values', () => {
    expect(ringDash(0)).toBe('0 339.3');
    expect(ringDash(100)).toBe('339.3 339.3');
    expect(ringDash(140)).toBe('339.3 339.3');
    expect(ringDash(-5)).toBe('0 339.3');
  });
  it('labels: 72%, 36 / 50 marks, half marks kept', () => {
    expect(percentLabel(71.6)).toBe('72%');
    expect(marksLabel({ marks: 36, totalMarks: 50, percent: 72 })).toBe('36 / 50 marks');
    expect(marksLabel({ marks: 7.5, totalMarks: 10, percent: 75 })).toBe('7.5 / 10 marks');
  });
});

describe('comparison wording', () => {
  it('Up / Down N points, whole numbers', () => {
    expect(deltaHeadline(10)).toBe('Up 10 points');
    expect(deltaHeadline(1.2)).toBe('Up 1 point');
    expect(deltaHeadline(-4)).toBe('Down 4 points');
    expect(deltaHeadline(0.2)).toBe('No change');
    expect(deltaHeadline(null)).toBeNull();
  });
  it('time spent as m:ss and its change', () => {
    expect(timeSpent(3102)).toBe('51:42');
    expect(timeSpent(null)).toBe('–');
    expect(timeSpentChange(3102, 3250)).toEqual({ verb: 'dropped from', from: '54:10', to: '51:42' });
    expect(timeSpentChange(3300, 3250)?.verb).toBe('rose from');
    expect(timeSpentChange(null, 3250)).toBeNull();
  });
  it('bar heights match the artboard (62% -> 99px, 72% -> 115px)', () => {
    expect(barHeight(62)).toBe(99);
    expect(barHeight(72)).toBe(115);
  });
  it('"Today" for the attempt just finished, else the date', () => {
    const now = new Date('2026-11-02T12:00:00');
    expect(historyLabel({ submittedAt: '2026-11-02T09:00:00', current: true }, now)).toBe('Today');
    expect(historyLabel({ submittedAt: '2026-10-24T09:00:00', current: false }, now)).toBe('24 Oct');
  });
});

describe('topics', () => {
  it('bar colours: weak amber, under 70% light violet, otherwise violet', () => {
    expect(topicBarColor({ percent: 50, weak: true })).toBe('#8A5300');
    expect(topicBarColor({ percent: 67, weak: false })).toBe('#2D62CF');
    expect(topicBarColor({ percent: 83, weak: false })).toBe('#164A7A');
  });
  it('answer text joins several picks', () => {
    expect(answerText(['A', 'B'])).toBe('A, B');
    expect(answerText([])).toBeNull();
    expect(answerText(null)).toBeNull();
  });
});

describe('pass verdict', () => {
  const score = (percent: number) => ({ marks: percent, totalMarks: 100, percent });

  it('uses the JobPrep 80% when no official pass mark is set', () => {
    expect(JOBPREP_PASS_MARK).toBe(80);
    expect(passVerdict(score(80), null)).toMatchObject({ passed: true, passMark: 80, official: false, title: 'Passed' });
    expect(passVerdict(score(84), null).line).toBe('You scored 84%, at or above the 80% JobPrep pass mark.');
    const fail = passVerdict(score(67.5), null);
    expect(fail).toMatchObject({ passed: false, title: 'Not passed' });
    expect(fail.line).toBe('You scored 68%. The JobPrep pass mark is 80%: 13% more to pass.');
  });

  it('an official pass mark replaces it and is named as official', () => {
    const v = passVerdict(score(55), { percent: 50, source: 'MIFOTRA notice' });
    expect(v).toMatchObject({ passed: true, passMark: 50, official: true });
    expect(v.line).toContain('50% official pass mark');
  });
});
