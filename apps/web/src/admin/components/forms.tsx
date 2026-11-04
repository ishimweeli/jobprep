import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../lib/cx';

/*
 * Labelled form fields in the admin's look: 44px controls, 10px radius, the input border, a 2px red border and a
 * message under the field when it is wrong. Every control has a visible label; the hint and the error are tied to it
 * with aria-describedby. Not designed (A18); built from the existing editor's classes.
 */

export const CONTROL = 'h-11 w-full rounded-[10px] border bg-white px-3 text-[15px] font-normal text-ink disabled:bg-soft disabled:text-muted';
export const AREA = 'w-full resize-y rounded-[10px] border bg-white px-3 py-2.5 text-[15px] font-normal leading-normal text-ink disabled:bg-soft disabled:text-muted';
export const edge = (invalid: boolean) => (invalid ? 'border-2 border-incorrect' : 'border-input-border');

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Shows "(optional)" after the label. */
  optional?: boolean;
  className?: string;
}

interface Aria { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }

/** The label, the control (via render prop) and the hint / error line under it. */
export function Field({ label, hint, error, optional, className, children }: FieldProps & { children: (aria: Aria) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const described = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children({ id, 'aria-describedby': described, 'aria-invalid': error ? true : undefined })}
      {hint && <span id={hintId} className="text-[13px] text-muted">{hint}</span>}
      {error && <span id={errId} className="text-[13px] font-semibold text-incorrect">{error}</span>}
    </div>
  );
}

export function TextField({ label, hint, error, optional, className, inputClassName, ...rest }: FieldProps & { inputClassName?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {(aria) => <input {...aria} {...rest} className={cx(CONTROL, edge(!!error), inputClassName)} />}
    </Field>
  );
}

export function TextAreaField({ label, hint, error, optional, className, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {(aria) => <textarea {...aria} {...rest} className={cx(AREA, edge(!!error))} />}
    </Field>
  );
}

export function SelectField({ label, hint, error, optional, className, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {(aria) => <select {...aria} {...rest} className={cx(CONTROL, edge(!!error))}>{children}</select>}
    </Field>
  );
}

/** A checkbox with its label to the right, a 44px tall row. */
export function CheckField({ label, hint, className, ...rest }: { label: ReactNode; hint?: ReactNode; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-0.5', className)}>
      <label htmlFor={id} className="flex min-h-11 items-center gap-2.5 text-[15px] text-ink">
        <input id={id} type="checkbox" {...rest} aria-describedby={hint ? `${id}-hint` : undefined} className="h-5 w-5 flex-none accent-brand" />
        {label}
      </label>
      {hint && <span id={`${id}-hint`} className="pl-[30px] text-[13px] text-muted">{hint}</span>}
    </div>
  );
}

/** A group of related controls with a visible legend (radio sets, option lists). */
export function FieldGroup({ legend, hint, children, className }: { legend: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx('m-0 flex flex-col gap-2 border-0 p-0', className)}>
      <legend className="mb-1 p-0 text-sm font-semibold text-ink">{legend}</legend>
      {hint && <p className="m-0 text-[13px] text-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}
