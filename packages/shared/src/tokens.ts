/**
 * Design tokens from the approved JobPrep design.
 * Single source for the Tailwind preset (web) and any server-rendered output (emails, receipts).
 */
export const colors = {
  ink: '#18181B',
  'ink-2': '#3F3F46',
  muted: '#52525B',
  border: '#E4E4E7',
  'input-border': '#A1A1AA',
  surface: '#FFFFFF',
  page: '#FAFAFA',
  soft: '#F4F4F5',
  brand: {
    DEFAULT: '#6D28D9',
    hover: '#5B21B6',
    soft: '#EDE9FE',
    softer: '#F5F3FF',
    ring: '#A78BFA',
  },
  correct: { DEFAULT: '#047857', bg: '#D1FAE5' },
  incorrect: { DEFAULT: '#B91C1C', bg: '#FEE2E2' },
  flagged: { DEFAULT: '#B45309', ink: '#92400E', bg: '#FEF3C7' },
  free: { DEFAULT: '#065F46', bg: '#D1FAE5' },
} as const;

export const radii = {
  control: '12px', // buttons, inputs
  card: '16px',
  'card-lg': '18px',
  pill: '9999px',
} as const;

export const fontFamily = {
  sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', "'Segoe UI'", 'sans-serif'],
} as const;

/** Minimum touch target in px (WCAG 2.5.5 / design rule). */
export const MIN_TOUCH_TARGET = 44;
