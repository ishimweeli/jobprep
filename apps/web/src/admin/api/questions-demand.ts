import { api, buildUrl } from './client';
import type { QuestionDetail, QuestionType, ReportStatus } from './types';

/**
 * Endpoints and shapes added for the question editor (A10), the reports queue (A11) and the demand views (A15).
 * The contract is docs/API_ADDITIONS.md. One function per call, query keys next to them.
 */

const enc = encodeURIComponent;

// ───────────────────────── Question editor: translations, reorder

export interface QuestionTranslation { language: string; stem: string; optionTexts: Record<string, string>; explanation: string }
export type TranslationState = 'complete' | 'partial' | 'missing';
export interface TranslationStatus { language: string; state: TranslationState }

/** `GET /questions/:id`, with the translation fields the API now adds. */
export interface QuestionDetailX extends Omit<QuestionDetail, 'question'> {
  question: QuestionDetail['question'] & { translations?: QuestionTranslation[]; translationStatus?: TranslationStatus[] };
}

export const getQuestionX = (id: string) => api<QuestionDetailX>(`/questions/${enc(id)}`);
export const putTranslation = (id: string, lang: string, body: { stem: string; optionTexts: Record<string, string>; explanation: string }) =>
  api<{ ok: true; state: TranslationState }>(`/questions/${enc(id)}/translations/${enc(lang)}`, { method: 'PUT', body });
export const deleteTranslation = (id: string, lang: string) => api<{ ok: true }>(`/questions/${enc(id)}/translations/${enc(lang)}`, { method: 'DELETE' });
export const reorderQuestions = (testId: string, ids: string[]) => api<{ ok: true }>(`/mock-tests/${enc(testId)}/questions/reorder`, { method: 'POST', body: { ids } });

export type { QuestionType };

// ───────────────────────── Country options (any admin)

export interface CountryOption { code: string; name: string; status: 'LIVE' | 'PREPARING' | 'PLANNED' }
export const getCountryOptions = () => api<{ countries: CountryOption[] }>('/country-options').then((r) => r.countries);

// ───────────────────────── Reports queue (A11)

export interface GroupedReport {
  question: { id: string; number: number; stem: string };
  mockTest: { id: string; title: string; countryCode: string };
  count: number;
  latestMessage: string | null;
  latestAt: string;
  messages: { id: string; message: string | null; createdAt: string }[];
}
export interface GroupedReportsPage { total: number; page: number; status: ReportStatus; results: GroupedReport[] }
export interface ClosedReport {
  id: string; message: string | null; createdAt: string; status: ReportStatus; reporter: { name: string; email: string } | null; resolutionNote: string | null;
  question: { id: string; number: number; stem: string }; mockTest: { id: string; title: string; countryCode?: string };
}
export interface ClosedReportsPage { total: number; page: number; status: ReportStatus; results: ClosedReport[] }

export const reportsKey = (q: Record<string, unknown>) => ['admin', 'reports-queue', q] as const;
export const getGroupedReports = (q: { status: ReportStatus; country?: string; page?: number; pageSize?: number }) =>
  api<GroupedReportsPage>('/reports', { query: { ...q, group: 'question' } });
export const getClosedReports = (q: { status: ReportStatus; country?: string; page?: number; pageSize?: number }) => api<ClosedReportsPage>('/reports', { query: { ...q } });
/** Closes every open report of one question (the grouped queue's "Dismiss all" / "Resolve all"). */
export const closeQuestionReports = (questionId: string, body: { status: 'RESOLVED' | 'DISMISSED'; reason?: string }) =>
  api<{ ok: true; closed: number }>(`/questions/${enc(questionId)}/reports/close`, { method: 'POST', body });

// ───────────────────────── Demand (A15)

export interface ExamRequestGroup {
  key: string; query: string; countryCode: string; count: number; withEmail: number; firstAt: string; lastAt: string;
  status: 'OPEN' | 'DONE'; doneAt: string | null; doneNote: string | null; doneBy: string | null;
}
export interface ExamRequestsPage { total: number; page: number; results: ExamRequestGroup[] }
export interface ExamRequestsQuery { status?: 'open' | 'done'; country?: string; q?: string; page?: number; pageSize?: number }
export const examRequestsKey = (q: Record<string, unknown>) => ['admin', 'exam-requests', q] as const;
export const getExamRequests = (q: ExamRequestsQuery) => api<ExamRequestsPage>('/demand/exam-requests', { query: { ...q } });
export const markExamRequestDone = (body: { countryCode: string; query: string; reason?: string; notify?: boolean; mockTestId?: string }) =>
  api<{ ok: true; marked: number; notified: number }>('/demand/exam-requests/done', { method: 'POST', body });

export interface WaitingCountry { code: string; name: string; status: 'LIVE' | 'PREPARING' | 'PLANNED'; count: number; notified: number }
export interface WaitingEntry { id: string; email: string; interest: string | null; createdAt: string; notifiedAt: string | null }
export interface WaitingListPage { countries: WaitingCountry[]; total: number; entries?: WaitingEntry[] }
export const waitingListKey = (q: Record<string, unknown>) => ['admin', 'waiting-list', q] as const;
export const getWaitingList = (q: { country?: string; page?: number; pageSize?: number }) => api<WaitingListPage>('/demand/waiting-list', { query: { ...q } });
export const notifyWaitingList = (body: { countryCode: string; reason: string }) => api<{ ok: true; notified: number }>('/demand/waiting-list/notify', { method: 'POST', body });
/** Same-origin URL of the waiting-list CSV (fetched with the session cookie, then saved as a file). */
export const waitingListExportUrl = (country: string) => buildUrl('/demand/waiting-list/export', { country });

// ───────────────────────── Downloads

/** What a download button shows: nothing yet, working, done (with the file name) or failed. */
export type DownloadState = { state: 'idle' } | { state: 'working' } | { state: 'done'; fileName: string } | { state: 'error'; message: string };

/** The file name the server suggests in `Content-Disposition`, else `fallback`. */
export function fileNameFrom(disposition: string | null, fallback: string): string {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  return m?.[1] ? decodeURIComponent(m[1]) : fallback;
}

/** Fetches a CSV with the session and hands it to the browser as a file. Throws a short message on failure. */
export async function downloadCsv(url: string, fallbackName: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include', headers: { Accept: 'text/csv' } });
  } catch {
    throw new Error('Could not reach the server. Try again.');
  }
  if (!res.ok) throw new Error(res.status === 403 ? 'Your role does not allow this export.' : 'The export could not be made. Try again.');
  const name = fileNameFrom(res.headers.get('Content-Disposition'), fallbackName);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return name;
}
