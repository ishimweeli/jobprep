import type { ReactNode } from 'react';
import { isApiError } from '../api/client';
import { cx } from '../lib/cx';

/*
 * Loading, empty and error states. Admin versions are not designed yet (MISSING_DESIGNS A18); these are the
 * plainest possible: a spinner with one line of text while loading, an alert with "Try again" on error.
 */

export { Loader } from '../../components/Loader';

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
