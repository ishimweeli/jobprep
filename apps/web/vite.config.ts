/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.API_URL ?? 'http://localhost:4000';

// The session cookie (jp_session, httpOnly, SameSite=Lax) must be same-origin, so /api is proxied
// in dev and in `vite preview`. In production the web app and API share a host (see DECISIONS #19).
const proxy = { '/api': { target: API_TARGET, changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, proxy },
  build: { target: 'es2020', sourcemap: false, cssCodeSplit: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
