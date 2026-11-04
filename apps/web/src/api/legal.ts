import { api } from './client';
import type { LegalIndexEntry, LegalPageDto, LegalSlug, StatusResponse } from './types';

export const legalKeys = {
  index: ['legal'] as const,
  page: (slug: LegalSlug, country: string | null) => ['legal', slug, country ?? '*'] as const,
  status: ['status'] as const,
};

export const listLegal = () => api<{ pages: LegalIndexEntry[] }>('/legal').then((r) => r.pages);
/** `country` (code) picks the country's own text when an admin entered one. */
export const getLegalPage = (slug: LegalSlug, country?: string | null) =>
  api<LegalPageDto>(`/legal/${slug}`, { query: { country: country ? country.toUpperCase() : undefined } });
export const getStatus = () => api<StatusResponse>('/status');
