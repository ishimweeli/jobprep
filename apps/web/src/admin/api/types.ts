/** Response shapes of `/api/admin/*` (see apps/api/src/routes/admin). Only the fields the screens use. */

export type Permission =
  | 'overview:read' | 'users:read' | 'users:manage' | 'otp:resend' | 'exams:read' | 'exams:write' | 'reports:resolve'
  | 'payments:read' | 'payments:check' | 'payments:grant' | 'countries:read' | 'countries:write' | 'settings:write'
  | 'audit:read' | 'admins:manage';

export type AdminRole = 'SYSTEM_ADMIN' | 'CONTENT_EDITOR' | 'SUPPORT';

export interface AdminRoleRef { code: AdminRole; label: string }

/** `GET /api/admin/me`: the signed-in person's admin principal. One account may hold several roles. */
export interface AdminMe {
  id: string;
  name: string;
  email?: string;
  roles: AdminRoleRef[];
  permissions: Permission[];
  /** Empty = every country. */
  countryScope: string[];
}

// ── Overview
export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'DECLINED' | 'EXPIRED';

export interface Overview {
  asOf: string;
  scope: string[] | null;
  kpis: {
    registeredUsers: number;
    newUsersToday: number;
    fullAccessActive: number;
    paymentsToday: number;
    revenueThisMonth: { currencyCode: string; amountMinor: number; payments: number; label: string }[];
    testsStartedToday: number;
    testsCompletedPercentToday: number | null;
  };
  needsAttention: {
    stuckPayments: { count: number; thresholdMinutes: number; oldestMinutes: number | null; oldestProvider: string | null };
    reportedQuestions: { count: number; top: { mockTestTitle: string; questionNumber: number; reports: number } | null };
    examRequests: { label: string; n: number }[];
  };
  chart: { days: string[]; signups: number[]; payments: number[] };
  topMockTests: { mockTestId: string; title: string; isFree: boolean; attempts: number; avgPercent: number | null; completionPercent: number }[];
  latestPayments: { id: string; user: { id: string; name: string }; providerLabel: string; createdAt: string; status: PaymentStatus }[];
}

// ── Users
export type AccessState = 'active' | 'free' | 'expired' | 'suspended';
export type UserFilter = 'all' | 'active' | 'free' | 'expired' | 'suspended';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  countryCode: string;
  goal: string | null;
  testsTaken: number;
  lastActiveAt: string | null;
  joinedAt: string;
  status: 'ACTIVE' | 'SUSPENDED';
  /** Admin role codes the account holds (empty for a plain candidate). */
  roles?: string[];
  access: { state: AccessState; endsAt: string | null; daysLeft: number | null; expiredAt: string | null };
}
export interface UsersPage { total: number; page: number; pageSize: number; filter: UserFilter; results: UserRow[] }

export interface UserDetail {
  user: {
    id: string; name: string; email: string; countryCode: string; joinedAt: string; lastSeenAt: string | null;
    status: 'ACTIVE' | 'SUSPENDED'; suspendedReason: string | null; goal: string | null; language: string; roles?: string[];
  };
  access: {
    state: AccessState; endsAt: string | null; daysLeft: number | null; expiredAt: string | null;
    pendingPaymentSince: string | null; lastPaymentFailed: boolean;
  };
  attempts: { id: string; kind: string; title: string; submittedAt: string | null; percent: number | null; attemptNumber: number | null }[];
  payments: { id: string; createdAt: string; status: PaymentStatus; provider: string; providerLabel: string; priceLabel: string | null; reference: string | null }[];
  adminHistory: { id: string; action: string; actor: string | null; reason: string | null; at: string }[];
}

// ── Payments
export type PaymentTab = 'all' | 'pending' | 'paid' | 'failed';

export interface PaymentRow {
  id: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
  countryCode: string;
  provider: string;
  providerLabel: string;
  msisdn: string;
  amountMinor: number;
  priceLabel: string | null;
  status: PaymentStatus;
  stuck: boolean;
  waitingMinutes: number | null;
  accessUntil: string | null;
  failureReason: string | null;
  reference: string | null;
  actions: ('check' | 'grant')[];
}
export interface PaymentsPage {
  total: number; page: number; pageSize: number; status: PaymentTab; stuckAfterMinutes: number;
  summary: { paidToday: { currencyCode: string; amountMinor: number; label: string | null }[]; successfulToday: number; pendingNow: number; failedOrExpiredToday: number };
  results: PaymentRow[];
}
export interface PaymentCheck { id: string; status: PaymentStatus; changed: boolean }

// ── Exams
export type TestStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type Difficulty = 'FOUNDATION' | 'STANDARD' | 'CHALLENGING';
export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_SELECT' | 'CASE_BASED';

export interface ExamRow {
  id: string; slug: string; title: string; countryCode: string; category: { name: string; slug: string };
  isFree: boolean; status: TestStatus; questionCount: number; durationMinutes: number; openReports: number;
}
export interface ExamsPage {
  total: number; page: number; pageSize: number;
  totals: { mockTests: number; questions: number; categories: number };
  results: ExamRow[];
}
export interface MockTestDetail {
  mockTest: { id: string; title: string; status: TestStatus; isFree: boolean; countryCode: string; category: { id: string; name: string } };
  sections: { id: string; name: string }[];
  cases: { id: string; title: string }[];
  questions: { id: string; number: number; stem: string; type: QuestionType; status: TestStatus; openReports: number }[];
}
export interface CatalogOptions {
  categories: { id: string; countryCode: string; slug: string; name: string; topics: { id: string; name: string }[] }[];
}
export interface QuestionDetail {
  question: {
    id: string; type: QuestionType; status: TestStatus; stem: string; explanation: string; marks: number; difficulty: Difficulty; version: number;
    options: { key: string; text: string; correct: boolean }[];
    scoring: 'ALL_OR_NOTHING' | 'PARTIAL' | null; choose: number | null;
    topic: { id: string; name: string } | null; section: { id: string; name: string } | null; case: { id: string; title: string } | null;
  };
  mockTest: { id: string; title: string; isFree: boolean; status: TestStatus; countryCode: string };
  position: { number: number; total: number; previousId: string | null; nextId: string | null };
  reports: { id: string; message: string | null; createdAt: string }[];
  stats: { attempts: number; correctPercent: number | null };
  lastEdited: { by: string | null; at: string } | null;
}
export interface QuestionPatch {
  stem?: string;
  options?: { key: string; text: string }[];
  correct?: string[];
  explanation?: string;
  topicId?: string;
  caseId?: string | null;
  marks?: number;
  difficulty?: Difficulty;
  status?: 'DRAFT' | 'PUBLISHED';
  resolveReports?: boolean;
}

// ── Countries and settings
export type CountryStatus = 'LIVE' | 'PREPARING' | 'PLANNED';
export type ProviderMode = 'DISABLED' | 'SANDBOX' | 'LIVE';

export interface CountryRow {
  code: string; name: string; status: CountryStatus; currencyCode: string; users: number; publishedTests: number;
  draftTests: number; waitingList: number; priceLabel: string | null;
}
export interface CountriesResponse { countries: CountryRow[]; counts: { live: number; preparing: number; planned: number } }
export interface ChecklistItem { key: 'price' | 'payment' | 'freeSamples' | 'legal'; label: string; ok: boolean; detail?: string }
export interface CountryDetail {
  country: { code: string; name: string; status: CountryStatus; currencyCode: string; dialCode: string; slug: string; url: string; disclaimer: string; users: number; mockTests: number; waitingList: number };
  plan: { priceMinor: number | null; priceLabel: string | null; durationDays: number; autoRenew: boolean } | null;
  paymentMethods: { provider: string; label: string; mode: ProviderMode; hint: string | null }[];
  languages: { code: string; completionPercent: number }[];
  categories: { id: string; name: string; mockTests: number }[];
  checklist: ChecklistItem[];
  readyToLaunch: boolean;
}
export interface AdminSettings {
  stuckAfterMinutes: number; showExplanationsOnFreeResults: boolean; showPassMarks: boolean; freeSamplesOpenWithoutAccount: boolean;
}
export type SettingsPatch = Partial<Pick<AdminSettings, 'stuckAfterMinutes' | 'showExplanationsOnFreeResults' | 'showPassMarks'>>;
/** One role an admin holds, with the countries it covers (empty = all) and whether it is switched on. */
export interface TeamMemberRole { code: AdminRole; label: string; countryScope: string[]; active: boolean }
export interface TeamMember {
  id: string; name: string; email: string; active: boolean; countryScope: string[];
  /** Every role the person holds (an invite for an existing account adds one). The single-role fields below are the legacy shape. */
  roles?: TeamMemberRole[];
  role: AdminRole; roleLabel: string;
}
export interface AuditEntry {
  id: string; at: string; actor: { id: string; name: string } | null; action: string; entityType: string; entityId: string | null;
  countryCode: string | null; reason: string | null; summary: string;
}
export interface AuditPage { total: number; page: number; pageSize: number; results: AuditEntry[] }
