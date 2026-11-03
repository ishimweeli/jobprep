import { api } from './client';
import type {
  AdminMe, AdminSettings, AuditPage, CatalogOptions, CountriesResponse, CountryDetail, ExamsPage, MockTestDetail,
  Overview, PaymentCheck, PaymentsPage, QuestionDetail, QuestionPatch, SettingsPatch, TeamMember, UserDetail, UsersPage,
} from './types';

/** Every admin endpoint the screens call, one typed function each. Query keys live next to them for cache sharing. */

export const keys = {
  me: ['admin', 'me'] as const,
  overview: (country?: string) => ['admin', 'overview', country ?? 'all'] as const,
  users: (q: Record<string, unknown>) => ['admin', 'users', q] as const,
  user: (id: string) => ['admin', 'user', id] as const,
  payments: (q: Record<string, unknown>) => ['admin', 'payments', q] as const,
  exams: (q: Record<string, unknown>) => ['admin', 'exams', q] as const,
  mockTest: (id: string) => ['admin', 'mock-test', id] as const,
  question: (id: string) => ['admin', 'question', id] as const,
  catalog: ['admin', 'catalog-options'] as const,
  countries: ['admin', 'countries'] as const,
  country: (code: string) => ['admin', 'country', code] as const,
  settings: ['admin', 'settings'] as const,
  team: ['admin', 'team'] as const,
  audit: (pageSize: number) => ['admin', 'audit', pageSize] as const,
};

// ── Who is signed in (the sign-in itself is the normal candidate sign-in; there are no admin auth calls)
/** `GET /api/admin/me`: the principal. Answers 401 (no session / stale session) or 403 (signed in, no admin role). */
export const adminMe = () => api<{ admin: AdminMe } | AdminMe>('/me').then((r) => ('admin' in r ? r.admin : r));

// ── Reads
export const getOverview = (country?: string) => api<Overview>('/overview', { query: { country } });
export const getUsers = (q: { q?: string; filter?: string; country?: string; page?: number; pageSize?: number }) => api<UsersPage>('/users', { query: q });
export const getUser = (id: string) => api<UserDetail>(`/users/${encodeURIComponent(id)}`);
export const getPayments = (q: { status?: string; provider?: string; stuck?: boolean; country?: string; q?: string; page?: number; pageSize?: number }) =>
  api<PaymentsPage>('/payments', { query: { ...q, stuck: q.stuck ? 'true' : undefined } });
export const checkPayment = (id: string) => api<PaymentCheck>(`/payments/${encodeURIComponent(id)}/check`, { method: 'POST' });
export const getExams = (q: { q?: string; category?: string; country?: string; page?: number; pageSize?: number }) => api<ExamsPage>('/exams', { query: q });
export const getMockTest = (id: string) => api<MockTestDetail>(`/mock-tests/${encodeURIComponent(id)}`);
export const getCatalogOptions = () => api<CatalogOptions>('/catalog-options');
export const getQuestion = (id: string) => api<QuestionDetail>(`/questions/${encodeURIComponent(id)}`);
export const patchQuestion = (id: string, body: QuestionPatch) => api<{ ok: true }>(`/questions/${encodeURIComponent(id)}`, { method: 'PATCH', body });
export const getCountries = () => api<CountriesResponse>('/countries');
export const getCountry = (code: string) => api<CountryDetail>(`/countries/${encodeURIComponent(code)}`);
export const getSettings = () => api<AdminSettings>('/settings');
export const putSettings = (body: SettingsPatch) => api<{ ok: true }>('/settings', { method: 'PUT', body });
export const getTeam = () => api<{ team: TeamMember[] }>('/team').then((r) => r.team);
export const getAudit = (pageSize: number) => api<AuditPage>('/audit', { query: { pageSize } });
