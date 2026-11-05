/**
 * Design tokens from the approved JobPrep design.
 * Single source for the Tailwind preset (web) and any server-rendered output (emails, receipts).
 */
export const colors = {
  /** Body text and headings (ink-2 is the same colour in the Mwalimu Tools palette). */
  ink: '#3A3F4A',
  'ink-2': '#3A3F4A',
  /** h1/h2/card-title text (the November redesign); body text stays `ink`. */
  heading: '#1F2430',
  muted: '#5E6573',
  border: '#E2E7EF',
  /** Stronger divider (chart baselines, unselected pill outlines). */
  'border-strong': '#DCE2EB',
  'input-border': '#CDD4DE',
  surface: '#FFFFFF',
  page: '#F6F8FB',
  soft: '#EEF1F5',
  /** Very light blue-grey tint, distinct from `page`: the sidebar's country block, not a page background. */
  'surface-subtle': '#F3F6FA',
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

/**
 * Tightened from the original 10-16px range (the "serious, institutional exam board" pass): less rounding
 * reads as more authoritative and less like a generic consumer/SaaS template. `pill` is kept for the few
 * genuinely pill-shaped things left (segmented-group thumb etc.) — badges and category chips moved off it.
 */
export const radii = {
  control: '8px', // buttons, inputs, selects
  card: '10px',
  'card-lg': '10px', // same as card since the typography/shape pass (ba8f27b)
  tiles: '8px', // stat tiles, category cards
  tables: '8px', // table containers
  pill: '9999px',
} as const;

/**
 * Dark-mode palette (the November chrome redesign shipped only light values; these are derived, not drawn).
 * Scope: candidate signed-in chrome (sidebar, top bar, phone drawer) + Dashboard, Mock tests, Exam detail,
 * Pricing and Account. Not used anywhere else, so it never affects admin, guest landing or the exam runner.
 * Consumed as `dark-*` Tailwind colours (see tailwind-preset.ts) so call sites write `dark:bg-night-surface` etc.
 */
export const darkColors = {
  'night-page': '#12161D',
  'night-surface': '#1F242E',
  'night-soft': '#242A35',
  'night-surface-subtle': '#242A35',
  'night-heading': '#F2F4F7',
  'night-ink': '#E8EAED',
  'night-muted': '#9BA3B0',
  'night-border': '#2A2F3A',
  'night-border-strong': '#333B48',
  /** Brand blue is too dark for text/icons on the dark surfaces at AA contrast; this lighter tint is used instead. Fills (buttons) keep the real brand colour. */
  'night-brand': '#5B9BD9',
  'night-brand-soft': '#1E3A54',
} as const;

export const fontFamily = {
  sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', "'Segoe UI'", 'sans-serif'],
} as const;

/** Minimum touch target in px (WCAG 2.5.5 / design rule). */
export const MIN_TOUCH_TARGET = 44;
