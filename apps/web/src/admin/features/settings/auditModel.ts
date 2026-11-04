import type { AuditListQuery } from '../../api/governance';

/** The audit log screen as a plain model (A12): filters in the query string, the API query, and how an entry's details read. */

export interface AuditFilterState { q: string; actor: string; action: string; entityType: string; country: string; from: string; to: string; page: number }

export const emptyAuditFilters: AuditFilterState = { q: '', actor: '', action: '', entityType: '', country: '', from: '', to: '', page: 1 };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAuditQuery(sp: URLSearchParams): AuditFilterState {
  const page = Number(sp.get('page'));
  const date = (k: string) => (DATE.test(sp.get(k) ?? '') ? (sp.get(k) as string) : '');
  return {
    q: (sp.get('q') ?? '').trim(), actor: sp.get('actor') ?? '', action: sp.get('action') ?? '', entityType: sp.get('type') ?? '',
    country: (sp.get('country') ?? '').toUpperCase(), from: date('from'), to: date('to'), page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Changing any filter goes back to page 1; defaults stay out of the URL. */
export function auditSearch(next: Partial<AuditFilterState>, current: AuditFilterState): string {
  const m = { ...current, ...next, page: next.page ?? 1 };
  const sp = new URLSearchParams();
  if (m.q) sp.set('q', m.q);
  if (m.actor) sp.set('actor', m.actor);
  if (m.action) sp.set('action', m.action);
  if (m.entityType) sp.set('type', m.entityType);
  if (m.country) sp.set('country', m.country);
  if (m.from) sp.set('from', m.from);
  if (m.to) sp.set('to', m.to);
  if (m.page > 1) sp.set('page', String(m.page));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Days are the operators' days in Kigali (UTC+2): the whole of the first day to the last millisecond of the last. */
export const dayStartIso = (d: string) => new Date(`${d}T00:00:00+02:00`).toISOString();
export const dayEndIso = (d: string) => new Date(`${d}T23:59:59.999+02:00`).toISOString();

export function toApiQuery(f: AuditFilterState, pageSize: number, includePaging = true): AuditListQuery {
  return {
    q: f.q || undefined, actorId: f.actor || undefined, action: f.action || undefined, entityType: f.entityType || undefined,
    country: f.country || undefined, from: f.from ? dayStartIso(f.from) : undefined, to: f.to ? dayEndIso(f.to) : undefined,
    ...(includePaging ? { page: f.page, pageSize } : {}),
  };
}

export const hasFilters = (f: AuditFilterState) => !!(f.q || f.actor || f.action || f.entityType || f.country || f.from || f.to);

export const dateRangeProblem = (f: Pick<AuditFilterState, 'from' | 'to'>): string | null =>
  f.from && f.to && f.to < f.from ? 'The end date is before the start date.' : null;

/** "mock_test.publish" -> "Mock test, publish". */
export function actionLabel(action: string): string {
  const [area, ...rest] = action.split('.');
  const words = (s: string) => s.replace(/[._]/g, ' ');
  const head = words(area ?? '');
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}${rest.length ? `, ${words(rest.join(' '))}` : ''}`;
}

const KEY_LABEL: Record<string, string> = {
  from: 'Before', to: 'After', targetName: 'Person', targetEmail: 'Email', title: 'Mock test', name: 'Name', country: 'Country', label: 'Payment method',
  transactionId: 'Transaction ID', reference: 'Reference', previousStatus: 'Previous status', durationDays: 'Access days', days: 'Days', endsAt: 'Access until',
  fields: 'Fields changed', change: 'Change', role: 'Role', result: 'Result', previous: 'Previous', created: 'Added', skipped: 'Skipped', questions: 'Questions',
};

export interface DetailRow { key: string; label: string; value: string }

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'not set';
  if (Array.isArray(v)) return v.map(show).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** The before / after values first, then everything else the API stored, in plain labels. Nothing is hidden or invented. */
export function detailRows(metadata: Record<string, unknown> | undefined): DetailRow[] {
  const m = metadata ?? {};
  const order = ['from', 'to', ...Object.keys(m).filter((k) => k !== 'from' && k !== 'to')];
  return order.filter((k) => k in m).map((k) => ({ key: k, label: KEY_LABEL[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), value: show(m[k]) }));
}

export const hasBeforeAfter = (metadata: Record<string, unknown> | undefined) => !!metadata && 'from' in metadata && 'to' in metadata;
