/**
 * Design tokens from the approved JobPrep design.
 * Single source for the Tailwind preset (web) and any server-rendered output (emails, receipts).
 */
export const colors = {
  /** Body text and headings (ink-2 is the same colour in the Mwalimu Tools palette). */
  ink: '#3A3F4A',
  'ink-2': '#3A3F4A',
  muted: '#5E6573',
  border: '#E2E7EF',
  /** Stronger divider (chart baselines, unselected pill outlines). */
  'border-strong': '#DCE2EB',
  'input-border': '#CDD4DE',
  surface: '#FFFFFF',
  page: '#EFF3F8',
  soft: '#EEF1F5',
  /** Submit button, the dashboard "Continue" card, admin mark and current-question ring: the brand blue itself (the near-black navy of the earlier artboards is gone). */
  dark: '#164A7A',
  /** Text on the dark panel (the continue card). */
  'on-dark': '#DCE2EB',
  /** Disabled dark button (Submit exam after time is up). */
  disabled: '#A3ADBB',
  /** Modal overlay colour; use with an opacity (bg-scrim/50). */
  scrim: '#141E32',
  /** Main buttons, logo, selected states. */
  brand: {
    DEFAULT: '#164A7A',
    hover: '#1E4BA8',
    soft: '#E8EFFB',
    softer: '#E8EFFB',
    light: '#DCEBFA',
    ring: '#6AA6EE',
  },
  /** Inline text links. */
  link: { DEFAULT: '#2D62CF', hover: '#1E4BA8' },
  correct: { DEFAULT: '#1E6B3C', bg: '#E3F4E8', line: '#BFE3CB', mark: '#1E7A46' },
  incorrect: { DEFAULT: '#A1281B', bg: '#FBE7E4', line: '#F0CFCA' },
  flagged: { DEFAULT: '#8A5300', ink: '#8A5300', bg: '#FDF1DD', line: '#E9CF9B' },
  /** Partly correct stays orange, as drawn. */
  partial: { DEFAULT: '#9A3412', bg: '#FFEDD5' },
  free: { DEFAULT: '#1E6B3C', bg: '#E3F4E8' },
} as const;

export const radii = {
  control: '10px', // buttons, inputs, selects
  card: '16px',
  'card-lg': '16px', // same as card since the typography/shape pass (ba8f27b)
  pill: '9999px',
} as const;

export const fontFamily = {
  sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', "'Segoe UI'", 'sans-serif'],
} as const;

/** Minimum touch target in px (WCAG 2.5.5 / design rule). */
export const MIN_TOUCH_TARGET = 44;
