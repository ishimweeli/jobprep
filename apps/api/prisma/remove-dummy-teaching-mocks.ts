import { PrismaClient } from '@prisma/client';

/**
 * One-off cleanup, requested directly: removes 5 leftover placeholder/dummy mocks (small, pre-MIFOTRA sample
 * content) from the live catalog — Primary Teacher General, Secondary Mathematics Teacher S1-S3 and S4-S6,
 * Teaching Profession & CBC Pedagogy, and Headteacher School Leadership Mock 1. Database rows only: these
 * stay in ALL_TESTS/seed-data (they're also used as fixture data by ~14 backend integration tests), so a
 * fresh `prisma migrate reset && seed` or a `sync-content` run would recreate them — this is a one-time
 * catalog cleanup, not a permanent removal from the codebase. Never deletes a mock any candidate has
 * actually attempted — reports it instead, so a real attempt is never silently destroyed. Safe to run more
 * than once: already-removed slugs are just reported as not found.
 */
const SLUGS = [
  'primary-teacher-general-p1-p6-mock-1',
  'secondary-mathematics-teacher-s1-s3-mock-1',
  'secondary-mathematics-teacher-s4-s6-mock-1',
  'teaching-profession-cbc-pedagogy',
  'headteacher-school-leadership-mock-1',
];

async function main() {
  const prisma = new PrismaClient();
  let removed = 0, notFound = 0, hadAttempts = 0;
  try {
    for (const slug of SLUGS) {
      const mock = await prisma.mockTest.findUnique({ where: { countryCode_slug: { countryCode: 'RW', slug } } });
      if (!mock) { notFound++; continue; }
      const attempts = await prisma.attempt.count({ where: { mockTestId: mock.id } });
      if (attempts > 0) {
        console.log(`SKIPPED (has ${attempts} real attempt(s), not deleted): ${slug}`);
        hadAttempts++;
        continue;
      }
      await prisma.mockTest.delete({ where: { id: mock.id } });
      console.log(`Removed: ${slug}`);
      removed++;
    }
    console.log(`\nRemoved: ${removed}, not found (already gone): ${notFound}, skipped (had attempts): ${hadAttempts}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
