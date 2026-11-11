import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reviseContent, stemFingerprint } from '../../prisma/revise-content';
import { ALL_TESTS } from '../../prisma/seed-lib';
import { syncContent } from '../../prisma/sync-content';
import { resetAndSeed, testPrisma } from '../helpers';

const prisma = testPrisma();

// The whole catalogue: this test is about content that is in seed-data but removed or re-worded on a live database.
// The full production catalogue (with the licensing mocks) takes over a minute to seed.
beforeAll(() => resetAndSeed(prisma, { full: true }), 300_000);
afterAll(() => prisma.$disconnect());

describe('revise-content (taking questions out of a live mock)', () => {
  it('archives removed questions, pins past attempts, leaves edited questions alone, and is repeatable', async () => {
    const def = ALL_TESTS.find((t) => t.country === 'RW' && t.questions.length >= 10 && !t.cases?.length)!;
    const mock = await prisma.mockTest.findUniqueOrThrow({ where: { countryCode_slug: { countryCode: 'RW', slug: def.slug } } });
    const live = await prisma.question.findMany({ where: { mockTestId: mock.id, status: 'PUBLISHED' }, orderBy: { sortOrder: 'asc' } });

    // A candidate finished this mock before the revision; an in-progress one should not be pinned.
    const started = new Date(Date.now() - 3_600_000);
    const done = await prisma.attempt.create({
      data: {
        mockTestId: mock.id, countryCode: 'RW', guestToken: 'revise-test-token-1', status: 'SUBMITTED', durationSeconds: 1800,
        startedAt: started, deadlineAt: new Date(started.getTime() + 1_800_000), submittedAt: new Date(started.getTime() + 600_000),
        scoreMarks: 1, totalMarks: live.length, percent: 10,
      },
    });
    const open = await prisma.attempt.create({
      data: { mockTestId: mock.id, countryCode: 'RW', guestToken: 'revise-test-token-2', status: 'IN_PROGRESS', durationSeconds: 1800, deadlineAt: new Date(Date.now() + 600_000) },
    });

    // An admin edited the third question's stem: its old fingerprint is in the revision but must not match it.
    const [q1, q2, q3] = live;
    await prisma.question.update({ where: { id: q3!.id }, data: { stem: `${q3!.stem} (edited by an admin)` } });
    const revision = { [def.slug]: [q1!.stem, q2!.stem, q3!.stem].map(stemFingerprint) };

    const dry = await reviseContent(prisma, revision, { apply: false });
    expect(dry.archived).toBe(2);
    expect(await prisma.question.count({ where: { mockTestId: mock.id, status: 'ARCHIVED' } })).toBe(0);

    const r = await reviseContent(prisma, revision, { apply: true });
    expect(r).toMatchObject({ archived: 2, pinned: 1 });

    const archived = await prisma.question.findMany({ where: { mockTestId: mock.id, status: 'ARCHIVED' }, select: { id: true } });
    expect(archived.map((q) => q.id).sort()).toEqual([q1!.id, q2!.id].sort());
    expect((await prisma.question.findUniqueOrThrow({ where: { id: q3!.id } })).status).toBe('PUBLISHED');

    // The finished attempt keeps the full paper it sat; the open one is untouched.
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: done.id } })).questionIds).toEqual(live.map((q) => q.id));
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: open.id } })).questionIds).toEqual([]);

    const after = await prisma.mockTest.findUniqueOrThrow({ where: { id: mock.id } });
    expect(Number(after.totalMarks)).toBe(live.slice(2).reduce((s, q) => s + Number(q.marks), 0));

    // Running it again changes nothing.
    expect((await reviseContent(prisma, revision, { apply: true })).archived).toBe(0);
  });

  it('archives the second copy of a duplicated question in a revised mock', async () => {
    const def = ALL_TESTS.filter((t) => t.country === 'RW' && t.questions.length >= 10 && !t.cases?.length)[1]!;
    const mock = await prisma.mockTest.findUniqueOrThrow({ where: { countryCode_slug: { countryCode: 'RW', slug: def.slug } } });
    const first = await prisma.question.findFirstOrThrow({ where: { mockTestId: mock.id, status: 'PUBLISHED' }, orderBy: { sortOrder: 'asc' } });
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = first;
    const dup = await prisma.question.create({ data: { ...copy, payload: copy.payload as object, sortOrder: 999 } });

    const r = await reviseContent(prisma, { [def.slug]: [] }, { apply: true });
    expect(r.archived).toBe(1);
    expect((await prisma.question.findUniqueOrThrow({ where: { id: dup.id } })).status).toBe('ARCHIVED');
    expect((await prisma.question.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('PUBLISHED');
  });

  it('sync-content then adds nothing: no archived question returns, no admin-edited question is duplicated', async () => {
    const before = await prisma.question.count();
    const s = await syncContent(prisma);
    expect(s.questionsAddedToExisting).toBe(0);
    expect(await prisma.question.count()).toBe(before);
  });
});
