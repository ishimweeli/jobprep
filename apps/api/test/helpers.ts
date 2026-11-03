import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { ConsoleEmailProvider } from '../src/services/email';
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

/** Sign a fresh user up (Rwanda unless told otherwise) through the real endpoints; returns a cookie-keeping agent. */
export async function signedInAgent(
  app: Parameters<typeof request>[0],
  mail: ConsoleEmailProvider,
  email: string,
  countryCode = 'RW',
) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/otp/request').send({ purpose: 'sign_up', email, countryCode });
  if (r.status !== 200) throw new Error(`otp request failed: ${r.status} ${JSON.stringify(r.body)}`);
  const res = await agent.post('/api/auth/sign-up').send({ countryCode, email, name: 'Test Candidate', code: mail.lastCode(email) });
  if (res.status !== 201) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, userId: res.body.user.id as string };
}

export const ADMINS = {
  SYSTEM: 'system.admin@jobprep.test',
  EDITOR: 'content.editor@jobprep.test', // content editor, restricted to Rwanda
  SUPPORT: 'support@jobprep.test',
  MULTI: 'multi.role@jobprep.test', // content editor (Rwanda only) AND support (all countries)
} as const;

/**
 * Sign a seeded admin in through the NORMAL sign-in endpoints (an admin is an ordinary account that holds roles);
 * returns a cookie-keeping agent.
 */
export async function adminAgent(
  app: Parameters<typeof request>[0],
  mail: ConsoleEmailProvider,
  email: string,
) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/otp/request').send({ purpose: 'sign_in', email });
  if (r.status !== 200) throw new Error(`admin otp request failed: ${r.status} ${JSON.stringify(r.body)}`);
  const res = await agent.post('/api/auth/sign-in').send({ email, code: mail.lastCode(email) });
  if (res.status !== 200) throw new Error(`admin sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
