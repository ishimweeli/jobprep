/**
 * Message catalogues. English is the source; Kinyarwanda and Kiswahili fall back to English
 * key-by-key until translated (the design shows partial translation progress per language).
 * Admins can override any key in the `Translation` table.
 */
export const LOCALES = ['en', 'rw', 'sw'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export type Messages = Record<string, string>;

export const en: Messages = {
  'brand.name': 'JobPrep',
  'landing.headline': 'Practice Smarter. Pass with Confidence.',
  'landing.searchPlaceholder': 'Which job exam are you preparing for?',
  'landing.searchCta': 'Find Mock Tests',
  'disclaimer.rw': 'Independent practice platform — not affiliated with MIFOTRA or REB.',
  'disclaimer.ke': 'Independent practice platform — not affiliated with the TSC, the PSC or any county government.',
  'disclaimer.default': 'Independent practice platform — not affiliated with any government recruitment body.',
  'exam.start': 'Start Mock Test',
  'exam.submit': 'Submit exam',
  'exam.submitNow': 'Submit now',
  'exam.keepWorking': 'Keep working',
  'exam.goFirstUnanswered': 'Go to first unanswered question',
  'exam.flag': 'Flag for review',
  'exam.flagged': 'Flagged for review',
  'exam.allSaved': 'All answers saved',
  'exam.waitingToSave': '{count} answers waiting to save',
  'exam.timeIsUp': 'Time is up',
  'exam.noPassMark': 'No official pass mark is published for this examination, so JobPrep shows your score and percentage only.',
  'access.getFull': 'Get Full Access · {price}',
  'access.trySample': 'Try the free sample',
  'results.saveMyResult': 'Save my result',
  'results.weakArea': 'Weak area',
  'results.reviewAnswers': 'Review Answers',
  'results.practiceWeak': 'Practice Weak Areas',
  'results.tryAnother': 'Try Another Mock Test',
  'payment.approveOnPhone': 'Approve on your phone',
  'payment.notCharged': 'You were not charged.',
  'payment.confirmed': 'Payment confirmed',
  'auth.sendCode': 'Send code',
  'auth.verify': 'Verify',
  'error.generic': 'Something went wrong. Please try again.',
  'nav.mockTests': 'Mock tests',
  'nav.pricing': 'Pricing',
  'nav.progress': 'My progress',
  'nav.signIn': 'Sign in',
  'nav.getStarted': 'Get started',
  'footer.terms': 'Terms of use',
  'footer.privacy': 'Privacy policy',
  'footer.refund': 'Refund policy',
  'footer.help': 'Help and support',
  'language.label': 'Language',
  'language.englishOnly': 'This test is available in English only',
  'language.partlyTranslated': 'This test is only partly translated. Untranslated questions stay in English.',
};

export const rw: Messages = {
  'landing.searchCta': 'Shakisha Ibizamini',
  'exam.start': 'Tangira Ikizamini',
  'exam.submit': 'Ohereza ikizamini',
  'exam.flag': 'Shyiraho ikimenyetso',
  'exam.allSaved': 'Ibisubizo byose byabitswe',
  'exam.timeIsUp': 'Igihe kirarangiye',
  'results.reviewAnswers': 'Subiramo ibisubizo',
  'payment.notCharged': 'Nta mafaranga yakwishyujwe.',
  // Needs review by a native speaker before launch.
  'nav.mockTests': 'Ibizamini',
  'nav.pricing': 'Ibiciro',
  'nav.progress': 'Aho ngeze',
  'nav.signIn': 'Injira',
  'nav.getStarted': 'Tangira',
  'footer.help': 'Ubufasha',
  'language.label': 'Ururimi',
  'language.englishOnly': 'Iki kizamini kiboneka mu Cyongereza gusa',
};

export const sw: Messages = {
  'landing.searchCta': 'Tafuta Mitihani',
  'exam.start': 'Anza Mtihani',
  'exam.submit': 'Wasilisha mtihani',
  'exam.allSaved': 'Majibu yote yamehifadhiwa',
  'exam.timeIsUp': 'Muda umeisha',
  'payment.notCharged': 'Hukutozwa.',
  // Needs review by a native speaker before launch.
  'nav.mockTests': 'Mitihani',
  'nav.pricing': 'Bei',
  'nav.progress': 'Maendeleo yangu',
  'nav.signIn': 'Ingia',
  'nav.getStarted': 'Anza',
  'footer.help': 'Msaada',
  'language.label': 'Lugha',
  'language.englishOnly': 'Mtihani huu unapatikana kwa Kiingereza pekee',
};

export const catalogues: Record<Locale, Messages> = { en, rw, sw };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Translate with English fallback and `{name}` interpolation. Unknown keys return the key itself. */
export function t(
  locale: Locale,
  key: string,
  vars: Record<string, string | number> = {},
  overrides: Messages = {},
): string {
  const template = overrides[key] ?? catalogues[locale][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}
