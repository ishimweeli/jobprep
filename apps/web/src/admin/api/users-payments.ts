import { api, buildUrl, toApiError } from './client';
import type { AccessState, PaymentStatus } from './types';

/**
 * Endpoints added for the missing-designs batch that the users and payments screens use (docs/API_ADDITIONS.md):
 * the access preview, the read-only candidate view and the accounting export.
 */

export const upKeys = {
  accessPreview: (userId: string, days: number, countryCode: string) => ['admin', 'access-preview', userId, days, countryCode] as const,
  candidateView: (userId: string) => ['admin', 'candidate-view', userId] as const,
};

/** `GET /users/:id/access-preview`: when the access would run until if the grant were made now. */
export interface AccessPreview { days: number; startsAt: string; endsAt: string; currentEndsAt: string | null }
export const getAccessPreview = (userId: string, days: number, countryCode: string) =>
  api<AccessPreview>(`/users/${encodeURIComponent(userId)}/access-preview`, { query: { days, countryCode } });

/** One payment row of the candidate's own payment list (`GET /me/payments`), without `canCheck`. */
export interface CandidatePaymentRow {
  id: string; createdAt: string; status: PaymentStatus; providerLabel: string; priceLabel: string; amountMinor: number; currencyCode: string;
  countryCode: string; transactionId: string | null; accessUntil: string | null;
}

/** The candidate dashboard object, as `GET /me/dashboard` sends it (only what the read-only view shows). */
export interface CandidateDashboard {
  user?: { name: string; firstName: string };
  country?: { code: string; name: string };
  goal: null | { categoryId: string; slug: string; name: string };
  resume: null | { title?: string; mockTestTitle?: string };
  recommended: null | { topicName: string; percent: number; questionCount: number };
  scoreHistory: { attemptId: string; submittedAt: string | null; percent: number | null; title: string }[];
  topics: { strong: { topicId: string; name: string; percent: number }[]; needsWork: { topicId: string; name: string; percent: number }[] };
  recentlyCompleted: { attemptId: string; kind: 'FULL' | 'PRACTICE'; title: string; submittedAt: string | null; attemptNumber: number | null; percent: number | null }[];
  access: {
    current: null | { endsAt: string; daysLeft: number; endingSoon: boolean };
    expired: null | { endedAt: string };
    otherCountries: { countryCode: string; endsAt: string; daysLeft: number }[];
  };
  hasActivity: boolean;
  pendingPayment: null | { id: string; providerLabel: string; priceLabel: string; expiresAt: string };
}

/** `GET /users/:id/candidate-view`: what the person sees, read only. Nothing here can act as them. */
export interface CandidateView {
  readOnly: true;
  user: { id?: string; name: string; email?: string; countryCode?: string; status?: string; [k: string]: unknown };
  country?: { code: string; name: string; currencyCode?: string } | null;
  access?: { state?: AccessState; endsAt?: string | null; daysLeft?: number | null; expiredAt?: string | null } | null;
  dashboard: CandidateDashboard | null;
  attempts: { id: string; kind: string; title: string; status: string; percent: number | null; submittedAt: string | null }[];
  payments: CandidatePaymentRow[];
}
export const getCandidateView = (userId: string) => api<CandidateView>(`/users/${encodeURIComponent(userId)}/candidate-view`);

// ───────────────────────── Accounting export (A16)

export type ExportStatus = 'paid' | 'pending' | 'failed' | 'all';
export interface ExportQuery { from?: string; to?: string; country?: string; status: ExportStatus; provider?: string }

/** The export's address with its filters (empty values left out). Exported for tests. */
export function exportUrl(q: ExportQuery): string {
  return buildUrl('/payments/export', { from: q.from || undefined, to: q.to || undefined, country: q.country || undefined, status: q.status, provider: q.provider || undefined });
}

export interface ExportFile { blob: Blob; filename: string; rows: number }

/** The file name the server suggested (`Content-Disposition`), else a name made from the range. */
export function exportFilename(header: string | null, q: ExportQuery): string {
  const m = header ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header) : null;
  if (m?.[1]) return decodeURIComponent(m[1]);
  const range = [q.from, q.to].filter(Boolean).join('_to_');
  return `payments-${q.status}${range ? `-${range}` : ''}.csv`;
}

/** Data rows in a CSV text (every non-empty line but the header; a quoted line break would over-count by a little). */
export const countCsvRows = (text: string): number => Math.max(0, text.split(/\r?\n/).filter((l) => l.trim() !== '').length - 1);

/** `GET /payments/export` as a file. Failures are `ApiError`s (400 `invalid_range`, 403, a network error with status 0). */
export async function fetchPaymentsExport(q: ExportQuery): Promise<ExportFile> {
  let res: Response;
  try {
    res = await fetch(exportUrl(q), { credentials: 'include', headers: { Accept: 'text/csv' } });
  } catch {
    throw toApiError(0, { error: 'network_error' }, null);
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw toApiError(res.status, body, res.headers.get('Retry-After'), res.headers.get('X-Request-Id'));
  }
  const text = await res.text();
  return { blob: new Blob([text], { type: 'text/csv;charset=utf-8' }), filename: exportFilename(res.headers.get('Content-Disposition'), q), rows: countCsvRows(text) };
}

/** Hands the file to the browser's download (a temporary link). Quietly does nothing where object URLs do not exist (tests). */
export function saveFile(file: ExportFile): void {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const href = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
