import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

const API_PORT = 4000;

/**
 * The admin specs write data (categories, mock tests, team members ...): their API on 4001 must never use the dev database.
 * ADMIN_E2E_DATABASE_URL wins; otherwise it is the dev URL of .env with the database name `jobprep_admin_test`.
 */
function adminTestDatabaseUrl(): string | undefined {
  if (process.env.ADMIN_E2E_DATABASE_URL) return process.env.ADMIN_E2E_DATABASE_URL;
  try {
    const m = /^DATABASE_URL=(.+)$/m.exec(fs.readFileSync('.env', 'utf8'));
    return m ? m[1]!.trim().replace(/^["']|["']$/g, '').replace(/\/[^/?]+(\?|$)/, '/jobprep_admin_test$1') : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every e2e spec runs at desktop (1440×900) AND phone (390×844). UI specs arrive with the web app;
 * API smoke specs run against the real dev server and the seeded dev database.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:5173' },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: 'npm run start -w @jobprep/api',
      url: `http://localhost:${API_PORT}/api/health`,
      // .env has real SMTP settings now: the suites make hundreds of accounts, so they must never send real email.
      env: { EMAIL_PROVIDER: 'console' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @jobprep/web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    // Admin specs (e2e/admin-*.spec.ts) test /admin inside the web app, with data isolation kept: their own API instance
    // on 4001 (set ADMIN_E2E_DATABASE_URL to point it at its own reseeded database, e.g. `jobprep_admin_test`) and a second instance of
    // the web dev server on 5174 whose Vite proxy targets 4001 (apps/web/vite.config.ts: API_URL, WEB_PORT).
    {
      command: 'npm run start -w @jobprep/api',
      url: 'http://localhost:4001/api/health',
      // The same few admin emails sign in many times per run, so the per-email code cooldown and hourly cap are relaxed on this test API only.
      env: { PORT: '4001', EMAIL_PROVIDER: 'console', WEB_ORIGIN: 'http://localhost:5174', OTP_RESEND_COOLDOWN_SECONDS: '0', OTP_MAX_PER_HOUR: '1000', ...(adminTestDatabaseUrl() ? { DATABASE_URL: adminTestDatabaseUrl()! } : {}) },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @jobprep/web',
      url: 'http://localhost:5174',
      env: { WEB_PORT: '5174', API_URL: 'http://localhost:4001' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
