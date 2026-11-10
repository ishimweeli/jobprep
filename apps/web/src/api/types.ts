/** Response shapes of the JobPrep API (see apps/api/src/routes). */

export type CountryStatus = 'LIVE' | 'PREPARING' | 'PLANNED';
export type Difficulty = 'FOUNDATION' | 'STANDARD' | 'CHALLENGING';

export interface CountrySummary {
  code: string;
  slug: string;
  name: string;
  status: CountryStatus;
  dialCode: string;
  currencyCode: string;
  languages: string[];
  selectable: boolean;
}

export interface PaymentMethod {
  provider: string;
  label: string;
  hint: string | null;
  mode?: string;
}

export interface CountryDetail {
  code: string;
  name: string;
  status: CountryStatus;
  dialCode: string;
  languages: string[];
  disclaimer: string | null;
  plan: null | {
    code: string;
    name: string;
    priceMinor: number | null;
    priceLabel: string | null;
    currencyCode: string;
    durationDays: number;
    autoRenew: boolean;
    checkoutAvailable: boolean;
  };
  paymentMethods: PaymentMethod[];
  /** Where to reach support in this country (docs/API_ADDITIONS.md). */
  supportContact?: SupportContact;
}

/** `configured` false = nothing set (hide the block); `placeholder` true = development placeholder values. */
export interface SupportContact {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  hours: string | null;
  /** Named people to call, shown as well as the general phone and WhatsApp. */
  people?: { name: string; phone: string }[];
  configured: boolean;
  placeholder: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  featured: boolean;
  mockTestCount: number;
}

export interface TestCard {
  id: string;
  slug: string;
  title: string;
  category: { slug: string; name: string };
  profession: string;
  questionCount: number;
  durationMinutes: number;
  languages: string[];
  difficulty: Difficulty;
  isFree: boolean;
  accessTag: 'FREE' | 'FULL_ACCESS';
  attempts: 'UNLIMITED' | string;
  publishedAt: string | null;
  /** Application deadline of the real job posting this mock targets, if it's tied to one currently open. */
  jobDeadlineAt: string | null;
  /** When the real job posting opened for applications (MIFOTRA); null when unknown. */
  jobPostedAt?: string | null;
}

/** The general psychometric practice section, once it has published exams. */
export interface PsychometricPrepInfo {
  jobSlug: string;
  mockTestCount: number;
  freeCount: number;
}

export interface Landing {
  country: { code: string; name: string; disclaimer: string | null; languages: string[] };
  popularSearches: string[];
  /** Live counts of what is published, for the line under the hero. */
  stats?: { mockTests: number; jobs: number };
  psychometricPrep?: PsychometricPrepInfo | null;
  categories: Category[];
  featuredCategory: { slug: string; name: string } | null;
  featuredTests: TestCard[];
  recentlyAdded: TestCard[];
  plan: null | { name: string; priceLabel: string | null; durationDays: number; autoRenew: boolean; checkoutAvailable: boolean };
  howItWorks: string[];
}

export interface CatalogFacets {
  categories: { slug: string; name: string; count: number }[];
  subjects: { slug: string; name: string }[];
  difficulties: Difficulty[];
  languages: string[];
}

export interface CatalogResponse {
  total: number;
  page: number;
  pageSize: number;
  results: TestCard[];
  empty: boolean;
  canRequestExam: boolean;
  facets: CatalogFacets;
  /** Load more: `page` + `hasMore`. */
  hasMore?: boolean;
  nextPage?: number | null;
  totalPages?: number;
}

/** One card per job (`Exam`): its mock tests aggregated. See `TestCard` for the per-mock-test shape. */
export interface JobCard {
  examId: string;
  jobSlug: string;
  jobName: string;
  category: { slug: string; name: string };
  mockTestCount: number;
  freeCount: number;
  difficulties: Difficulty[];
  durationMinutes: number | null;
  durationRange: { min: number; max: number } | null;
  questionCount: number | null;
  questionCountRange: { min: number; max: number } | null;
  languages: string[];
  jobDeadlineAt: string | null;
  /** When the real job posting opened for applications (MIFOTRA); null when unknown. */
  jobPostedAt?: string | null;
  publishedAt: string | null;
}

export interface JobCatalogResponse {
  total: number;
  page: number;
  pageSize: number;
  results: JobCard[];
  empty: boolean;
  canRequestExam: boolean;
  facets: CatalogFacets;
  hasMore?: boolean;
  nextPage?: number | null;
  totalPages?: number;
  psychometricPrep?: PsychometricPrepInfo | null;
}

export interface JobMockTestCard {
  id: string;
  slug: string;
  title: string;
  isFree: boolean;
  accessTag: 'FREE' | 'FULL_ACCESS';
  difficulty: Difficulty;
  languages: string[];
  durationMinutes: number;
  questionCount: number;
  jobDeadlineAt: string | null;
  /** When the real job posting opened for applications (MIFOTRA); null when unknown. */
  jobPostedAt?: string | null;
  publishedAt: string | null;
  /** This person's finished attempts of this mock; `null` when they have none (or are not signed in). */
  myAttempts?: null | { count: number; bestPercent: number | null };
  access: {
    state: 'FREE' | 'GRANTED' | 'LOCKED';
    canStart: boolean;
    needsFullAccess: boolean;
    accessEndsAt: string | null;
    daysLeft: number | null;
  };
}

export interface JobDetail {
  exam: { id: string; slug: string; name: string };
  /** This job is the general psychometric section itself. */
  isPsychometricPrep?: boolean;
  psychometricPrep?: PsychometricPrepInfo | null;
  category: { slug: string; name: string };
  profession: { name: string };
  jobDeadlineAt: string | null;
  /** When the real job posting opened for applications (MIFOTRA); null when unknown. */
  jobPostedAt?: string | null;
  freeCount: number;
  totalMockTests: number;
  mockTests: JobMockTestCard[];
}

/** The job a user picked on the catalog — carried on the session so `tests/jobs/:slug` can be reached directly. */
export interface PreferredJob {
  examId: string;
  slug: string;
  name: string;
}

export interface ExamSection {
  name: string;
  questionType: string;
  questions: number;
  marks: number;
}

export interface PreviousAttempt {
  id: string;
  submittedAt: string | null;
  scoreMarks: number | null;
  totalMarks: number | null;
  percent: number | null;
  minutesUsed: number | null;
  kind?: 'FULL';
}

export interface AttemptStats {
  count: number;
  bestPercent: number | null;
  last: null | { id: string; percent: number | null; submittedAt: string | null };
}

export interface ExamDetail extends TestCard {
  summary: string | null;
  totalMarks: number;
  sections: ExamSection[];
  instructions: string[];
  negativeMarking: null | { perWrongAnswer: number };
  passMark: null | { percent: number; source: string };
  noOfficialPassMark: boolean;
  access: {
    state: 'FREE' | 'GRANTED' | 'LOCKED';
    canStart: boolean;
    requiresAccount: boolean;
    needsFullAccess: boolean;
    accessEndsAt: string | null;
    daysLeft: number | null;
  };
  /** A running attempt of this test (signed-in users only). */
  inProgress: null | { attemptId: string; answered: number; total: number; remainingSeconds: number };
  pricing: null | {
    priceLabel: string | null;
    durationDays: number | null;
    checkoutAvailable: boolean;
    paymentMethods: string[];
  };
  freeSample: null | { slug: string; title: string; questionCount: number };
  /** On a locked mock: how many are locked for this job, and this person's best score on it so far. */
  jobProgress?: null | { lockedCount: number; attempts: number; best: null | { percent: number; title: string; slug: string } };
  previousAttempts: PreviousAttempt[];
  /** Finished full attempts of this test by the signed-in user (practice sets are not counted). */
  attemptStats?: AttemptStats;
}

export interface PricingResponse {
  country: { code: string; name: string; currencyCode: string };
  free: { priceLabel: string | null; mockTestCount: number };
  fullAccess: null | {
    name: string;
    priceMinor: number | null;
    priceLabel: string | null;
    durationDays: number;
    paidOnce: boolean;
    autoRenew: boolean;
    mockTestCount: number;
    checkoutAvailable: boolean;
  };
  /** Full Access + Interview prep; null while interview prep is switched off or has no price. */
  interviewPrep?: null | {
    name: string;
    priceMinor: number | null;
    priceLabel: string | null;
    durationDays: number;
    interviewMinutes: number;
    mockTestCount: number;
    /** What someone who already has Full Access pays (the difference), or null. */
    upgradePriceLabel: string | null;
    checkoutAvailable: boolean;
  };
  paymentMethods: { provider: string; label: string; hint: string | null }[];
}

export type SetupStep = 'country' | 'category' | 'goal';

/** Where the person is in the three-step setup (country, job category, level and subject). `nextStep` is `null` when it is finished or skipped. */
export interface Onboarding {
  done: boolean;
  nextStep: SetupStep | null;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  countryCode: string;
  goalCategoryId: string | null;
  preferredExamId: string | null;
  level: string | null;
  subject: string | null;
  /** `YYYY-MM-DD` or null. */
  examDate: string | null;
  language: string;
  onboarding: Onboarding;
  /** Active admin role codes (`SYSTEM_ADMIN`, `CONTENT_EDITOR`, `SUPPORT`); `[]` for a plain candidate. One account can hold several. */
  roles?: string[];
}

export interface AccessSummary {
  current: null | { endsAt: string; daysLeft: number; endingSoon: boolean };
  /** Set when there is no current access but there was some: when the last one ended. */
  expired: null | { endedAt: string };
  otherCountries: { countryCode: string; endsAt: string; daysLeft: number }[];
}

export interface MeResponse {
  user: PublicUser;
  country: { code: string; name: string; currencyCode: string; languages: string[] };
  access: AccessSummary;
  preferredJob: PreferredJob | null;
  /** Features switched on for this deployment. */
  features?: { interviewPrep: boolean };
}

/** What a sign-up and a "send a new code" answer: how long until another code may be asked for, and how long this one works. */
export interface OtpRequestResponse {
  cooldownSeconds: number;
  expiresInSeconds: number;
}

export interface SignUpResponse extends OtpRequestResponse {
  status: 'verification_required';
  email: string;
}

export interface AuthProviders {
  google: boolean;
}

export interface AuthResponse {
  user: PublicUser;
  claimedAttempts: number;
}

// ───────────────────────── Exam engine (apps/api/src/routes/attempts.ts)

export interface TimerState {
  /** Practice sets have no clock. */
  untimed?: boolean;
  remainingSeconds: number;
  serverNow: string;
  deadlineAt: string;
  /** Under 5 minutes: the design turns the clock red. */
  low: boolean;
  expired: boolean;
}

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';

export interface StartAttemptResponse {
  attemptId: string;
  resumed: boolean;
  guestToken: string | null;
  timer: TimerState;
}

export interface ExamQuestion {
  id: string;
  number: number;
  sectionName: string;
  topic: { id: string; name: string };
  type: 'SINGLE_CHOICE' | 'MULTIPLE_SELECT' | 'CASE_BASED' | string;
  multiple: boolean;
  /** Multiple-select: how many answers to choose (the most picks the server accepts). `null` for single answer. */
  choose: number | null;
  stem: string;
  options: { key: string; text: string }[];
  marks: number;
  caseId: string | null;
}

export interface CaseTable {
  caption: string;
  rows: { label: string; value?: string; heading?: boolean }[];
}

export interface ExamCase {
  id: string;
  title: string;
  passage: string[];
  tables: CaseTable[];
  notes: string[];
  questionNumbers: number[];
}

export interface AttemptCounts {
  total: number;
  answered: number;
  flagged: number;
}

export interface AttemptState {
  attempt: {
    id: string;
    status: AttemptStatus;
    kind: 'FULL' | 'PRACTICE';
    startedAt: string;
    deadlineAt: string;
    durationSeconds: number;
    submittedAt: string | null;
    mockTest: { slug: string; title: string; countryCode: string };
  };
  timer: TimerState;
  questions: ExamQuestion[];
  cases: ExamCase[];
  answers: Record<string, { selected: string[]; flagged: boolean }>;
  counts: AttemptCounts;
  finished: boolean;
  /** Set once the attempt has ended: what the "This attempt has ended" screen may offer (C9). */
  reopen?: null | AttemptReopen;
  language?: LanguageServed;
}

export interface AttemptReopen {
  ended: true;
  autoSubmitted: boolean;
  canStartNew: boolean;
  startNewReason: 'needs_full_access' | 'practice' | null;
  mockTestSlug: string;
  countryCode: string;
}

/** Translation coverage of an attempt or review fetched with `?lang=`. */
export interface LanguageServed {
  requested: string;
  served: 'en' | 'rw' | 'sw';
  translatedQuestions: number;
  totalQuestions: number;
}

export interface TimerResponse extends TimerState {
  status: AttemptStatus;
}

export interface AnswerChangeDto {
  questionId: string;
  selected?: string[];
  flagged?: boolean;
  at?: string;
}

export interface ChangeResult {
  questionId: string;
  status: 'saved' | 'stale' | 'rejected';
  error?: 'unknown_question' | 'invalid_option' | 'too_many_choices' | 'after_deadline';
}

export interface SaveAnswersResponse {
  results: ChangeResult[];
  savedAt: string;
  status: AttemptStatus;
  timer: TimerState;
  counts: AttemptCounts;
}

export interface SubmitResponse {
  status: AttemptStatus;
  autoSubmitted: boolean;
  submittedAt: string | null;
  counts: AttemptCounts;
  unanswered: number;
}

export interface InProgressAttempt {
  id: string;
  kind: 'FULL' | 'PRACTICE';
  startedAt: string;
  mockTest: { slug: string; title: string; countryCode: string };
  total: number;
  answered: number;
  remainingSeconds: number;
}

// ───────────────────────── Results and review

export interface TopicResultDto {
  topicId: string;
  name: string;
  correct: number;
  total: number;
  marks: number;
  marksAvailable: number;
  percent: number;
  weak: boolean;
}

export interface ReviewFirstItem {
  number: number;
  questionId: string;
  stem: string;
  topic: string;
  yourAnswer: string[] | null;
  correctAnswer: string[];
}

export interface ResultResponse {
  attempt: {
    id: string;
    kind: 'FULL' | 'PRACTICE';
    status: AttemptStatus;
    autoSubmitted: boolean;
    startedAt: string;
    submittedAt: string | null;
    timeSpentSeconds: number | null;
  };
  mockTest: { slug: string; title: string; countryCode: string; isFree: boolean };
  score: { marks: number; totalMarks: number; percent: number };
  counts: { total: number; correct: number; incorrect: number; unanswered: number };
  passMark: null | { percent: number; source: string };
  noOfficialPassMark: boolean;
  comparison: null | {
    previousAttemptId: string;
    previousPercent: number | null;
    previousSubmittedAt: string | null;
    deltaPoints: number | null;
    previousTimeSpentSeconds: number | null;
  };
  history: { attemptId: string; submittedAt: string | null; percent: number | null; current: boolean }[];
  topics: TopicResultDto[];
  weakestTopic: null | { topicId: string; name: string; percent: number };
  reviewFirst: ReviewFirstItem[];
  incorrectCount: number;
  isGuest: boolean;
  /** The candidate's optional feedback on this exam, once sent. */
  feedback?: { rating: number; comment: string | null } | null;
  canPractice: boolean;
  edge?: { noneAnswered: boolean; perfect: boolean; noWeakAreas: boolean; allTopicsStrong: boolean };
}

export type ReviewFilter = 'incorrect' | 'flagged' | 'unanswered' | 'all';
export type ReviewStatus = 'correct' | 'incorrect' | 'partial' | 'unanswered';

export interface ReviewItem {
  number: number;
  id: string;
  topic: string;
  type: string;
  multiple: boolean;
  status: ReviewStatus;
  flagged: boolean;
  stem: string;
  options: { key: string; text: string; isCorrect: boolean; isYourPick: boolean }[];
  yourAnswer: string[];
  marks: number;
  marksAwarded: number;
  explanation: string | null;
  caseId: string | null;
}

export interface ReviewResponse {
  attempt: { id: string; kind: 'FULL' | 'PRACTICE'; status: AttemptStatus };
  mockTest: { slug: string; title: string };
  filter: ReviewFilter;
  counts: { incorrect: number; flagged: number; unanswered: number; all: number };
  items: ReviewItem[];
  grid: { number: number; questionId: string; status: ReviewStatus; flagged: boolean }[];
  /** Case studies of the case-based questions, with the numbers of the questions that use each (C4). */
  cases?: ExamCase[];
  language?: LanguageServed;
}

// ───────────────────────── Dashboard

export interface DashboardResponse {
  user: { name: string; firstName: string };
  country: { code: string; name: string };
  goal: null | { categoryId: string; slug: string; name: string };
  resume: InProgressAttempt | null;
  /** Practice is untimed: there are no minutes. */
  recommended: null | { topicId: string; topicName: string; percent: number; questionCount: number; untimed: boolean };
  scoreHistory: { attemptId: string; submittedAt: string | null; percent: number | null; title: string }[];
  topics: {
    strong: { topicId: string; name: string; percent: number }[];
    needsWork: { topicId: string; name: string; percent: number }[];
  };
  recentlyCompleted: { attemptId: string; kind: 'FULL' | 'PRACTICE'; title: string; submittedAt: string | null; attemptNumber: number | null; percent: number | null }[];
  access: AccessSummary;
  hasActivity: boolean;
  /** A free test to start with; only for users who have not finished any attempt. */
  startHere: null | DashboardTestCard;
  suggestedTests: DashboardTestCard[];
  pendingPayment: null | { id: string; providerLabel: string; priceLabel: string; expiresAt: string };
  asOf: string;
}

export interface DashboardTestCard {
  slug: string;
  title: string;
  isFree: boolean;
  durationMinutes: number;
  questionCount: number;
}

// ───────────────────────── Checkout and payments

export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'DECLINED' | 'FAILED' | 'EXPIRED';

export interface CheckoutSummary {
  country: { code: string; name: string; dialCode: string; currencyCode: string };
  /** Access the user already has in this country (buying more adds days after it ends). */
  currentAccess: null | { endsAt: string; daysLeft: number; endingSoon: boolean };
  newAccessEndsAt: string | null;
  plan: null | {
    /** Which tier this summary is for. */
    code?: PlanKey;
    name: string;
    priceMinor: number | null;
    priceLabel: string | null;
    durationDays: number;
    paidOnce: boolean;
    checkoutAvailable: boolean;
    /** AI interview minutes included (0 for Full Access). */
    interviewMinutes?: number;
    /** UPGRADE = paying the difference for the current period (no extra days). */
    kind?: 'PURCHASE' | 'UPGRADE';
  };
  /** Interview tier only: the upgrade (difference, current period) and/or the full price (fresh 30 days). */
  interviewOptions?: null | {
    upgrade: null | { priceLabel: string | null; minutesExpireAt: string };
    full: { priceLabel: string | null; accessEndsAt: string; minutesExpireAt: string };
    showFull: boolean;
    selected: InterviewOption;
  };
  paymentMethods: { provider: string; label: string; hint: string | null }[];
  /** The payer number of the user's last payment, or null (accounts have no phone number). */
  prefillPhone: string | null;
}

export type PlanKey = 'full_access' | 'interview';
export type InterviewOption = 'upgrade' | 'new';

export interface PaymentView {
  id: string;
  status: PaymentStatus;
  terminal: boolean;
  provider: string;
  providerLabel: string;
  msisdn: string;
  amountMinor: number;
  priceLabel: string;
  currencyCode: string;
  createdAt: string;
  expiresAt: string;
  secondsLeft: number;
  message: string;
  notCharged: boolean;
  approvalHint: string;
  transactionId: string | null;
  confirmedAt: string | null;
  access: null | { startsAt: string; endsAt: string; daysLeft: number; countryCode: string };
  canSendAgain: boolean;
  canRetry: boolean;
}

// ───────────────────────── Practice

export interface PracticeStartResponse {
  attemptId: string;
  guestToken: string | null;
  questionCount: number;
  untimed: boolean;
  topics: { topicId: string; name: string; percent?: number }[];
}

export interface PracticeCheckResponse {
  questionId: string;
  state: 'correct' | 'incorrect' | 'partial' | 'unanswered';
  correct: string[];
  yourAnswer: string[];
  explanation: string | null;
}

// ───────────────────────── Added by the missing-designs pass (docs/API_ADDITIONS.md)

export interface ExamRequestResponse {
  ok: true;
  alreadyRequested: boolean;
  requestCount?: number;
}

export interface WaitingListResponse {
  ok: true;
  alreadyOnList: boolean;
}

export type LegalSlug = 'terms' | 'privacy' | 'refund' | 'cookies';

export interface LegalIndexEntry {
  slug: LegalSlug;
  title: string;
  lastUpdated: string | null;
  placeholder: boolean;
}

export interface LegalPageDto {
  slug: LegalSlug;
  title: string;
  lastUpdated: string | null;
  /** True while the text is a placeholder written by engineering, not reviewed legal text. */
  placeholder: boolean;
  intro: string;
  sections: { id: string; heading: string; paragraphs: string[] }[];
  country: { code: string; name: string; disclaimer: string | null } | null;
}

export interface StatusResponse {
  ok: true;
  maintenance: { enabled: boolean; message: string | null; backAt: string | null };
}

export interface PaymentRow {
  id: string;
  createdAt: string;
  status: PaymentStatus;
  providerLabel: string;
  priceLabel: string;
  amountMinor: number;
  currencyCode: string;
  countryCode: string;
  transactionId: string | null;
  accessUntil: string | null;
  canCheck: boolean;
}

export interface PaymentHistory {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  payments: PaymentRow[];
}

export interface Receipt {
  number: string;
  issuedTo: { name: string; email: string };
  country: { code: string; name: string };
  plan: { name: string; durationDays: number };
  paidAt: string | null;
  accessStartsAt: string | null;
  accessEndsAt: string | null;
}

export interface PaymentDetail {
  payment: PaymentView;
  receipt: Receipt | null;
}

export interface ClaimOutcome {
  claimed: number;
  alreadyYours: number;
  otherCountry: number;
  belongsToSomeoneElse: number;
  unknown: number;
  attemptIds: string[];
  outcome: 'saved' | 'already_saved' | 'nothing_to_save';
}

export interface PatchMeInput {
  name?: string;
  goalCategoryId?: string | null;
  preferredExamId?: string | null;
  language?: string;
  level?: string | null;
  subject?: string | null;
  /** `YYYY-MM-DD` or null. */
  examDate?: string | null;
}
