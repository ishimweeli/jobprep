import { api } from './client';
import type { Category, CountryDetail, CountrySummary, SupportContact, WaitingListResponse } from './types';

export const countriesKeys = {
  all: ['countries'] as const,
  detail: (code: string) => ['countries', code.toUpperCase()] as const,
  categories: (code: string) => ['countries', code.toUpperCase(), 'categories'] as const,
};

export const listCountries = () => api<{ countries: CountrySummary[] }>('/countries').then((r) => r.countries);
export const getCountry = (code: string) => api<CountryDetail>(`/countries/${code.toLowerCase()}`);
export const listCategories = (code: string) =>
  api<{ categories: Category[] }>(`/countries/${code.toLowerCase()}/categories`).then((r) => r.categories);
/** "Notify me when X opens". `interest` is the optional "What are you preparing for?". A repeat answers `alreadyOnList: true`. */
export const joinWaitingList = (code: string, input: { email: string; interest?: string }) =>
  api<WaitingListResponse>(`/countries/${code.toLowerCase()}/waiting-list`, { method: 'POST', body: input });

export const supportKeys = { country: (code: string) => ['countries', code.toUpperCase(), 'support'] as const };
export const getSupport = (code: string) => api<{ supportContact: SupportContact }>(`/countries/${code.toLowerCase()}/support`).then((r) => r.supportContact);
