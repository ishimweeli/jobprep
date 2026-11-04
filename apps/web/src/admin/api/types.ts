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
  /** When the person last used the app (only if the API sends it). */
  lastActiveAt?: string | null;
  /** Every role the person holds (an invite for an existing account adds one). The single-role fields below are the legacy shape. */
  roles?: TeamMemberRole[];
  role: AdminRole; roleLabel: string;
}
export interface AuditEntry {
  id: string; at: string; actor: { id: string; name: string } | null; action: string; entityType: string; entityId: string | null;
  countryCode: string | null; reason: string | null; summary: string;
  /** Names and values the API stored with the entry (old and new price, target name ...). Never secrets. */
  metadata?: Record<string, unknown>;
}
export interface AuditPage { total: number; page: number; pageSize: number; results: AuditEntry[] }
export interface AuditQuery {
  actorId?: string; action?: string; entityType?: string; country?: string; from?: string; to?: string; page?: number; pageSize?: number;
}

// ───────────────────────── Actions on users and payments (A2-A5)
export interface GrantAccessBody { days?: number; countryCode?: string; reason: string }
export interface GrantAccessResult { grantId: string; endsAt: string; access: { state: AccessState; endsAt: string | null; daysLeft: number | null; expiredAt: string | null } }
export interface PasswordResetResult { cooldownSeconds: number; expiresInSeconds: number }
export interface PaymentDetail {
  payment: {
    id: string; status: PaymentStatus; provider: string; msisdn: string; createdAt: string; expiresAt: string; confirmedAt: string | null;
    priceLabel: string | null; reference: string | null; transactionId: string | null; failureReason: string | null; countryCode: string;
    /** Added with the missing-designs batch: what the buttons may do and how old the payment is. Absent on an older API. */
    stuck?: boolean; waitingMinutes?: number | null; canCheck?: boolean; canManualGrant?: boolean; ageMinutes?: number;
  };
  user: { id: string; name: string; email: string };
  events: { id: string; source: string; status: string; at: string }[];
  grant: { id: string; source: string; startsAt: string; endsAt: string; grantedBy: string | null; reason: string | null } | null;
}
export interface ManualGrantResult { id: string; status: PaymentStatus; accessUntil: string | null }

// ───────────────────────── Catalog (A7, A8)
export interface CategoryRow {
  id: string; countryCode: string; slug: string; name: string; description: string; icon: string; sortOrder: number; featured: boolean;
  mockTests: number; topics: number; professions: number;
}
export interface CategoryBody { countryCode?: string; name?: string; description?: string; icon?: string; sortOrder?: number; featured?: boolean }
export interface TopicRow { id: string; slug: string; name: string; questions: number }
export interface SectionBody { name?: string; questionTypeLabel?: string; sortOrder?: number }
export interface CaseTable { caption: string; rows: { label: string; value?: string; heading?: boolean }[] }
export interface CaseStudy { id: string; mockTestId: string; title: string; passage: string[]; tables: CaseTable[]; notes: string[]; questions: number }
export interface CaseBody { title?: string; passage?: string[]; tables?: CaseTable[]; notes?: string[] }

// ───────────────────────── Mock tests (A9) and questions (A10)
export interface MockTestFull {
  id: string; slug: string; title: string; summary: string; status: TestStatus; isFree: boolean; difficulty: Difficulty; durationMinutes: number;
  languages: string[]; instructions: string[]; countryCode: string; negativeMarkPerWrong: number; passMarkPercent: number | null;
  passMarkSource: string | null; category: { id: string; name: string }; publishedAt: string | null;
}
/** `GET /mock-tests/:id` as the API really sends it (the list-friendly `MockTestDetail` above keeps only what the editor needs). */
export interface MockTestDetailFull {
  mockTest: MockTestFull;
  sections: { id: string; name: string; questionTypeLabel: string; sortOrder: number; questionCount: number }[];
  cases: { id: string; title: string }[];
  questions: { id: string; number: number; stem: string; type: QuestionType; status: TestStatus; section: string; topic: string; marks: number; openReports: number }[];
}
export interface MockTestBody {
  title?: string; summary?: string; categoryId?: string; examId?: string; professionId?: string; isFree?: boolean; difficulty?: Difficulty;
  durationMinutes?: number; languages?: string[]; instructions?: string[]; negativeMarkPerWrong?: number; passMarkPercent?: number | null; passMarkSource?: string | null;
}
export interface CatalogOptionsFull extends CatalogOptions {
  professions?: { id: string; categoryId: string; name: string; examId: string | null }[];
  authorities?: { id: string; countryCode: string; shortName: string; name: string }[];
}
export interface QuestionCreateBody {
  sectionId: string; stem: string; options: { key: string; text: string }[]; correct: string[]; type?: QuestionType; scoring?: 'ALL_OR_NOTHING' | 'PARTIAL';
  choose?: number | null; explanation: string; topicId: string; caseId?: string | null; marks?: number; difficulty?: Difficulty; status?: 'DRAFT' | 'PUBLISHED';
}

// ───────────────────────── CSV import (A6) and reports (A11)
export interface ImportRowProblem { row: number; column?: string; problem: string }
export interface ImportSummary { totalRows: number; validRows: number; invalidRows: number; problems: ImportRowProblem[] }
export type ImportResult = ({ dryRun: true } & ImportSummary) | ({ dryRun: false; created: number } & ImportSummary);
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';
export interface ReportRow {
  id: string; message: string | null; createdAt: string; status: ReportStatus;
  question: { id: string; number: number; stem: string }; mockTest: { id: string; title: string };
}
export interface ReportsPage { total: number; page: number; status: ReportStatus; results: ReportRow[] }

// ───────────────────────── Countries (A14) and team (A13)
export interface SupportContact { phone?: string | null; whatsapp?: string | null; email?: string | null; hours?: string | null }
export interface CountryPatch { status?: CountryStatus; disclaimer?: string; legalReviewed?: boolean; reason?: string; force?: boolean; supportContact?: SupportContact }
export interface PlanPatch { priceMinor: number; durationDays?: number; reason: string }
export interface InviteBody { email: string; name: string; role: AdminRole; countryScope: string[]; reason: string }
export interface TeamPatch { name?: string; role?: AdminRole; newRole?: AdminRole; countryScope?: string[]; active?: boolean; reason: string }
