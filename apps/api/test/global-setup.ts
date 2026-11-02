import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Migrate the dedicated test database once per run. Never touches the dev database. */
export default function setup() {
  const envFile = resolve(process.cwd(), '../../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  if (!/\/[^/?]*_test(\?|$)/.test(url)) {
    throw new Error('TEST_DATABASE_URL must point at a database whose name ends in _test');
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
