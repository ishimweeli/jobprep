import type { TestDef } from './types';
import data from './psychometric-real/mocks.json';

// Psychometric Test Preparation, Mocks 6-9: more practice in the format of MIFOTRA's psychometric test (see Mock 5 in
// tests-psychometric-prep.ts): 21 questions in four domains (critical thinking, problem solving, time management, clear
// and effective communication), scenario and knowledge questions with 3 marks, short true/false and fill-in items with
// 2 marks, and one 4-mark sequence question, 60 marks in all. These are original practice questions written for JobPrep
// in the style of that format; they are not copies of the real test. Each was checked by a second reader for a single
// clearly best answer and for correct arithmetic. The real test counts down per question; here there is one timer.

const PROFESSION = { slug: 'psychometric-test-preparation', name: 'Psychometric Test Preparation' };
const CATEGORY = 'other-professional';
const SUMMARY = 'A 21-question practice test in the format MIFOTRA’s psychometric test is reported to use: workplace scenarios plus true/false and fill-in items on critical thinking, problem solving, time management and clear communication. Original practice questions in the same style; do not expect the same questions in your own test.';

interface RealQuestion { section: string; marks: number; stem: string; options: string[]; correct: number; explanation: string }
const MOCKS = data as unknown as Record<string, RealQuestion[]>;

const THEMES: Record<number, string> = { 6: 'Citizen Services', 7: 'Office and Projects', 8: 'Health, Schools and Operations', 9: 'Leading a Team' };

const build = (n: number): TestDef => {
  const questions = MOCKS[String(n)]!.map((q) => ({ section: q.section, topic: q.section, marks: q.marks, stem: q.stem, options: q.options, correct: q.correct, explanation: q.explanation }));
  return {
    country: 'RW',
    category: CATEGORY,
    profession: PROFESSION,
    slug: `psychometric-test-preparation-mock-${n}`,
    title: `Psychometric Test Preparation — Mock Exam ${n}: The Real Test Format (${THEMES[n]})`,
    summary: SUMMARY,
    free: false,
    difficulty: 'STANDARD',
    minutes: 20,
    sections: [...new Set(questions.map((q) => q.section))].map((name) => ({ name })),
    questions,
  };
};

export const PSYCHOMETRIC_REAL_FORMAT_MOCKS: TestDef[] = [6, 7, 8, 9].map(build);
