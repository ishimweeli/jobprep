import type { PaymentTab, UserFilter } from '../api/types';

/**
 * Filters live in the query string, so a link (from the Overview's "Needs attention", or a bookmark) opens the
 * list already filtered. Defaults are left out of the URL; changing any filter goes back to page 1.
 */

const USER_FILTERS: UserFilter[] = ['all', 'active', 'free', 'expired', 'suspended'];
const PAYMENT_TABS: PaymentTab[] = ['all', 'pending', 'paid', 'failed'];

const page = (v: string | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

export interface UsersQuery { q: string; filter: UserFilter; page: number }

export function parseUsersQuery(sp: URLSearchParams): UsersQuery {
  const f = sp.get('filter') as UserFilter | null;
  return { q: (sp.get('q') ?? '').trim(), filter: f && USER_FILTERS.includes(f) ? f : 'all', page: page(sp.get('page')) };
}

export function usersSearch(next: Partial<UsersQuery>, current: UsersQuery): string {
  const m: UsersQuery = { ...current, ...next, page: next.page ?? 1 };
  const sp = new URLSearchParams();
  if (m.q) sp.set('q', m.q);
  if (m.filter !== 'all') sp.set('filter', m.filter);
  if (m.page > 1) sp.set('page', String(m.page));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export interface PaymentsQuery { status: PaymentTab; stuck: boolean; provider: string; q: string; page: number }

/** `?stuck=true` is a pending payment past the "stuck" threshold, so the Pending chip shows as chosen. */
export function parsePaymentsQuery(sp: URLSearchParams): PaymentsQuery {
  const s = sp.get('status') as PaymentTab | null;
  const stuck = sp.get('stuck') === 'true' || sp.get('stuck') === '1';
  return {
    status: stuck ? 'pending' : s && PAYMENT_TABS.includes(s) ? s : 'all',
    stuck,
    provider: sp.get('provider') ?? '',
    q: (sp.get('q') ?? '').trim(),
    page: page(sp.get('page')),
  };
}

export function paymentsSearch(next: Partial<PaymentsQuery>, current: PaymentsQuery): string {
  const m: PaymentsQuery = { ...current, ...next, page: next.page ?? 1 };
  const sp = new URLSearchParams();
  if (m.stuck) sp.set('stuck', 'true');
  else if (m.status !== 'all') sp.set('status', m.status);
  if (m.provider) sp.set('provider', m.provider);
  if (m.q) sp.set('q', m.q);
  if (m.page > 1) sp.set('page', String(m.page));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export interface ExamsQuery { q: string; category: string; /** DRAFT | PUBLISHED | ARCHIVED, left out when not filtering. */ status?: string }

const TEST_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export function parseExamsQuery(sp: URLSearchParams): ExamsQuery {
  const status = (sp.get('status') ?? '').toUpperCase();
  return { q: (sp.get('q') ?? '').trim(), category: sp.get('category') ?? '', ...(TEST_STATUSES.includes(status) ? { status } : {}) };
}

export function examsSearch(next: Partial<ExamsQuery>, current: ExamsQuery): string {
  const m = { ...current, ...next };
  const sp = new URLSearchParams();
  if (m.q) sp.set('q', m.q);
  if (m.category) sp.set('category', m.category);
  if (m.status) sp.set('status', m.status.toLowerCase());
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Pages in a list: "Page 1 of 528". */
export const pageCount = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));
