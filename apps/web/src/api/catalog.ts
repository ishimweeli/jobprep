import { api } from './client';
import type { CatalogResponse, ExamDetail, ExamRequestResponse, Landing, PricingResponse } from './types';

export interface CatalogQuery {
  q?: string;
  category?: string;
  price?: 'free' | 'paid';
  difficulty?: string;
  language?: string;
  subject?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

const base = (country: string) => `/countries/${country.toLowerCase()}`;

export const catalogKeys = {
  landing: (c: string) => ['catalog', c, 'landing'] as const,
  list: (c: string, q: CatalogQuery) => ['catalog', c, 'list', q] as const,
  detail: (c: string, slug: string) => ['catalog', c, 'detail', slug] as const,
  pricing: (c: string) => ['catalog', c, 'pricing'] as const,
};

export const getLanding = (country: string) => api<Landing>(`${base(country)}/landing`);
export const listMockTests = (country: string, query: CatalogQuery) =>
  api<CatalogResponse>(`${base(country)}/mock-tests`, { query: { ...query } });
export const getMockTest = (country: string, slug: string) =>
  api<ExamDetail>(`${base(country)}/mock-tests/${encodeURIComponent(slug)}`);
export const getPricing = (country: string) => api<PricingResponse>(`${base(country)}/pricing`);
export const requestExam = (country: string, input: { query: string; email?: string }) =>
  api<ExamRequestResponse>(`${base(country)}/exam-requests`, { method: 'POST', body: input });
