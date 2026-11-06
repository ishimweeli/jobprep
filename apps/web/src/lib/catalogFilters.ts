import type { CatalogQuery } from '../api/catalog';

/** Catalog filters live in the query string: q, category, price, difficulty, language, subject, sort, page. */
export interface CatalogFilters {
  q: string;
  category: string;
  price: '' | 'free' | 'paid';
  difficulty: '' | 'FOUNDATION' | 'STANDARD' | 'CHALLENGING';
  language: string;
  subject: string;
  sort: '' | 'recent' | 'title' | 'free_first' | 'deadline';
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
const SORTS = ['recent', 'title', 'free_first', 'deadline'] as const;

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

/** Number of "sheet" filters currently on (price, difficulty, language, subject, sort) — the phone "Filters (n)" badge. */
export function activeSheetFilterCount(f: CatalogFilters): number {
  return [f.price, f.difficulty, f.language, f.subject, f.sort].filter(Boolean).length;
}

/** The page numbers to draw: all of them when few, else the first, the last and the current page's neighbours. `null` marks a gap ("…"). */
export function pageItems(current: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = [...new Set([1, current - 1, current, current + 1, totalPages])].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1]! > 1 ? [null, p] : [p]));
}

/** Changing any filter (other than page) returns to page 1. */
export function applyFilterChange(current: CatalogFilters, patch: Partial<CatalogFilters>): CatalogFilters {
  const next = { ...current, ...patch };
  if (!('page' in patch)) next.page = 1;
  return next;
}
