/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The admin session cookie (jp_admin, httpOnly, SameSite=Strict) must be same-origin, so /api is proxied in dev
// and in `vite preview`. Point it at another API instance with ADMIN_API_URL (default: the standard API port).
const API_TARGET = process.env.ADMIN_API_URL ?? 'http://localhost:4000';
const proxy = { '/api': { target: API_TARGET, changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy },
  preview: { port: 4174, proxy },
  build: { target: 'es2020', sourcemap: false, cssCodeSplit: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
