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
}

export interface Landing {
  country: { code: string; name: string; disclaimer: string | null; languages: string[] };
  popularSearches: string[];
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
  pricing: null | {
    priceLabel: string | null;
    durationDays: number | null;
    checkoutAvailable: boolean;
    paymentMethods: string[];
  };
  freeSample: null | { slug: string; title: string; questionCount: number };
  previousAttempts: PreviousAttempt[];
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
  paymentMethods: { provider: string; label: string; hint: string | null }[];
}

export interface PublicUser {
  id: string;
  name: string;
  phone: string;
  countryCode: string;
  goalCategoryId: string | null;
  language: string;
}

export interface MeResponse {
  user: PublicUser;
  country: { code: string; name: string; currencyCode: string; languages: string[] };
  access: {
    current: null | { endsAt: string; daysLeft: number };
    otherCountries: { countryCode: string; endsAt: string; daysLeft: number }[];
  };
}

export interface OtpRequestResponse {
  cooldownSeconds: number;
  expiresInSeconds: number;
}

export interface AuthResponse {
  user: PublicUser;
  claimedAttempts: number;
}

export interface CountryChangePreview {
  from: { code: string; name: string };
  to: {
    code: string;
    name: string;
    status: CountryStatus;
    selectable: boolean;
    currencyCode: string;
    paymentMethods: string[];
  };
  currentAccess: null | { endsAt: string; daysLeft: number };
  keepsResults: boolean;
}

// ───────────────────────── Exam engine (apps/api/src/routes/attempts.ts)

export interface TimerState {
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
  error?: 'unknown_question' | 'invalid_option' | 'after_deadline';
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
  canPractice: boolean;
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
}

// ───────────────────────── Dashboard

export interface DashboardResponse {
  user: { name: string; firstName: string };
  country: { code: string; name: string };
  goal: null | { categoryId: string; slug: string; name: string };
  resume: InProgressAttempt | null;
  recommended: null | { topicId: string; topicName: string; percent: number; questionCount: number; minutes: number };
  scoreHistory: { attemptId: string; submittedAt: string | null; percent: number | null; title: string }[];
  topics: {
    strong: { topicId: string; name: string; percent: number }[];
    needsWork: { topicId: string; name: string; percent: number }[];
  };
  recentlyCompleted: { attemptId: string; kind: 'FULL' | 'PRACTICE'; title: string; submittedAt: string | null; attemptNumber: number | null; percent: number | null }[];
  access: MeResponse['access'];
  hasActivity: boolean;
  asOf: string;
}

// ───────────────────────── Checkout and payments

export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'DECLINED' | 'FAILED' | 'EXPIRED';

export interface CheckoutSummary {
  country: { code: string; name: string; dialCode: string; currencyCode: string };
  plan: null | {
    name: string;
    priceMinor: number | null;
    priceLabel: string | null;
    durationDays: number;
    paidOnce: boolean;
    checkoutAvailable: boolean;
  };
  paymentMethods: { provider: string; label: string; hint: string | null }[];
  prefillPhone: string;
}

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
