import { PrismaClient } from '@prisma/client';
import type { Config } from '../src/config';
import { loadConfig } from '../src/config';
import { seedDatabase, truncateAll } from '../prisma/seed-lib';

export function testPrisma() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/\/[^/?]*_test(\?|$)/.test(url)) {
    throw new Error('Refusing to run integration tests: TEST_DATABASE_URL must end in _test');
  }
  return new PrismaClient({ datasourceUrl: url });
}

export function testConfig(over: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL!,
    SESSION_SECRET: 'test-secret-test-secret',
    ENABLE_TEST_ENDPOINTS: 'true',
    ...over,
  });
}

/** Fresh seeded database for a test file. */
export async function resetAndSeed(prisma: PrismaClient) {
  await truncateAll(prisma);
  await seedDatabase(prisma);
}
