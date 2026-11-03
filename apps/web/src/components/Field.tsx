import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Hide the visible label but keep it for assistive tech (e.g. a search box with its own icon). */
  hideLabel?: boolean;
  leading?: ReactNode;
  wrapperClassName?: string;
}

/** Label + input + hint + error wired with ids (aria-describedby / aria-invalid). */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, hideLabel, leading, className, wrapperClassName, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('flex flex-col gap-1.5', wrapperClassName)}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'text-sm font-semibold'}>
        {label}
      </label>
      <div className="flex gap-2">
        {leading}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            'h-[48px] min-w-0 md:h-[44px] flex-1 rounded-control border bg-surface px-3.5 text-[17px] text-ink placeholder:text-muted',
            error ? 'border-incorrect' : 'border-input-border',
            className,
          )}
          {...rest}
        />
      </div>
      {hint && (
        <p id={hintId} className="m-0 text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="m-0 text-sm font-semibold text-incorrect">
          {error}
        </p>
      )}
    </div>
  );
});
