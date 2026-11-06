import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageItems } from '../../lib/catalogFilters';
import { cx } from '../../lib/cx';

const control = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control border text-sm font-semibold md:min-h-9 md:min-w-9';
const idle = 'cursor-pointer border-border-strong bg-surface text-ink hover:bg-soft disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface';

/** "Showing 8–14 of 22 jobs" with Previous, page numbers and Next. Draws nothing when everything fits on one page. */
export function Pagination({ page, pageSize, total, itemLabel, onPage }: { page: number; pageSize: number; total: number; itemLabel: string; onPage: (page: number) => void }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Result pages" data-testid="pagination" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
      <p className="m-0 text-[13px] text-ink-2">
        Showing {from}–{to} of {total} {itemLabel}s
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cx(control, idle, 'gap-1 px-2.5')}>
          <ChevronLeft size={16} aria-hidden="true" />
          <span className="max-sm:sr-only">Previous</span>
        </button>
        {pageItems(page, totalPages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-sm text-muted">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
              className={cx(control, p === page ? 'border-brand bg-brand text-white' : idle)}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className={cx(control, idle, 'gap-1 px-2.5')}>
          <span className="max-sm:sr-only">Next</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
