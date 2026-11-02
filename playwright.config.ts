import { defineConfig, devices } from '@playwright/test';

const API_PORT = 4000;

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
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @jobprep/web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    // Admin app (e2e/admin-*.spec.ts): its own API instance on 4001 and Vite on 5174 (proxying /api to 4001).
    {
      command: 'npm run start -w @jobprep/api',
      url: 'http://localhost:4001/api/health',
      env: { PORT: '4001' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @jobprep/admin',
      url: 'http://localhost:5174',
      env: { ADMIN_API_URL: 'http://localhost:4001' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
