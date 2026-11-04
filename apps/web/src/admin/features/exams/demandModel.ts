import type { ExamRequestGroup, WaitingCountry } from '../../api/questions-demand';
import { formatDay, plural } from '../../lib/format';

/** Exam requests and the waiting list as plain data (A15): query string, sentences, links and request bodies. */

export interface RequestsQuery { status: 'open' | 'done'; q: string; page: number }

export function parseRequestsQuery(sp: URLSearchParams): RequestsQuery {
  const n = Number(sp.get('page'));
  return { status: sp.get('status') === 'done' ? 'done' : 'open', q: (sp.get('q') ?? '').trim(), page: Number.isInteger(n) && n >= 1 ? n : 1 };
}

/** Only what differs from the defaults goes in the URL; the global `?country=` is kept by the caller. */
export function requestsSearch(next: Partial<RequestsQuery>, current: RequestsQuery): string {
  const m = { ...current, ...next, page: next.page ?? 1 };
  const sp = new URLSearchParams();
  if (m.status !== 'open') sp.set('status', m.status);
  if (m.q) sp.set('q', m.q);
  if (m.page > 1) sp.set('page', String(m.page));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** "Veterinary officer — 7 requests, last 1 Nov" */
/** "7 requests, last 1 Nov" */
export const requestCounts = (g: Pick<ExamRequestGroup, 'count' | 'lastAt'>): string => `${plural(g.count, 'request')}, last ${formatDay(g.lastAt)}`;
export const requestLine = (g: Pick<ExamRequestGroup, 'query' | 'count' | 'lastAt'>): string => `${g.query} — ${requestCounts(g)}`;

/** "3 left an email address" (the people "Mark done" can notify). */
export const emailWords = (n: number): string => (n === 0 ? 'No email addresses' : n === 1 ? '1 left an email address' : `${n} left an email address`);

/** "Plan exam" opens the mock-test form with the search as the title and the country chosen. */
export function planExamUrl(g: Pick<ExamRequestGroup, 'query' | 'countryCode'>): string {
  const sp = new URLSearchParams({ title: g.query, country: g.countryCode });
  return `/admin/exams/new?${sp.toString()}`;
}

export function markDoneBody(g: Pick<ExamRequestGroup, 'query' | 'countryCode'>, o: { reason: string; notify: boolean; mockTestId: string }) {
  return {
    countryCode: g.countryCode,
    query: g.query,
    ...(o.reason.trim() ? { reason: o.reason.trim() } : {}),
    ...(o.notify ? { notify: true } : {}),
    ...(o.mockTestId ? { mockTestId: o.mockTestId } : {}),
  };
}

/** The line shown after "Mark done": "Marked 7 requests done, 3 emails sent." */
export function markDoneResult(r: { marked: number; notified: number }): string {
  const marked = `Marked ${plural(r.marked, 'request')} done`;
  return r.notified > 0 ? `${marked}, ${plural(r.notified, 'email')} sent.` : `${marked}.`;
}

export const doneNote = (g: Pick<ExamRequestGroup, 'doneAt' | 'doneBy' | 'doneNote'>): string =>
  [g.doneAt ? `Done ${formatDay(g.doneAt)}` : 'Done', g.doneBy ? `by ${g.doneBy}` : '', g.doneNote ? `· ${g.doneNote}` : ''].filter(Boolean).join(' ');

// ───────────────────────── Waiting list

export const waitingLine = (c: Pick<WaitingCountry, 'count' | 'notified'>): string =>
  `${plural(c.count, 'person', 'people')} waiting${c.notified > 0 ? ` · ${c.notified} told` : ''}`;

export const notifyResult = (n: number): string => (n === 0 ? 'Nobody to tell: everyone on the list was told already.' : `${plural(n, 'email')} sent.`);

/** "Tell them" only makes sense when the country is open: the email says so. */
export const canNotify = (c: Pick<WaitingCountry, 'status' | 'count' | 'notified'>): boolean => c.status === 'LIVE' && c.count > c.notified;

export function waitingSearch(code: string | null, page: number): string {
  const sp = new URLSearchParams();
  if (code) sp.set('country', code);
  if (page > 1) sp.set('page', String(page));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
