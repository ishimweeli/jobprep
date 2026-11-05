import { PrismaClient } from '@prisma/client';

/**
 * One-off cleanup, requested directly: removes every remaining leftover placeholder/dummy or pre-"full
 * mock" leftover from the live catalog — small free samples, and three early "Mock N" leftovers
 * (Executive Secretary Local Government Mock 3, SEDO Mock 1, Accountant Public Institution Mock 1) that
 * predate the 100-question full-length mocks built for those same professions and are now redundant with
 * them. Two (`secondary-mathematics-teacher-sample`, `accountant-mock-1`) are Kenya (KE) placeholders.
 * Database rows only: these stay in ALL_TESTS/seed-data (also used as fixture data by backend integration
 * tests), so a fresh `prisma migrate reset && seed` or a `sync-content` run would recreate them — this is
 * a one-time catalog cleanup, not a permanent removal from the codebase. Never deletes a mock any candidate
 * has actually attempted — reports it instead, so a real attempt is never silently destroyed. Safe to run
 * more than once: already-removed slugs are just reported as not found.
 */
const SLUGS: { slug: string; country: 'RW' | 'KE' }[] = [
  { slug: 'primary-teacher-general-p1-p6-mock-1', country: 'RW' },
  { slug: 'secondary-mathematics-teacher-s1-s3-mock-1', country: 'RW' },
  { slug: 'secondary-mathematics-teacher-s4-s6-mock-1', country: 'RW' },
  { slug: 'teaching-profession-cbc-pedagogy', country: 'RW' },
  { slug: 'headteacher-school-leadership-mock-1', country: 'RW' },
  { slug: 'executive-secretary-free-sample', country: 'RW' },
  { slug: 'executive-secretary-cell-mock-2', country: 'RW' },
  { slug: 'executive-secretary-local-government-mock-3', country: 'RW' },
  { slug: 'sedo-local-economic-development-mock-1', country: 'RW' },
  { slug: 'accountant-public-institution-mock-1', country: 'RW' },
  { slug: 'accountant-free-sample', country: 'RW' },
  { slug: 'procurement-officer-free-sample', country: 'RW' },
  { slug: 'procurement-officer-mock-1', country: 'RW' },
  { slug: 'ict-officer-free-sample', country: 'RW' },
  { slug: 'secondary-mathematics-teacher-sample', country: 'KE' },
  { slug: 'accountant-mock-1', country: 'KE' },
];

async function main() {
  const prisma = new PrismaClient();
  let removed = 0, notFound = 0, hadAttempts = 0;
  try {
    for (const { slug, country } of SLUGS) {
      const mock = await prisma.mockTest.findUnique({ where: { countryCode_slug: { countryCode: country, slug } } });
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
