import { afterAll, describe, expect, it } from 'vitest';
import { DEV_PASSWORD, seedDatabase, truncateAll } from '../../prisma/seed-lib';
import { verifyPassword } from '../../src/services/password';
import { resetAndSeed, testPrisma } from '../helpers';

const prisma = testPrisma();
afterAll(async () => {
  await resetAndSeed(prisma); // leave a normal seeded database behind for whatever runs next
  await prisma.$disconnect();
});

const ADMIN_EMAILS = ['system.admin@jobprep.test', 'content.editor@jobprep.test', 'support@jobprep.test', 'multi.role@jobprep.test'];

describe('seeded dev admins', () => {
  it('exports the dev password and gives the four admins a hash of it, verified and set up', async () => {
    expect(DEV_PASSWORD).toBe('Password123!');
    await resetAndSeed(prisma);
    for (const email of ADMIN_EMAILS) {
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(u.passwordHash, email).toMatch(/^scrypt\$/);
      expect(await verifyPassword(DEV_PASSWORD, u.passwordHash!)).toBe(true);
      expect(u.emailVerifiedAt, email).not.toBeNull();
      expect(u.onboardedAt, email).not.toBeNull();
      expect(u.countryConfirmedAt, email).not.toBeNull();
    }
  }, 120_000); // re-seeds the whole catalogue

  it('NODE_ENV=production seeds NO passwords', async () => {
    const before = process.env.NODE_ENV;
    await truncateAll(prisma);
    process.env.NODE_ENV = 'production';
    try {
      await seedDatabase(prisma);
    } finally {
      process.env.NODE_ENV = before;
    }
    for (const email of ADMIN_EMAILS) {
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash, email).toBeNull();
    }
  }, 120_000); // re-seeds the whole catalogue
});
