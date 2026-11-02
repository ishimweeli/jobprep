import { ArrowLeft, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CatalogFacets, CatalogResponse } from '../../api/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Dialog } from '../../components/Dialog';
import { EmptyState, QueryError, SkeletonList } from '../../components/states';
import {
  activeSheetFilterCount,
  applyFilterChange,
  EMPTY_FILTERS,
  filtersToSearchParams,
  parseFilters,
  type CatalogFilters,
} from '../../lib/catalogFilters';
import { cx } from '../../lib/cx';
import { plural } from '../../lib/format';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { FilterPanel } from './FilterPanel';
import { useCatalog } from './queries';
import { ResultCard } from './ResultCard';

const SORT_OPTIONS: { value: CatalogFilters['sort']; label: string }[] = [
  { value: '', label: 'Most relevant' },
  { value: 'recent', label: 'Newest' },
];

/** Exam discovery. All filters live in the query string (see lib/catalogFilters) so results are linkable. */
export function CatalogPage() {
  const slug = useActiveCountrySlug();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const [qInput, setQInput] = useState(filters.q);
  const [sheet, setSheet] = useState(false);
  const catalog = useCatalog(slug, filters);
  const data = catalog.data;

  const update = useCallback(
    (patch: Partial<CatalogFilters>, opts: { replace?: boolean } = {}) => {
      setParams(filtersToSearchParams(applyFilterChange(filters, patch)), { replace: opts.replace });
    },
    [filters, setParams],
  );

  // URL -> input (e.g. a popular-search link while already on this page).
  useEffect(() => {
    setQInput(filters.q);
  }, [filters.q]);

  // input -> URL, debounced, replacing history so back does not step through every keystroke.
  useEffect(() => {
    if (qInput.trim() === filters.q.trim()) return;
    const id = setTimeout(() => update({ q: qInput }, { replace: true }), 350);
    return () => clearTimeout(id);
  }, [qInput, filters.q, update]);

  // New page -> back to the top of the results.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [filters.page]);

  const commitSearch = () => update({ q: qInput }, { replace: true });
  const clearAll = () => {
    setQInput('');
    setParams(filtersToSearchParams(EMPTY_FILTERS));
  };
  const sheetCount = activeSheetFilterCount(filters);
  const catName = data?.facets.categories.find((c) => c.slug === filters.category)?.name;

  return (
    <div>
      {/* Phone header: back, title, search + Filters, category chips */}
      <header className="sticky top-0 z-20 flex flex-col gap-2.5 border-b border-border bg-surface px-4 pb-3 pt-2 md:hidden">
        <div className="flex items-center gap-1">
          <Link to={countryPath(slug)} aria-label="Back to home" className="-ml-3 inline-flex h-11 w-11 items-center justify-center text-ink no-underline hover:text-ink">
            <ArrowLeft size={22} aria-hidden="true" />
          </Link>
          <h1 className="m-0 text-[19px] font-bold">Find your mock test</h1>
        </div>
        <div role="search" className="flex gap-2">
          <SearchBox id="catalog-q-phone" value={qInput} onChange={setQInput} onSubmit={commitSearch} placeholder="Job title or subject" label="Search job title or subject" compact />
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-haspopup="dialog"
            className="inline-flex h-12 flex-none items-center gap-1.5 rounded-control border border-input-border bg-surface px-3.5 text-[15px] font-semibold text-ink"
          >
            <SlidersHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
            Filters{sheetCount > 0 ? ` (${sheetCount})` : ''}
          </button>
        </div>
        <CategoryChips filters={filters} facets={data?.facets} onPick={(c) => update({ category: c })} compact />
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 pb-6 pt-3.5 md:gap-[22px] md:px-6 md:pb-16 md:pt-7">
        {/* Desktop heading, search and chips */}
        <div className="hidden flex-col gap-1.5 md:flex">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link to={countryPath(slug)} className="text-muted underline hover:text-ink">
              Home
            </Link>{' '}
            › Mock tests
          </nav>
          <h1 className="m-0 text-[34px] font-bold tracking-tight">Find your mock test</h1>
        </div>
        <div role="search" className="hidden gap-2.5 md:flex">
          <SearchBox
            id="catalog-q"
            value={qInput}
            onChange={setQInput}
            onSubmit={commitSearch}
            placeholder="Search job title, subject or exam — e.g. Accountant"
            label="Search by job title, subject or exam"
            icon
          />
        </div>
        <div className="hidden md:block">
          <CategoryChips filters={filters} facets={data?.facets} onPick={(c) => update({ category: c })} />
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:flex-wrap md:items-start">
          <aside aria-label="Filters" className="hidden max-w-full flex-[1_1_240px] rounded-card border border-border bg-surface p-5 md:block">
            <FilterPanel filters={filters} facets={data?.facets} onChange={(p) => update(p)} variant="aside" idPrefix="f" />
          </aside>

          <section aria-labelledby="results-heading" className="flex min-w-0 flex-col gap-3.5 md:flex-[999_1_560px]">
            <h2 id="results-heading" className="sr-only">
              Search results
            </h2>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p aria-live="polite" className="m-0 text-sm font-semibold text-ink-2 md:text-[15px]" data-testid="result-count">
                {data ? (
                  <>
                    <strong className="text-ink md:font-bold">{plural(data.total, 'mock test')}</strong>
                    <span className="hidden md:inline"> {scopeText(filters, catName)}</span>
                  </>
                ) : (
                  <span>{catalog.isError ? '' : 'Loading…'}</span>
                )}
              </p>
              <label className="hidden items-center gap-2 text-sm text-ink-2 md:flex">
                Sort
                <select
                  value={filters.sort}
                  onChange={(e) => update({ sort: e.target.value as CatalogFilters['sort'] })}
                  className="h-10 rounded-[10px] border border-input-border bg-surface px-2.5 text-sm text-ink"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Results
              slug={slug}
              filters={filters}
              data={data}
              isError={catalog.isError}
              error={catalog.error}
              isFetching={catalog.isFetching}
              onRetry={() => void catalog.refetch()}
              onClear={clearAll}
            />

          </section>
        </div>
      </main>

      <Dialog
        open={sheet}
        onClose={() => setSheet(false)}
        title="Filters"
        variant="sheet"
        headerAction={
          <button
            type="button"
            onClick={() => setParams(filtersToSearchParams({ ...EMPTY_FILTERS, q: filters.q, category: filters.category }))}
            className="min-h-[44px] bg-transparent px-2 text-[15px] font-semibold text-brand"
          >
            Reset
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <FilterPanel filters={filters} facets={data?.facets} onChange={(p) => update(p, { replace: true })} variant="sheet" idPrefix="sheet" />
          <Button variant="primary" size="lg" block onClick={() => setSheet(false)} data-testid="show-results">
            Show {data?.total ?? 0} results
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function scopeText(f: CatalogFilters, categoryName: string | undefined): string {
  const parts: string[] = [];
  if (f.q.trim()) parts.push(`for “${f.q.trim()}”`);
  if (f.category) parts.push(`in ${categoryName ?? f.category}`);
  else if (!f.q.trim()) parts.push('in all categories');
  return parts.join(' ');
}

function SearchBox({
  id,
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  icon,
  compact,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  label: string;
  icon?: boolean;
  compact?: boolean;
}) {
  return (
    <form
      className="relative min-w-0 flex-1 md:flex-[1_1_420px]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {icon && <Search size={20} strokeWidth={2.2} className="pointer-events-none absolute left-4 top-4 text-muted" aria-hidden="true" />}
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        className={cx(
          'w-full rounded-control border border-input-border bg-surface text-base text-ink placeholder:text-muted',
          compact ? 'h-12 px-3.5' : 'h-[52px] pl-[46px] pr-4',
        )}
      />
    </form>
  );
}

function CategoryChips({
  filters,
  facets,
  onPick,
  compact,
}: {
  filters: CatalogFilters;
  facets: CatalogFacets | undefined;
  onPick: (slug: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Job category"
      className={cx(compact ? 'scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5' : 'flex flex-wrap gap-2')}
    >
      <Chip compact={compact} pressed={!filters.category} onClick={() => onPick('')}>
        All
      </Chip>
      {facets
        ? facets.categories.map((c) => (
            <Chip key={c.slug} compact={compact} pressed={filters.category === c.slug} onClick={() => onPick(c.slug)}>
              {c.name}
            </Chip>
          ))
        : null}
    </div>
  );
}

function Results({
  slug,
  filters,
  data,
  isError,
  error,
  isFetching,
  onRetry,
  onClear,
}: {
  slug: string;
  filters: CatalogFilters;
  data: CatalogResponse | undefined;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
  onClear: () => void;
}) {
  if (!data) {
    return isError ? (
      <QueryError error={error} what="the mock tests" onRetry={onRetry} retrying={isFetching} />
    ) : (
      <SkeletonList count={4} label="Loading mock tests…" />
    );
  }
  if (data.empty) {
    const q = filters.q.trim();
    return (
      <EmptyState
        title={q ? `No mock tests match “${q}” yet` : 'No mock tests match these filters yet'}
        message={
          q
            ? 'Try a broader job title, or tell us which exam you are preparing for and we will notify you when it is added.'
            : 'Try removing a filter to see more mock tests.'
        }
      >
        <div className="flex flex-col items-center gap-3">
          {data.canRequestExam && (
            // The request form is not designed: the button is drawn (States.dc) and inert.
            <button
              type="button"
              aria-disabled="true"
              className="min-h-touch cursor-default rounded-control border border-brand bg-surface px-[18px] text-[15px] font-semibold text-brand"
            >
              Request this exam
            </button>
          )}
          <Button variant={data.canRequestExam ? 'ghost' : 'secondary'} size="sm" onClick={onClear}>
            {q ? 'Clear search' : 'Clear filters'}
          </Button>
        </div>
      </EmptyState>
    );
  }
  return (
    <>
      {isError && <QueryError error={error} what="the mock tests" onRetry={onRetry} retrying={isFetching} />}
      <div className={cx('flex flex-col gap-3 md:gap-3.5', isFetching && 'opacity-60')} aria-busy={isFetching}>
        {data.results.map((t) => (
          <ResultCard key={t.id} slug={slug} test={t} />
        ))}
      </div>
    </>
  );
}
