/** Copy and rules of the system pages (SystemPages.dc, SystemPagesPhone.dc). Pure, unit-tested. */

export type SystemPageKind = 'not_found' | 'error' | 'maintenance' | 'session_expired';

export interface SystemPageCopy {
  /** SVG path of the icon (24 x 24 stroke icon). */
  icon: string;
  code?: string;
  title: string;
  body: string;
  note?: string;
  cta: string;
  alt?: string;
}

const ICONS = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3 M8 11h6',
  warn: 'M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5z',
};

export const SYSTEM_COPY: Record<SystemPageKind, SystemPageCopy> = {
  not_found: {
    icon: ICONS.search,
    code: 'Error 404',
    title: 'We can’t find that page',
    body: 'The link may be old, or the mock test may have been moved. Search for your exam instead.',
    cta: 'Find mock tests',
    alt: 'Go to the home page',
  },
  error: {
    icon: ICONS.warn,
    title: 'Something went wrong on our side',
    body: 'This is our fault, not yours. Try again in a moment.',
    note: 'If you were taking a test, your answers are saved.',
    cta: 'Try again',
    alt: 'Go to the home page',
  },
  maintenance: {
    icon: ICONS.wrench,
    title: 'JobPrep is being updated',
    // The artboard says "expect to be back by [TIME]"; there is no real time to show, so that part is left out.
    body: 'We’re making improvements. Your results, answers and access are safe.',
    cta: 'Check again',
  },
  session_expired: {
    icon: ICONS.lock,
    title: 'Please sign in again',
    body: 'For your security, you were signed out after a long time without activity.',
    note: 'Your answers and results are saved.',
    cta: 'Sign in',
    alt: 'Go to the home page',
  },
};

/**
 * The "Reference" line of the error page: the API's request id (8 hex characters) shown as in the artboard,
 * `JP-7F3A-21C9`. Support can search the server log for the id without the dash. `null` = no reference line.
 */
export function formatReference(requestId: string | null | undefined): string | null {
  if (!requestId) return null;
  const id = requestId.trim().toUpperCase();
  if (id.length < 4) return `JP-${id}`;
  return `JP-${id.slice(0, 4)}-${id.slice(4)}`;
}

/** Does this failed request deserve the full "Something went wrong" page? (A server error, not a 4xx or a dropped connection.) */
export function isServerError(status: number): boolean {
  return status >= 500;
}
