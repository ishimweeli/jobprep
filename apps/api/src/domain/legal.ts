/**
 * Legal pages: terms, privacy, refund and cookies. The text below is PLACEHOLDER text written by engineering, not legal
 * advice, and it is flagged `placeholder: true` in the API so the web app shows a visible note. The owner replaces it
 * (per country or for all) through PUT /api/admin/legal/:page; an override has `placeholder: false`.
 */
export const LEGAL_SLUGS = ['terms', 'privacy', 'refund', 'cookies'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export interface LegalSection { id: string; heading: string; paragraphs: string[] }
export interface LegalPage { slug: LegalSlug; title: string; lastUpdated: string; placeholder: boolean; intro: string; sections: LegalSection[] }

export const PLACEHOLDER_UPDATED = '2026-11-05';
const NOTE = 'Placeholder text, pending legal review.';

export const DEFAULT_LEGAL: Record<LegalSlug, Omit<LegalPage, 'slug' | 'placeholder'>> = {
  terms: {
    title: 'Terms of use',
    lastUpdated: PLACEHOLDER_UPDATED,
    intro: `${NOTE} These terms describe how JobPrep may be used.`,
    sections: [
      { id: 'about', heading: 'About JobPrep', paragraphs: ['JobPrep is an independent practice platform for recruitment exams. It is not affiliated with any ministry, commission or exam authority.', 'Practice questions are written for practice. They are not copies of any real examination.'] },
      { id: 'accounts', heading: 'Your account', paragraphs: ['You are responsible for keeping your password private and for what happens under your account.', 'Free sample tests can be taken without an account.'] },
      { id: 'access', heading: 'Full Access', paragraphs: ['Full Access is paid once for a fixed number of days, does not renew by itself, and covers the mock tests of the country you paid for.'] },
      { id: 'use', heading: 'Acceptable use', paragraphs: ['Do not copy, resell or scrape the questions, and do not try to interfere with the service.'] },
      { id: 'changes', heading: 'Changes to these terms', paragraphs: ['We may update these terms. The date at the top shows when they last changed.'] },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    lastUpdated: PLACEHOLDER_UPDATED,
    intro: `${NOTE} This page explains what JobPrep keeps about you.`,
    sections: [
      { id: 'collect', heading: 'What we keep', paragraphs: ['Your name, email address, country, exam goal, your answers and results, and your payment records (amount, status and the number you paid from).', 'We never ask for or store a mobile money PIN.'] },
      { id: 'use', heading: 'How we use it', paragraphs: ['To run your account, mark your tests, show your progress, take payments and answer support requests.'] },
      { id: 'share', heading: 'Who we share it with', paragraphs: ['Payment operators receive what they need to process a payment. We do not sell your data.'] },
      { id: 'rights', heading: 'Your choices', paragraphs: ['You can ask us to correct or remove your data, or to take your address off a waiting list, by contacting support.'] },
    ],
  },
  refund: {
    title: 'Refund policy',
    lastUpdated: PLACEHOLDER_UPDATED,
    intro: `${NOTE} This page explains when a payment can be refunded.`,
    sections: [
      { id: 'when', heading: 'When you are not charged', paragraphs: ['If a payment is declined, fails or expires, you were not charged.'] },
      { id: 'problems', heading: 'If something went wrong', paragraphs: ['If you were charged but Full Access did not start, contact support with your transaction ID and we will check and fix it.'] },
      { id: 'refunds', heading: 'Refunds', paragraphs: ['[Refund rules to be supplied by the owner after legal review.]'] },
    ],
  },
  cookies: {
    title: 'Cookie notice',
    lastUpdated: PLACEHOLDER_UPDATED,
    intro: `${NOTE} This page explains the cookies JobPrep uses.`,
    sections: [
      { id: 'session', heading: 'Sign-in cookie', paragraphs: ['JobPrep uses one cookie to keep you signed in. It is needed for the service to work and is not used for advertising.'] },
      { id: 'storage', heading: 'Storage on your device', paragraphs: ['Your answers during an exam are also kept on your device so they survive a lost connection. Nothing else is tracked.'] },
    ],
  },
};
