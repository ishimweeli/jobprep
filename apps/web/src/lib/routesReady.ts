/**
 * Destinations that depend on screens which may not exist yet. Until a flag is true, buttons that point at it are
 * rendered as drawn but inert (no placeholder or invented screen).
 *
 * Built (artboards exist): exam start, checkout, progress (dashboard), review, results, resume, try another test,
 * the practice-set runner (C1, Batch 1).
 * Still inert because their screen is NOT designed (docs/MISSING_DESIGNS.md): "Change goal" (C15).
 */
export const ROUTES_READY = {
  /** /:country/tests/:slug/start (Exam.dc / ExamMobile.dc) */
  examStart: true,
  /** /:country/checkout (Checkout.dc / CheckoutKenyaPhone.dc) */
  checkout: true,
  /** /:country/progress (Dashboard.dc) */
  progress: true,
  /** /:country/results/:id (Results.dc) */
  results: true,
  /** /:country/review/:id (Review.dc) */
  review: true,
  /** "Resume" on the in-progress prompt (States.dc) */
  resume: true,
  /** "Try Another Mock Test" -> the catalog */
  tryAnother: true,
  /** Practice-set runner: "Practice Weak Areas", "Start practice", "Practise" (Practice.dc, Batch 1) */
  practice: true,
  /** "Change goal" (C15, not designed) */
  changeGoal: false,
} as const;
