import type { User } from '@prisma/client';
import type { Ctx } from './attempts';

export interface RecommendedTest {
  slug: string;
  title: string;
  isFree: boolean;
  durationMinutes: number;
  questionCount: number;
  matchedSubject: boolean;
  matchedLevel: boolean;
  reason: 'subject_level' | 'subject' | 'level' | 'goal';
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

/**
 * "Secondary (S1–S3)" -> the word "secondary" and the code "s1-s3". A test matches the level when its title or profession
 * has the word, or its title carries the code.
 */
function levelNeedles(level: string) {
  const inner = level.match(/\(([^)]+)\)/)?.[1];
  const word = words(level.replace(/\([^)]*\)/, ''));
  const code = inner ? fold(inner).replace(/[–—−]/g, '-').replace(/\s+/g, '') : null;
  return { word, code };
}
const dashes = (s: string) => fold(s).replace(/[–—−]/g, '-').replace(/\s+/g, '');

/**
 * Tests worth taking next, for this person: the tests of their goal category (the featured category when they have none),
 * those matching their SUBJECT and LEVEL first, tests they already completed last, free before paid on a tie.
 * Matching is a text match on the title, the profession and the topic names; it never hides a test, it only ranks.
 */
export async function recommendTests(ctx: Ctx, user: User, limit = 3) {
  const { prisma } = ctx;
  const goal = user.goalCategoryId
    ? await prisma.category.findUnique({ where: { id: user.goalCategoryId }, select: { id: true, name: true } })
    : null;
  const categoryId = goal?.id ?? (await prisma.category.findFirst({ where: { countryCode: user.countryCode, featured: true }, select: { id: true } }))?.id;

  const basis = { goal: goal && { id: goal.id, name: goal.name }, level: user.level, subject: user.subject };
  if (!categoryId) return { basis, tests: [] as RecommendedTest[] };

  const [tests, completed] = await Promise.all([
    prisma.mockTest.findMany({
      where: { countryCode: user.countryCode, status: 'PUBLISHED', categoryId },
      include: {
        exam: { select: { profession: { select: { name: true } } } },
        _count: { select: { questions: { where: { status: 'PUBLISHED' } } } },
        questions: { where: { status: 'PUBLISHED' }, select: { topic: { select: { name: true } } }, distinct: ['topicId'] },
      },
    }),
    prisma.attempt.findMany({
      where: { userId: user.id, kind: 'FULL', status: { not: 'IN_PROGRESS' } }, select: { mockTestId: true }, distinct: ['mockTestId'],
    }),
  ]);
  const done = new Set(completed.map((c) => c.mockTestId));
  const subjectWords = user.subject ? words(user.subject) : [];
  const level = user.level ? levelNeedles(user.level) : null;

  const ranked = tests.map((t) => {
    const haystack = fold(`${t.title} ${t.exam.profession.name} ${t.questions.map((q) => q.topic.name).join(' ')}`);
    const levelHay = fold(`${t.title} ${t.exam.profession.name}`);
    const matchedSubject = subjectWords.length > 0 && subjectWords.every((w) => haystack.includes(w));
    // The code in brackets ("S4-S6") is a sharper match than the word ("secondary") and ranks above it.
    const codeMatch = !!level?.code && dashes(t.title).includes(level.code);
    const wordMatch = !!level && level.word.some((w) => levelHay.includes(w));
    const matchedLevel = codeMatch || wordMatch;
    const reason: RecommendedTest['reason'] = matchedSubject && matchedLevel ? 'subject_level' : matchedSubject ? 'subject' : matchedLevel ? 'level' : 'goal';
    return {
      done: done.has(t.id), score: (matchedSubject ? 2 : 0) + (codeMatch ? 2 : wordMatch ? 1 : 0), t,
      card: {
        slug: t.slug, title: t.title, isFree: t.isFree, durationMinutes: t.durationMinutes, questionCount: t._count.questions,
        matchedSubject, matchedLevel, reason,
      } satisfies RecommendedTest,
    };
  });
  ranked.sort((a, b) =>
    Number(a.done) - Number(b.done) || b.score - a.score || Number(b.t.isFree) - Number(a.t.isFree) || a.t.title.localeCompare(b.t.title));
  return { basis, tests: ranked.slice(0, limit).map((r) => r.card) };
}
