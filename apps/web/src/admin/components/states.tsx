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
