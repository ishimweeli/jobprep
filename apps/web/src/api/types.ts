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
