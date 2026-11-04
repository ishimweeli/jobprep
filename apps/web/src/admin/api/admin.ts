import { api } from './client';
import type {
  AdminMe, AdminSettings, AuditPage, AuditQuery, CaseBody, CaseStudy, CatalogOptionsFull, CategoryBody, CategoryRow, CountriesResponse, CountryDetail,
  CountryPatch, ExamsPage, GrantAccessBody, GrantAccessResult, ImportResult, InviteBody, ManualGrantResult, MockTestBody, MockTestDetail, MockTestDetailFull,
  Overview, PasswordResetResult, PaymentCheck, PaymentDetail, PaymentsPage, PlanPatch, QuestionCreateBody, QuestionDetail, QuestionPatch, ReportsPage,
  ReportStatus, SectionBody, SettingsPatch, TeamMember, TeamPatch, TopicRow, UserDetail, UsersPage,
} from './types';

/** Every admin endpoint the screens call, one typed function each. Query keys live next to them for cache sharing. */

export const keys = {
  me: ['admin', 'me'] as const,
  overview: (country?: string) => ['admin', 'overview', country ?? 'all'] as const,
  users: (q: Record<string, unknown>) => ['admin', 'users', q] as const,
  user: (id: string) => ['admin', 'user', id] as const,
  payments: (q: Record<string, unknown>) => ['admin', 'payments', q] as const,
  payment: (id: string) => ['admin', 'payment', id] as const,
  exams: (q: Record<string, unknown>) => ['admin', 'exams', q] as const,
  mockTest: (id: string) => ['admin', 'mock-test', id] as const,
  question: (id: string) => ['admin', 'question', id] as const,
  catalog: ['admin', 'catalog-options'] as const,
  categories: (country?: string) => ['admin', 'categories', country ?? 'all'] as const,
  topics: (categoryId: string) => ['admin', 'topics', categoryId] as const,
  caseStudy: (id: string) => ['admin', 'case', id] as const,
  reports: (q: Record<string, unknown>) => ['admin', 'reports', q] as const,
  countries: ['admin', 'countries'] as const,
  country: (code: string) => ['admin', 'country', code] as const,
  settings: ['admin', 'settings'] as const,
  team: ['admin', 'team'] as const,
  audit: (pageSize: number) => ['admin', 'audit', pageSize] as const,
  auditList: (q: Record<string, unknown>) => ['admin', 'audit-list', q] as const,
};

const enc = encodeURIComponent;

// ── Who is signed in (the sign-in itself is the normal candidate sign-in; there are no admin auth calls)
/** `GET /api/admin/me`: the principal. Answers 401 (no session / stale session) or 403 (signed in, no admin role). */
export const adminMe = () => api<{ admin: AdminMe } | AdminMe>('/me').then((r) => ('admin' in r ? r.admin : r));

// ── Reads
export const getOverview = (country?: string) => api<Overview>('/overview', { query: { country } });
export const getUsers = (q: { q?: string; filter?: string; country?: string; page?: number; pageSize?: number }) => api<UsersPage>('/users', { query: q });
export const getUser = (id: string) => api<UserDetail>(`/users/${enc(id)}`);
export const getPayments = (q: { status?: string; provider?: string; stuck?: boolean; country?: string; q?: string; page?: number; pageSize?: number }) =>
  api<PaymentsPage>('/payments', { query: { ...q, stuck: q.stuck ? 'true' : undefined } });
export const getPayment = (id: string) => api<PaymentDetail>(`/payments/${enc(id)}`);
export const checkPayment = (id: string) => api<PaymentCheck>(`/payments/${enc(id)}/check`, { method: 'POST' });
export const getExams = (q: { q?: string; category?: string; country?: string; status?: string; page?: number; pageSize?: number }) => api<ExamsPage>('/exams', { query: q });
export const getMockTest = (id: string) => api<MockTestDetail>(`/mock-tests/${enc(id)}`);
/** The same endpoint with every field the test form needs (the mock-test form, A9). */
export const getMockTestFull = (id: string) => api<MockTestDetailFull>(`/mock-tests/${enc(id)}`);
export const getCatalogOptions = () => api<CatalogOptionsFull>('/catalog-options');
export const getQuestion = (id: string) => api<QuestionDetail>(`/questions/${enc(id)}`);
export const patchQuestion = (id: string, body: QuestionPatch) => api<{ ok: true }>(`/questions/${enc(id)}`, { method: 'PATCH', body });
export const getCountries = () => api<CountriesResponse>('/countries');
export const getCountry = (code: string) => api<CountryDetail>(`/countries/${enc(code)}`);
export const getSettings = () => api<AdminSettings>('/settings');
export const putSettings = (body: SettingsPatch) => api<{ ok: true }>('/settings', { method: 'PUT', body });
export const getTeam = () => api<{ team: TeamMember[] }>('/team').then((r) => r.team);
export const getAudit = (pageSize: number) => api<AuditPage>('/audit', { query: { pageSize } });
export const getAuditList = (q: AuditQuery) => api<AuditPage>('/audit', { query: { ...q } });
export const getCategories = (country?: string) => api<{ categories: CategoryRow[] }>('/categories', { query: { country } }).then((r) => r.categories);
export const getTopics = (categoryId: string) => api<{ topics: TopicRow[] }>('/topics', { query: { categoryId } }).then((r) => r.topics);
export const getCase = (id: string) => api<{ case: CaseStudy }>(`/cases/${enc(id)}`).then((r) => r.case);
export const getReports = (q: { status?: ReportStatus; country?: string; page?: number; pageSize?: number }) => api<ReportsPage>('/reports', { query: q });

// ── Writes (same-origin session; the API writes the audit row and needs a reason where the rules say so)
export const grantAccess = (userId: string, body: GrantAccessBody) => api<GrantAccessResult>(`/users/${enc(userId)}/access`, { method: 'POST', body });
export const suspendUser = (userId: string, reason: string) => api<{ ok: true }>(`/users/${enc(userId)}/suspend`, { method: 'POST', body: { reason } });
export const unsuspendUser = (userId: string, reason: string) => api<{ ok: true }>(`/users/${enc(userId)}/unsuspend`, { method: 'POST', body: { reason } });
export const sendPasswordReset = (userId: string) => api<PasswordResetResult>(`/users/${enc(userId)}/send-password-reset`, { method: 'POST' });
export const manualGrant = (paymentId: string, body: { transactionId: string; reason: string }) => api<ManualGrantResult>(`/payments/${enc(paymentId)}/manual-grant`, { method: 'POST', body });

export const createCategory = (body: CategoryBody & { countryCode: string; name: string }) => api<{ id: string; slug: string }>('/categories', { method: 'POST', body });
export const patchCategory = (id: string, body: CategoryBody) => api<{ ok: true }>(`/categories/${enc(id)}`, { method: 'PATCH', body });
export const deleteCategory = (id: string) => api<{ ok: true }>(`/categories/${enc(id)}`, { method: 'DELETE' });
export const createTopic = (body: { categoryId: string; name: string }) => api<{ id: string; slug: string }>('/topics', { method: 'POST', body });
export const patchTopic = (id: string, name: string) => api<{ ok: true }>(`/topics/${enc(id)}`, { method: 'PATCH', body: { name } });
export const deleteTopic = (id: string) => api<{ ok: true }>(`/topics/${enc(id)}`, { method: 'DELETE' });
export const createSection = (testId: string, body: { name: string; questionTypeLabel?: string }) => api<{ id: string }>(`/mock-tests/${enc(testId)}/sections`, { method: 'POST', body });
export const patchSection = (id: string, body: SectionBody) => api<{ ok: true }>(`/sections/${enc(id)}`, { method: 'PATCH', body });
export const deleteSection = (id: string) => api<{ ok: true }>(`/sections/${enc(id)}`, { method: 'DELETE' });
export const createCase = (testId: string, body: Required<Pick<CaseBody, 'title' | 'passage'>> & CaseBody) => api<{ id: string }>(`/mock-tests/${enc(testId)}/cases`, { method: 'POST', body });
export const patchCase = (id: string, body: CaseBody) => api<{ ok: true }>(`/cases/${enc(id)}`, { method: 'PATCH', body });
export const deleteCase = (id: string) => api<{ ok: true }>(`/cases/${enc(id)}`, { method: 'DELETE' });

export const createMockTest = (body: MockTestBody & { title: string; categoryId: string; durationMinutes: number }) => api<{ id: string; slug: string; status: string }>('/mock-tests', { method: 'POST', body });
export const patchMockTest = (id: string, body: MockTestBody) => api<{ ok: true }>(`/mock-tests/${enc(id)}`, { method: 'PATCH', body });
export const publishMockTest = (id: string) => api<{ ok: true; status: 'PUBLISHED'; questions: number }>(`/mock-tests/${enc(id)}/publish`, { method: 'POST' });
export const archiveMockTest = (id: string) => api<{ ok: true; status: 'ARCHIVED' }>(`/mock-tests/${enc(id)}/archive`, { method: 'POST' });
export const createQuestion = (testId: string, body: QuestionCreateBody) => api<{ id: string; status: string }>(`/mock-tests/${enc(testId)}/questions`, { method: 'POST', body });
export const archiveQuestion = (id: string) => api<{ ok: true }>(`/questions/${enc(id)}`, { method: 'DELETE' });
export const importQuestions = (testId: string, body: { csv: string; dryRun?: boolean; importValidRows?: boolean }) => api<ImportResult>(`/mock-tests/${enc(testId)}/import`, { method: 'POST', body });
export const resolveReport = (id: string) => api<{ ok: true; status: 'RESOLVED' }>(`/reports/${enc(id)}/resolve`, { method: 'POST' });
export const dismissReport = (id: string, reason?: string) => api<{ ok: true; status: 'DISMISSED' }>(`/reports/${enc(id)}/dismiss`, { method: 'POST', body: reason ? { reason } : undefined });

export const patchCountry = (code: string, body: CountryPatch) => api<{ ok: true }>(`/countries/${enc(code)}`, { method: 'PATCH', body });
export const patchPlan = (code: string, body: PlanPatch) => api<{ ok: true; priceLabel: string | null }>(`/countries/${enc(code)}/plan`, { method: 'PATCH', body });
export const patchPaymentMethod = (code: string, provider: string, body: { mode: 'DISABLED' | 'SANDBOX' | 'LIVE'; reason: string }) =>
  api<{ ok: true; mode: string }>(`/countries/${enc(code)}/payment-methods/${enc(provider)}`, { method: 'PATCH', body });
export const inviteAdmin = (body: InviteBody) => api<{ admin: TeamMember; addedToExistingAccount: boolean }>('/team', { method: 'POST', body });
export const patchTeamMember = (id: string, body: TeamPatch) => api<{ admin: TeamMember }>(`/team/${enc(id)}`, { method: 'PATCH', body });
