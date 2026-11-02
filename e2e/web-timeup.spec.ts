import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { choose, expectSaved, guestTokens, questionHeading, serverState, attemptIdFromUrl } from './web-exam-helpers';
import { isPhone, watchErrors } from './web-helpers';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? 'postgresql://jobprep:jobprep@localhost:5433/jobprep?schema=public' } },
});

/** Throwaway free test: 1 question, 1 minute. Created and deleted by this spec; seeded tests are never touched. */
const PREFIX = 'e2e-timeup-';

async function removeTimeUpTests() {
  const tests = await prisma.mockTest.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true, examId: true } });
  if (tests.length === 0) return;
  const ids = tests.map((t) => t.id);
  await prisma.attempt.deleteMany({ where: { mockTestId: { in: ids } } }); // answers go with their attempts
  await prisma.mockTest.deleteMany({ where: { id: { in: ids } } }); // sections and questions cascade
  await prisma.exam.deleteMany({ where: { id: { in: tests.map((t) => t.examId) }, mockTests: { none: {} } } });
}

async function createTimeUpTest(slug: string) {
  const category = await prisma.category.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'teaching-positions' } });
  const profession = await prisma.profession.findFirstOrThrow({ where: { categoryId: category.id } });
  const topic = await prisma.topic.findFirstOrThrow({ where: { categoryId: category.id } });
  const exam = await prisma.exam.create({ data: { professionId: profession.id, slug, name: 'E2E time-up exam' } });
  const test = await prisma.mockTest.create({
    data: {
      examId: exam.id, countryCode: 'RW', categoryId: category.id, slug, title: 'E2E time-up test', status: 'PUBLISHED', isFree: true,
      languages: ['en'], durationMinutes: 1, totalMarks: 1, publishedAt: new Date(), instructions: [],
    },
  });
  const section = await prisma.section.create({ data: { mockTestId: test.id, name: 'Only section', sortOrder: 0 } });
  await prisma.question.create({
    data: {
      mockTestId: test.id, sectionId: section.id, topicId: topic.id, stem: 'Which option is the first?', status: 'PUBLISHED', sortOrder: 0, marks: 1,
      payload: { options: [{ key: 'A', text: 'First' }, { key: 'B', text: 'Second' }], correct: ['A'] }, explanation: 'A comes first.',
    },
  });
  return test;
}

test.describe('Web: time runs out', () => {
  test.beforeAll(removeTimeUpTests);
  test.afterAll(async () => {
    await removeTimeUpTests();
    await prisma.$disconnect();
  });

  test('the server auto-submits at 0: "Time is up", the answer is kept, the result counts it', async ({ page, request }, info) => {
    test.setTimeout(150_000);
    const w = watchErrors(page);
    const slug = `${PREFIX}${info.project.name.startsWith('phone') ? 'phone' : 'desk'}-${Date.now()}`;
    await createTimeUpTest(slug);

    await page.goto(`/rw/tests/${slug}/start`);
    await expect(page).toHaveURL(/\/rw\/exam\/[a-z0-9]+$/);
    await expect(questionHeading(page)).toHaveText('Question 1 of 1');
    const id = attemptIdFromUrl(page);
    const tokens = await guestTokens(page);
    await choose(page, 'A');
    await expectSaved(page, info);
    await expect.poll(async () => (await serverState(request, id, tokens)).counts.answered).toBe(1);

    // the clock runs down from about 01:00 and turns red under five minutes (it is below five from the start)
    await expect(page.getByRole('timer')).toHaveAttribute('data-low', 'true');
    await expect(page.getByRole('timer')).toContainText(/^(0:|00:)?[0-5]\d$|^01:00$/);

    // nobody touches anything: at 0 the client asks the server, which has closed the attempt
    await expect(page.getByRole('heading', { level: 1, name: 'Time is up' })).toBeVisible({ timeout: 100_000 });
    await expect(page.getByText(/^Your exam was submitted automatically with 1 of 1 questions answered\. Nothing you answered was lost\.$/)).toBeVisible();
    if (isPhone(info)) {
      // phone: the whole screen is the message (TimeUp.dc)
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
    } else {
      // desktop: the exam stays in view, dimmed, behind a dialog (TimeUpDesktop.dc)
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Time is up');
      await expect(dialog.getByRole('link', { name: 'See my results' })).toBeFocused();
      await expect(page.locator('[role=timer]')).toHaveText('00:00'); // behind the dialog, so hidden from the accessibility tree
      await expect(page.locator('header [role=status]').first()).toHaveText('Submitted', { useInnerText: true });
      await expect(page.getByText('Submit exam')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Submit exam' })).toHaveCount(0); // drawn greyed out, not clickable
      await expect(page.getByRole('heading', { level: 1, name: 'Question 1 of 1' })).toBeHidden(); // the page behind is hidden from assistive tech
    }
    const state = await serverState(request, id, tokens);
    expect(state.attempt.status).toBe('AUTO_SUBMITTED');

    await page.getByRole('link', { name: 'See my results' }).click();
    await expect(page).toHaveURL(new RegExp(`/rw/results/${id}$`));
    await expect(page.getByRole('img', { name: 'Score 100 percent' })).toBeVisible(); // the answer was kept and scored
    await expect(page.getByText('1 / 1 marks')).toBeVisible();
    w.expectClean();
  });
});
