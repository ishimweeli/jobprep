import { api } from './client';
import type { Category, CountryDetail, CountrySummary } from './types';

export const countriesKeys = {
  all: ['countries'] as const,
  detail: (code: string) => ['countries', code.toUpperCase()] as const,
  categories: (code: string) => ['countries', code.toUpperCase(), 'categories'] as const,
};

export const listCountries = () => api<{ countries: CountrySummary[] }>('/countries').then((r) => r.countries);
export const getCountry = (code: string) => api<CountryDetail>(`/countries/${code.toLowerCase()}`);
export const listCategories = (code: string) =>
  api<{ categories: Category[] }>(`/countries/${code.toLowerCase()}/categories`).then((r) => r.categories);
export const joinWaitingList = (code: string, email: string) =>
  api<{ ok: true }>(`/countries/${code.toLowerCase()}/waiting-list`, { method: 'POST', body: { email } });
