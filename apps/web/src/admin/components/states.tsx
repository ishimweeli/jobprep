import type { ReactNode } from 'react';
import { isApiError } from '../api/client';
import { cx } from '../lib/cx';

/*
 * Loading, empty and error states. Admin versions are not designed yet (MISSING_DESIGNS A18); these are the
 * plainest possible: grey bars without motion, one line of text, an alert with "Try again".
 */

export function Skeleton({ className, label = 'Loading…' }: { className?: string; label?: string }) {
  return (
    <div aria-busy="true" className={cx('flex flex-col gap-3 rounded-[14px] border border-border bg-white p-4', className)}>
      <span aria-hidden="true" className="block h-3 w-2/5 rounded-md bg-soft" />
      <span aria-hidden="true" className="block h-4 w-[85%] rounded-md bg-border" />
      <span aria-hidden="true" className="block h-3 w-3/5 rounded-md bg-soft" />
      <p role="status" className="m-0 text-sm text-muted">
        {label}
      </p>
    </div>
  );
}

export function ErrorBox({ error, onRetry, className, children }: { error?: unknown; onRetry?: () => void; className?: string; children?: ReactNode }) {
  const offline = isApiError(error) && error.isNetwork;
  return (
    <div role="alert" className={cx('flex flex-col items-start gap-2.5 rounded-[14px] border border-incorrect-line bg-incorrect-bg p-[18px]', className)}>
      <p className="m-0 text-base font-semibold text-incorrect">{offline ? 'You seem to be offline' : 'Something went wrong'}</p>
      <p className="m-0 text-[15px] text-incorrect">{offline ? 'Check your connection and try again.' : 'This could not be loaded. Try again in a moment.'}</p>
      {children}
      {onRetry && (
        <button type="button" onClick={onRetry} className="min-h-11 rounded-[10px] border border-incorrect-line bg-white px-4 text-[15px] font-semibold text-incorrect">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('m-0 p-7 text-center text-ink-2', className)}>{children}</p>;
}

/** A list or table while it loads (A18): rows of grey bars, announced once. `compact` for cards on a phone. */
export function TableSkeleton({ rows = 6, label = 'Loading…', className }: { rows?: number; label?: string; className?: string }) {
  return (
    <div aria-busy="true" className={cx('flex flex-col', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-4 border-t border-soft px-4 py-3.5 first:border-t-0">
          <span className="h-3 w-24 rounded-md bg-soft" />
          <span className="h-3.5 flex-1 rounded-md bg-border" />
          <span className="hidden h-3 w-20 rounded-md bg-soft min-[900px]:block" />
          <span className="h-5 w-16 rounded-full bg-soft" />
        </div>
      ))}
      <p role="status" className="m-0 px-4 pb-4 text-sm text-muted">{label}</p>
    </div>
  );
}

/** An empty list that says what to do next ("No payments match." and a way out). */
export function EmptyState({ title, hint, action, className }: { title: string; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center gap-2 p-7 text-center', className)}>
      <p className="m-0 text-base font-semibold text-ink">{title}</p>
      {hint && <p className="m-0 max-w-[420px] text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The editor's "Saving… / Saved / could not save" line (A18). Always in the page as a polite live region so a
 * screen reader hears the change; "idle" is empty. Text, never colour alone.
 */
export function SaveStatus({ state, savedText = 'Saved', errorText = 'Could not save. Your changes are still here.', className }: { state: SaveState; savedText?: string; errorText?: string; className?: string }) {
  const text = state === 'saving' ? 'Saving…' : state === 'saved' ? savedText : state === 'error' ? errorText : '';
  return (
    <p role={state === 'error' ? 'alert' : 'status'} className={cx('m-0 min-h-5 text-sm font-semibold', state === 'error' ? 'text-incorrect' : state === 'saved' ? 'text-correct' : 'text-muted', className)}>
      {text}
    </p>
  );
}
