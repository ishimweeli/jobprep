import type { ReportStatus } from '../../api/types';
import type { GroupedReport } from '../../api/questions-demand';
import { plural } from '../../lib/format';

/** The reports queue's filter, in the query string (`?status=resolved&page=2`); Open is the default and is left out. */
export interface ReportsQuery { status: ReportStatus; page: number }

const WORD: Record<ReportStatus, string> = { OPEN: 'open', RESOLVED: 'resolved', DISMISSED: 'dismissed' };

export function parseReportsQuery(sp: URLSearchParams): ReportsQuery {
  const s = (sp.get('status') ?? '').toUpperCase();
  const n = Number(sp.get('page'));
  return { status: s === 'RESOLVED' || s === 'DISMISSED' ? s : 'OPEN', page: Number.isInteger(n) && n >= 1 ? n : 1 };
}

export function reportsSearch(next: Partial<ReportsQuery>, current: ReportsQuery): string {
  const m = { ...current, ...next, page: next.page ?? 1 };
  const sp = new URLSearchParams();
  if (m.status !== 'OPEN') sp.set('status', WORD[m.status]);
  if (m.page > 1) sp.set('page', String(m.page));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const STATUS_CHIPS: { value: ReportStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISMISSED', label: 'Dismissed' },
];

/** What an empty list says for each filter. */
export const EMPTY_TEXT: Record<ReportStatus, { title: string; hint: string }> = {
  OPEN: { title: 'No open reports.', hint: 'When a candidate reports a question it appears here.' },
  RESOLVED: { title: 'No resolved reports.', hint: 'Reports close as resolved when you publish a change to the question.' },
  DISMISSED: { title: 'No dismissed reports.', hint: 'Reports you dismiss with a reason appear here.' },
};

/** "Reported 3 times" / "Reported once" for a group. */
export const countWords = (n: number): string => (n === 1 ? 'Reported once' : n === 2 ? 'Reported twice' : `Reported ${n} times`);

/** The group's latest words: the newest message that has text, else "No message". */
export function latestMessage(g: Pick<GroupedReport, 'latestMessage' | 'messages'>): string {
  const m = g.latestMessage?.trim() || g.messages.find((x) => x.message?.trim())?.message?.trim();
  return m || 'No message';
}

/** The body of "Resolve without changes" / "Dismiss": the whole group of one question is closed together. */
export function closeBody(action: 'resolve' | 'dismiss', reason: string): { status: 'RESOLVED' | 'DISMISSED'; reason?: string } {
  return action === 'dismiss' ? { status: 'DISMISSED', reason } : { status: 'RESOLVED', ...(reason.trim() ? { reason: reason.trim() } : {}) };
}

export const summaryLine = (status: ReportStatus, total: number): string =>
  status === 'OPEN' ? `${plural(total, 'question')} with open reports` : `${plural(total, 'report')} ${WORD[status]}`;
