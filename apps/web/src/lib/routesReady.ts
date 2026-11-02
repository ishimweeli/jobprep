/**
 * Destinations that later phases build. Until a flag flips to true, buttons that point at it are rendered
 * as drawn but inert (no placeholder or invented screen). The owning phase adds the route in routes.tsx
 * and flips the flag.
 */
export const ROUTES_READY = {
  /** /:country/tests/:slug/start (Exam.dc / ExamMobile.dc) */
  examStart: false,
  /** /:country/checkout (Checkout.dc phone) */
  checkout: false,
  /** /:country/progress (Dashboard.dc) */
  progress: false,
} as const;
