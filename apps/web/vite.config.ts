/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Where /api is proxied: the standard API (4000) unless API_URL says otherwise. The admin e2e specs run a second
// instance of this dev server (WEB_PORT=5174) against their own API instance and database (API_URL=http://localhost:4001).
const API_TARGET = process.env.API_URL ?? 'http://localhost:4000';
const PORT = Number(process.env.WEB_PORT ?? 5173);

// The session cookie (jp_session, httpOnly, SameSite=Lax) must be same-origin, so /api is proxied
// in dev and in `vite preview`. In production the web app and API share a host (see DECISIONS #19).
const proxy = { '/api': { target: API_TARGET, changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  // A second dev server on another port gets its own dependency cache, so the two never rewrite each other's.
  cacheDir: PORT === 5173 ? 'node_modules/.vite' : `node_modules/.vite-${PORT}`,
  server: { port: PORT, strictPort: true, proxy },
  preview: { port: 4173, proxy },
  build: { target: 'es2020', sourcemap: false, cssCodeSplit: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
