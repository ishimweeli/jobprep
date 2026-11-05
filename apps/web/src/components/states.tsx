import type { ReactNode } from 'react';
import { isApiError } from '../api/client';
import { SystemPageBody } from '../features/system/SystemPage';
import { isServerError } from '../features/system/systemModel';
import { cx } from '../lib/cx';
import { Button } from './Button';

/* Shared system states (design: States.dc.html) — loading skeletons, empty, error with retry. */

/** A subtle pulse, not a shimmer sweep — simpler, and `motion-safe:` keeps it off entirely for reduced-motion users. */
export function SkeletonBar({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('block rounded-md bg-soft motion-safe:animate-pulse dark:bg-night-soft', className)} />;
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cx('flex flex-col gap-2.5 rounded-tiles border border-border bg-surface p-4 dark:border-night-border dark:bg-night-surface', className)}>
      <SkeletonBar className="h-3 w-2/5" />
      <SkeletonBar className="h-4 w-[85%] bg-border dark:bg-night-border" />
      <SkeletonBar className="h-3 w-3/5" />
    </div>
  );
}

export function SkeletonList({ count = 3, label = 'Loading…', className }: { count?: number; label?: string; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-3', className)} data-testid="skeleton-list">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
      <p role="status" className="m-0 text-sm text-muted">
        {label}
      </p>
    </div>
  );
}

interface EmptyStateProps {
  title: ReactNode;
  message?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({ title, message, children, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center gap-2.5 rounded-card border border-dashed border-input-border bg-surface px-4 py-6 text-center md:px-6 md:py-10',
        className,
      )}
    >
      <p className="m-0 text-base font-semibold md:text-[17px]">{title}</p>
      {message && <p className="m-0 max-w-[34em] text-sm text-ink-2 md:text-[15px]">{message}</p>}
      {children}
    </div>
  );
}

interface ErrorStateProps {
  title?: ReactNode;
  message?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  children?: ReactNode;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Check your internet connection and try again. Your saved progress is safe.',
  onRetry,
  retrying,
  className,
  children,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cx('flex flex-col gap-2.5 rounded-[14px] border border-incorrect-line bg-incorrect-bg p-[18px]', className)}>
      <p className="m-0 text-base font-semibold text-incorrect">{title}</p>
      <p className="m-0 text-[15px] text-incorrect">{message}</p>
      {children}
      {onRetry && (
        <Button variant="final" size="sm" className="self-start font-semibold" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * A failed query uses the designed error state (States.dc: "We could not load the mock tests" + Try again).
 * A 403 country_mismatch is handled by the country layout ("This test is for Kenya") and shows nothing here.
 * A server error (5xx) is the "Something went wrong on our side" page with its Reference (SystemPages.dc).
 */
export function QueryError({ error, what, onRetry, retrying }: { error: unknown; what: string; onRetry: () => void; retrying?: boolean }) {
  if (isApiError(error) && error.code === 'country_mismatch') return null;
  if (isApiError(error) && isServerError(error.status)) {
    return <SystemPageBody inline kind="error" reference={error.requestId} cta={{ onClick: onRetry }} alt={{ to: '/' }} />;
  }
  return <ErrorState title={`We could not load ${what}`} onRetry={onRetry} retrying={retrying} />;
}
