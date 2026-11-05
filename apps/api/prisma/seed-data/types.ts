export interface QDef {
  topic: string;
  section: string;
  stem: string;
  options: string[];
  /** Index (single) or indexes (multiple select) of correct options. */
  correct: number | number[];
  explanation: string;
  marks?: number;
  scoring?: 'ALL_OR_NOTHING' | 'PARTIAL';
  /** Key into the test's `cases`. Makes the question CASE_BASED. */
  caseKey?: string;
}

export interface CaseDef {
  key: string;
  title: string;
  passage: string[];
  tables: { caption: string; rows: { label: string; value?: string; heading?: boolean }[] }[];
  notes: string[];
}

export interface TestDef {
  country: 'RW' | 'KE';
  category: string; // category slug
  profession: { slug: string; name: string };
  authority?: string; // authority shortName
  slug: string;
  title: string;
  summary: string;
  free: boolean;
  difficulty: 'FOUNDATION' | 'STANDARD' | 'CHALLENGING';
  minutes: number;
  sections: { name: string; label?: string }[];
  questions: QDef[];
  cases?: CaseDef[];
  instructions?: string[];
  /** Application deadline (ISO date, e.g. '2026-11-12') of the real job posting this mock targets. Omit for mocks not tied to a specific live posting. */
  jobDeadlineAt?: string;
}
