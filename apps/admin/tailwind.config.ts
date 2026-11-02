import type { Config } from 'tailwindcss';
import jobprepPreset from '@jobprep/shared/tailwind-preset';

export default {
  presets: [jobprepPreset as unknown as Partial<Config>],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
