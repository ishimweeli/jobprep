import type { CatalogQuery } from '../api/catalog';

/** Catalog filters live in the query string: q, category, price, difficulty, language, subject, sort, page. */
export interface CatalogFilters {
  q: string;
  category: string;
  price: '' | 'free' | 'paid';
  difficulty: '' | 'FOUNDATION' | 'STANDARD' | 'CHALLENGING';
  language: string;
  subject: string;
  sort: '' | 'recent' | 'title';
  page: number;
}

export const EMPTY_FILTERS: CatalogFilters = {
  q: '',
  category: '',
  price: '',
  difficulty: '',
  language: '',
  subject: '',
  sort: '',
  page: 1,
};

const DIFFICULTIES = ['FOUNDATION', 'STANDARD', 'CHALLENGING'] as const;
const SORTS = ['recent', 'title'] as const;

/** Parse URLSearchParams defensively: unknown or malformed values fall back to "no filter". */
export function parseFilters(params: URLSearchParams): CatalogFilters {
  const price = params.get('price');
  const difficulty = (params.get('difficulty') ?? '').toUpperCase();
  const sort = params.get('sort');
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    category: params.get('category') ?? '',
    price: price === 'free' || price === 'paid' ? price : '',
    difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty) ? (difficulty as CatalogFilters['difficulty']) : '',
    language: params.get('language') ?? '',
    subject: params.get('subject') ?? '',
    sort: (SORTS as readonly string[]).includes(sort ?? '') ? (sort as CatalogFilters['sort']) : '',
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 500) : 1,
  };
}

/** Serialise only non-default values, so URLs stay short and shareable. */
export function filtersToSearchParams(f: Partial<CatalogFilters>): URLSearchParams {
  const p = new URLSearchParams();
  const q = f.q?.trim();
  if (q) p.set('q', q);
  if (f.category) p.set('category', f.category);
  if (f.price) p.set('price', f.price);
  if (f.difficulty) p.set('difficulty', f.difficulty);
  if (f.language) p.set('language', f.language);
  if (f.subject) p.set('subject', f.subject);
  if (f.sort) p.set('sort', f.sort);
  if (f.page && f.page > 1) p.set('page', String(f.page));
  return p;
}

export function toApiQuery(f: CatalogFilters): CatalogQuery {
  return {
    q: f.q.trim() || undefined,
    category: f.category || undefined,
    price: f.price || undefined,
    difficulty: f.difficulty || undefined,
    language: f.language || undefined,
    subject: f.subject || undefined,
    sort: f.sort || undefined,
    page: f.page > 1 ? f.page : undefined,
  };
}

/** Number of "sheet" filters currently on (price, difficulty, language, subject) — the phone "Filters (n)" badge. */
export function activeSheetFilterCount(f: CatalogFilters): number {
  return [f.price, f.difficulty, f.language, f.subject].filter(Boolean).length;
}

/** Changing any filter (other than page) returns to page 1. */
export function applyFilterChange(current: CatalogFilters, patch: Partial<CatalogFilters>): CatalogFilters {
  const next = { ...current, ...patch };
  if (!('page' in patch)) next.page = 1;
  return next;
}
