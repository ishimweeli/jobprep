import { ArrowLeft, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigationType, useSearchParams } from 'react-router-dom';
import type { CatalogFacets, JobCatalogResponse } from '../../api/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Dialog } from '../../components/Dialog';
import { EmptyState, QueryError, SkeletonList } from '../../components/states';
import { useSession } from '../auth/session';
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
import { hasPushedThisSession } from '../../lib/navigationHistory';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { FilterPanel, SORT_OPTIONS } from './FilterPanel';
import { JobResultCard } from './JobResultCard';
import { useJobCatalog } from './jobQueries';
import { CATALOG_PAGE_SIZE } from './queries';
import { RequestExamDialog } from './RequestExamDialog';
import { usePreferredJobSlug } from './usePreferredJob';

/** Exam discovery, job-first: one card per job, each linking to its own page with every mock test under it. */
export function CatalogPage() {
  const slug = useActiveCountrySlug();
  const { user, isLoading: sessionLoading } = useSession();
  const { slug: preferredSlug, isLoading: preferredLoading } = usePreferredJobSlug();
  const navigationType = useNavigationType();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const [qInput, setQInput] = useState(filters.q);
  const [sheet, setSheet] = useState(false);
  const catalog = useJobCatalog(slug, filters);
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

  // A saved job (server-side for a signed-in user, localStorage for a guest) opens straight to its page;
  // "Change job" there is what brings someone back here. See `usePreferredJob.ts`. Browser Back out of that
  // job page is also a POP landing here, so it's excluded too — otherwise Back would just bounce right back.
  const isBackNavigation = navigationType === 'POP' && hasPushedThisSession();
  if (user && (sessionLoading || preferredLoading)) return <SkeletonList count={2} label="Loading…" />;
  if (preferredSlug && !isBackNavigation) return <Navigate to={countryPath(slug, 'tests', 'jobs', preferredSlug)} replace />;

  return (
    <div>
      {/* Phone header: back, title, search + Filters, category chips */}
      <header className="sticky top-0 z-20 flex flex-col gap-2.5 border-b border-border bg-surface px-4 pb-3 pt-2 md:hidden">
        {!user && (
          <div className="flex items-center gap-1">
            <Link to={countryPath(slug)} aria-label="Back to home" className="-ml-3 inline-flex h-11 w-11 items-center justify-center text-ink no-underline hover:text-ink">
              <ArrowLeft size={22} aria-hidden="true" />
            </Link>
            <h1 className="m-0 text-[19px] font-bold">Find your mock test</h1>
          </div>
        )}
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
          <h1 className="m-0 text-2xl font-bold tracking-[-0.02em] text-heading dark:text-night-heading">Find your mock test</h1>
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
          <aside aria-label="Filters" className="hidden min-w-0 max-w-full flex-[1_1_240px] rounded-card border border-border bg-surface p-5 md:block dark:border-night-border dark:bg-night-surface">
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
                    <strong className="text-ink md:font-semibold">{plural(data.total, 'job')}</strong>
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
                  className="h-10 rounded-control border border-input-border bg-surface px-2.5 text-sm text-ink"
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
              paging={{ hasNextPage: !!catalog.hasNextPage, loadingMore: catalog.isFetchingNextPage, failed: catalog.nextPageFailed, onLoadMore: () => void catalog.fetchNextPage() }}
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
      {icon && <Search size={20} strokeWidth={2.2} className="pointer-events-none absolute left-4 top-3 text-muted" aria-hidden="true" />}
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
          compact ? 'h-12 px-3.5' : 'h-11 pl-[46px] pr-4',
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
  paging,
}: {
  slug: string;
  filters: CatalogFilters;
  data: JobCatalogResponse | undefined;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
  onClear: () => void;
  paging: { hasNextPage: boolean; loadingMore: boolean; failed: boolean; onLoadMore: () => void };
}) {
  const [requesting, setRequesting] = useState(false);
  if (!data) {
    return isError ? (
      <QueryError error={error} what="the jobs" onRetry={onRetry} retrying={isFetching} />
    ) : (
      <SkeletonList count={4} label="Loading jobs…" />
    );
  }
  if (data.empty) {
    const q = filters.q.trim();
    return (
      <EmptyState
        title={q ? `No jobs match “${q}” yet` : 'No jobs match these filters yet'}
        message={
          q
            ? 'Try a broader job title, or tell us which exam you are preparing for and we will notify you when it is added.'
            : 'Try removing a filter to see more jobs.'
        }
      >
        <div className="flex flex-col items-center gap-3">
          {data.canRequestExam && (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setRequesting(true)}
              className="min-h-touch cursor-pointer rounded-control border border-brand bg-surface px-[18px] text-[15px] font-semibold text-brand"
            >
              Request this exam
            </button>
          )}
          <Button variant={data.canRequestExam ? 'ghost' : 'secondary'} size="sm" onClick={onClear}>
            {q ? 'Clear search' : 'Clear filters'}
          </Button>
        </div>
        <RequestExamDialog open={requesting} onClose={() => setRequesting(false)} slug={slug} initialQuery={q} />
      </EmptyState>
    );
  }
  return (
    <>
      {isError && <QueryError error={error} what="the jobs" onRetry={onRetry} retrying={isFetching} />}
      <div className={cx('flex flex-col gap-3 md:gap-3.5', isFetching && 'opacity-60')} aria-busy={isFetching}>
        {data.results.map((j) => (
          <JobResultCard key={j.examId} slug={slug} job={j} />
        ))}
      </div>
      <LoadMore total={data.total} shown={data.results.length} paging={paging} itemLabel="job" />
    </>
  );
}

/** Load more, the loading-more state and the end of the list (C31; not drawn: the plainest controls in the existing style). */
export function LoadMore({
  total,
  shown,
  paging,
  itemLabel = 'mock test',
}: {
  total: number;
  shown: number;
  paging: { hasNextPage: boolean; loadingMore: boolean; failed: boolean; onLoadMore: () => void };
  itemLabel?: string;
}) {
  if (paging.hasNextPage || paging.loadingMore) {
    return (
      <div className="flex flex-col items-center gap-2.5 pt-1" data-testid="load-more">
        <p role="status" className="m-0 text-sm text-ink-2">
          {paging.loadingMore ? `Loading more ${itemLabel}s…` : `Showing ${shown} of ${total}`}
        </p>
        {paging.failed && !paging.loadingMore && (
          <p role="alert" className="m-0 text-sm font-semibold text-incorrect">
            We could not load more {itemLabel}s. Check your connection and try again.
          </p>
        )}
        <Button variant="secondary" size="lg" loading={paging.loadingMore} onClick={paging.onLoadMore}>
          {paging.failed ? 'Try again' : 'Load more'}
        </Button>
      </div>
    );
  }
  // One page only: nothing to say. More than one page loaded: the list ended.
  if (shown <= CATALOG_PAGE_SIZE) return null;
  return (
    <p className="m-0 pt-1 text-center text-sm text-ink-2" data-testid="end-of-list">
      That is all {total} {itemLabel}s.
    </p>
  );
}
