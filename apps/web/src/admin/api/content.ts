import { api } from './client';
import type { CaseBody, CaseTable, ImportRowProblem, MockTestDetailFull } from './types';

/**
 * The content endpoints added by the missing-designs backend pass (docs/API_ADDITIONS.md): test lifecycle, section / category
 * reordering, case study translations, the CSV import with a column map. The older ones (create, patch, delete) are in admin.ts.
 */
const enc = encodeURIComponent;

export const contentKeys = {
  checklist: (id: string) => ['admin', 'checklist', id] as const,
  consequences: (id: string) => ['admin', 'consequences', id] as const,
  cases: (testId: string) => ['admin', 'cases', testId] as const,
  caseFull: (id: string) => ['admin', 'case-full', id] as const,
  importTemplate: ['admin', 'import-template'] as const,
  countryOptions: ['admin', 'country-options'] as const,
};

// ───────────────────────── Country options (the countries this admin may pick)
export interface CountryOption { code: string; name: string; status: string }
export const getCountryOptions = () => api<{ countries: CountryOption[] }>('/country-options').then((r) => r.countries);

// ───────────────────────── Test lifecycle (A9)
export interface ChecklistItemRow { key: string; label: string; ok: boolean; blocking: boolean; detail?: string }
export interface PublishChecklist { canPublish: boolean; items: ChecklistItemRow[] }
export const getChecklist = (id: string) => api<PublishChecklist>(`/mock-tests/${enc(id)}/checklist`);

export interface Consequences { attemptsInProgress: number; attemptsFinished: number; status: string }
export const getConsequences = (id: string) => api<Consequences>(`/mock-tests/${enc(id)}/consequences`);

export interface PublishResult { ok: true; status: 'PUBLISHED'; questions: number; warnings?: string[]; checklist?: PublishChecklist }
export const publishTest = (id: string) => api<PublishResult>(`/mock-tests/${enc(id)}/publish`, { method: 'POST' });
export const unpublishTest = (id: string, reason: string) => api<{ ok: true; status: 'DRAFT'; consequences: Consequences }>(`/mock-tests/${enc(id)}/unpublish`, { method: 'POST', body: { reason } });
export const restoreTest = (id: string) => api<{ ok: true; status: 'DRAFT' }>(`/mock-tests/${enc(id)}/restore`, { method: 'POST' });
export const duplicateTest = (id: string, title?: string) => api<{ id: string; slug: string; status: string; questions: number }>(`/mock-tests/${enc(id)}/duplicate`, { method: 'POST', body: title ? { title } : {} });

/** `GET /mock-tests/:id` with the fields the backend pass added (exam, profession, authority, attempts). */
export interface MockTestExtras {
  exam?: { id: string; name: string };
  profession?: { id: string; name: string };
  authority?: { id: string; shortName: string; name: string } | null;
  attemptCount?: number;
}
export type MockTestDetailEx = Omit<MockTestDetailFull, 'mockTest'> & { mockTest: MockTestDetailFull['mockTest'] & MockTestExtras };

export const reorderSections = (testId: string, ids: string[]) => api<{ ok: true }>(`/mock-tests/${enc(testId)}/sections/reorder`, { method: 'POST', body: { ids } });
export const reorderCategories = (countryCode: string, ids: string[]) => api<{ ok: true }>('/categories/reorder', { method: 'POST', body: { countryCode, ids } });

// ───────────────────────── Case studies (A8)
export interface CaseListRow { id: string; title: string; questions: number; translations: string[] }
export const getCasesList = (testId: string) => api<{ cases: CaseListRow[] }>(`/mock-tests/${enc(testId)}/cases`).then((r) => r.cases);

export interface CaseTranslation { language: string; title: string; passage: string[]; tables: CaseTable[]; notes: string[] }
export interface CaseFull {
  id: string; mockTestId: string; title: string; passage: string[]; tables: CaseTable[]; notes: string[]; questions: number;
  translations?: CaseTranslation[];
  attachedQuestions?: { id: string; number: number; stem: string }[];
}
export const getCaseFull = (id: string) => api<{ case: CaseFull }>(`/cases/${enc(id)}`).then((r) => r.case);
export const putCaseTranslation = (id: string, lang: string, body: Required<CaseBody>) => api<{ ok: true }>(`/cases/${enc(id)}/translations/${enc(lang)}`, { method: 'PUT', body });
export const deleteCaseTranslation = (id: string, lang: string) => api<{ ok: true }>(`/cases/${enc(id)}/translations/${enc(lang)}`, { method: 'DELETE' });
export const attachToCase = (id: string, questionIds: string[]) => api<{ ok: true }>(`/cases/${enc(id)}/attach`, { method: 'POST', body: { questionIds } });
export const detachFromCase = (id: string, questionIds: string[]) => api<{ ok: true }>(`/cases/${enc(id)}/detach`, { method: 'POST', body: { questionIds } });

// ───────────────────────── CSV import (A6)
export const IMPORT_COLUMNS = ['section', 'topic', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f', 'correct', 'explanation', 'marks', 'difficulty', 'scoring', 'choose'] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ColumnMap = Partial<Record<ImportColumn, string>>;

export interface ImportPreviewRow { row: number; section: string; topic: string; stem: string; options: { key: string; text: string }[]; correct: string[] }
export interface ImportReportBody {
  totalRows: number; validRows: number; invalidRows: number; problems: ImportRowProblem[];
  headers?: string[]; missingColumns?: string[]; preview?: ImportPreviewRow[]; errorCsv?: string;
}
export type ImportOutcome = ({ dryRun: true } & ImportReportBody) | ({ dryRun: false; created: number } & ImportReportBody);

export interface ImportBody { csv: string; dryRun?: boolean; importValidRows?: boolean; columnMap?: ColumnMap }
export const runImport = (testId: string, body: ImportBody) => api<ImportOutcome>(`/mock-tests/${enc(testId)}/import`, { method: 'POST', body });

export interface ImportTemplate { columns: { name: string; required: boolean; help: string }[]; csv: string }
export const getImportTemplate = () => api<ImportTemplate>('/import-template');

export const getMockTestEx = (id: string) => api<MockTestDetailEx>(`/mock-tests/${enc(id)}`);
