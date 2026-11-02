import type { Config } from 'tailwindcss';
import jobprepPreset from '@jobprep/shared/tailwind-preset';

export default {
  presets: [jobprepPreset as unknown as Partial<Config>],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        search: '0 1px 2px rgba(24,24,27,0.04), 0 8px 24px rgba(24,24,27,0.06)',
        preview: '0 24px 48px rgba(24,24,27,0.10)',
        modal: '0 24px 64px rgba(0,0,0,0.25)',
      },
      borderRadius: { 'sheet': '20px' },
    },
  },
  plugins: [],
} satisfies Config;
