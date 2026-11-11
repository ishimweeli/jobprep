import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { restructureContent } from '../../prisma/restructure-content';
import { ALL_TESTS } from '../../prisma/seed-lib';
import { resetAndSeed, testPrisma } from '../helpers';

const prisma = testPrisma();
const SLUG = 'sedo-full-mock-3';

// The full production catalogue (with the licensing mocks) takes over a minute to seed.
beforeAll(() => resetAndSeed(prisma, { full: true }), 300_000);
afterAll(() => prisma.$disconnect());

describe('restructure-content (real-exam marking and case studies on a live mock)', () => {
  it('moves live questions into the case studies, sets 1/3/4 marks, and is repeatable', async () => {
    const def = ALL_TESTS.find((t) => t.slug === SLUG)!;
    const mock = await prisma.mockTest.findUniqueOrThrow({ where: { countryCode_slug: { countryCode: 'RW', slug: SLUG } } });

    // Put the mock back the way it was live before the change: no cases, one mark each, no Case studies section.
    const firstSection = await prisma.section.findFirstOrThrow({ where: { mockTestId: mock.id, name: { not: 'Case studies' } }, orderBy: { sortOrder: 'asc' } });
    await prisma.question.updateMany({ where: { mockTestId: mock.id }, data: { caseId: null, type: 'SINGLE_CHOICE', marks: 1, sectionId: firstSection.id } });
    await prisma.case.deleteMany({ where: { mockTestId: mock.id } });
    await prisma.section.deleteMany({ where: { mockTestId: mock.id, name: 'Case studies' } });
    await prisma.mockTest.update({ where: { id: mock.id }, data: { totalMarks: 50 } });

    const dry = await restructureContent(prisma, { apply: false });
    expect(dry.lines.some((l) => l.startsWith(SLUG))).toBe(true);
    expect(await prisma.case.count({ where: { mockTestId: mock.id } })).toBe(0);

    await restructureContent(prisma, { apply: true });

    const after = await prisma.mockTest.findUniqueOrThrow({ where: { id: mock.id } });
    expect(Number(after.totalMarks)).toBe(100);
    const qs = await prisma.question.findMany({ where: { mockTestId: mock.id, status: 'PUBLISHED' }, orderBy: { sortOrder: 'asc' }, include: { section: true, case: true } });
    expect(qs).toHaveLength(50);
    expect(qs.map((q) => q.stem)).toEqual(def.questions.map((q) => q.stem));
    qs.forEach((q, i) => expect(Number(q.marks), `#${i + 1}`).toBe(i < 30 ? 1 : i < 40 ? 3 : 4));
    expect(qs.slice(40).every((q) => q.type === 'CASE_BASED' && q.section.name === 'Case studies' && q.case)).toBe(true);
    expect(new Set(qs.slice(40).map((q) => q.caseId)).size).toBe(2);
    expect(qs.slice(0, 40).every((q) => q.type === 'SINGLE_CHOICE' && !q.caseId)).toBe(true);

    // Running it again changes nothing.
    expect((await restructureContent(prisma, { apply: true })).mocks).toBe(0);
  });
});
