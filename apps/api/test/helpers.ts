import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { ConsoleEmailProvider } from '../src/services/email';
import type { Config } from '../src/config';
import { loadConfig } from '../src/config';
import { hashPassword } from '../src/services/password';
import { DEV_PASSWORD, seedDatabase, truncateAll } from '../prisma/seed-lib';

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

let devHash: Promise<string> | undefined;
/** A verified, set-up account row (for tests that insert users directly): signs in with DEV_PASSWORD. */
export async function readyAccount() {
  devHash ??= hashPassword(DEV_PASSWORD);
  const now = new Date();
  return { passwordHash: await devHash, emailVerifiedAt: now, countryConfirmedAt: now, onboardedAt: now };
}

/** The password every helper-made account uses. */
export const TEST_PASSWORD = 'correct horse battery';

/**
 * Sign a fresh user up (Rwanda unless told otherwise) through the real endpoints: sign-up with a password, then verify
 * the emailed code. Returns a cookie-keeping agent that is signed in (30-day cookie).
 */
export async function signedInAgent(
  app: Parameters<typeof request>[0],
  mail: ConsoleEmailProvider,
  email: string,
  countryCode = 'RW',
  password = TEST_PASSWORD,
) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/sign-up').send({ name: 'Test Candidate', email, password, countryCode });
  if (r.status !== 201) throw new Error(`sign-up failed: ${r.status} ${JSON.stringify(r.body)}`);
  const res = await agent.post('/api/auth/verify-email').send({ email, code: mail.lastCode(email) });
  if (res.status !== 200) throw new Error(`verify-email failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, userId: res.body.user.id as string, email, password };
}

export const ADMINS = {
  SYSTEM: 'system.admin@jobprep.test',
  EDITOR: 'content.editor@jobprep.test', // content editor, restricted to Rwanda
  SUPPORT: 'support@jobprep.test',
  MULTI: 'multi.role@jobprep.test', // content editor (Rwanda only) AND support (all countries)
} as const;

/**
 * Sign a seeded admin in through the NORMAL sign-in endpoint (an admin is an ordinary account that holds roles) with the
 * dev seed password; returns a cookie-keeping agent.
 */
export async function adminAgent(
  app: Parameters<typeof request>[0],
  _mail: ConsoleEmailProvider,
  email: string,
) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/sign-in').send({ email, password: DEV_PASSWORD });
  if (res.status !== 200) throw new Error(`admin sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
