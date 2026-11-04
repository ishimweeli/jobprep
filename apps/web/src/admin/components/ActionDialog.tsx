import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { describeAdminError } from '../lib/apiErrors';
import { AdminDialog } from './AdminDialog';
import { TextAreaField } from './forms';
import { Btn } from './ui';

export const MIN_REASON = 5;
export const MAX_REASON = 300;

/** `null` when the reason is acceptable (the API wants 5 to 300 characters after trimming). */
export function reasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n === 0) return 'Write a reason. It is recorded in the audit log.';
  if (n < MIN_REASON) return `Write at least ${MIN_REASON} characters.`;
  if (n > MAX_REASON) return `Keep it to ${MAX_REASON} characters or fewer.`;
  return null;
}

export interface ActionDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** What will happen, in a sentence or two (the consequence, the summary). */
  children?: ReactNode;
  confirmLabel: string;
  /** Destructive actions confirm in red. */
  kind?: 'primary' | 'danger';
  /** Ask for a reason (default). `false` for a plain confirmation. */
  reason?: boolean;
  reasonLabel?: string;
  reasonHint?: ReactNode;
  /** Extra form fields shown above the reason (they are part of the same form). */
  fields?: ReactNode;
  /** Extra validity of those fields; the button stays enabled and a press shows `fieldsError`. */
  fieldsOk?: boolean;
  fieldsError?: string | null;
  /** Runs on confirm. Throw (an ApiError) to keep the dialog open with the error shown. */
  submit: (reason: string) => Promise<unknown>;
  /** Runs after a successful submit, before the dialog closes (toast, refetch). */
  onDone?: () => void;
  /** Feature words for API error codes. */
  errors?: Record<string, string>;
  /** The note at the bottom. Default: it is recorded in the audit log. */
  note?: ReactNode | null;
  wide?: boolean;
}

/**
 * The one confirmation dialog of the admin: a title, what will happen, optional fields, a required reason and two
 * buttons (Cancel, and the confirm in the action's style). It labels every field, closes with Esc, shows the API's
 * refusal in words inside the dialog and keeps what was typed. Used for access, suspend, manual grant, country and
 * team changes, deletes. Not designed (A18).
 */
export function ActionDialog({
  open, onClose, title, children, confirmLabel, kind = 'primary', reason: askReason = true, reasonLabel = 'Reason', reasonHint,
  fields, fieldsOk = true, fieldsError, submit, onDone, errors, note, wide,
}: ActionDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setTried(false);
    }
  }, [open]);

  const problem = askReason ? reasonProblem(reason) : null;
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    if (problem || !fieldsOk) return;
    setBusy(true);
    setError(null);
    try {
      await submit(reason.trim());
      if (!alive.current) return;
      setBusy(false);
      onDone?.();
      onClose();
    } catch (err) {
      if (!alive.current) return;
      setBusy(false);
      setError(describeAdminError(err, errors));
    }
  };

  const footnote = note === undefined ? (askReason ? 'This is recorded in the audit log with your name and the reason.' : null) : note;
  return (
    <AdminDialog open={open} onClose={() => !busy && onClose()} title={title} wide={wide}>
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
        {children && <div className="flex flex-col gap-2 text-[15px] text-ink-2">{children}</div>}
        {fields}
        {tried && !fieldsOk && fieldsError && <p role="alert" className="m-0 text-[13px] font-semibold text-incorrect">{fieldsError}</p>}
        {askReason && (
          <TextAreaField
            label={reasonLabel}
            hint={reasonHint}
            rows={3}
            maxLength={MAX_REASON + 50}
            value={reason}
            error={tried ? problem : null}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {error && (
          <div role="alert" className="rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">
            {error}
          </div>
        )}
        {footnote && <p className="m-0 text-xs text-muted">{footnote}</p>}
        <div className="flex flex-col-reverse gap-2 min-[520px]:flex-row min-[520px]:justify-end">
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn type="submit" kind={kind === 'danger' ? 'danger-solid' : 'primary'} busy={busy}>{busy ? 'Working…' : confirmLabel}</Btn>
        </div>
      </form>
    </AdminDialog>
  );
}
