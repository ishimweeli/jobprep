import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { requestExam } from '../../api/catalog';
import { Button, buttonClasses } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { authErrorMessage } from '../../lib/errorCopy';
import { useSession } from '../auth/session';
import { countryPath } from '../country/hooks';
import { requestBody, requestDone, validateRequest, type RequestDone, type RequestFormErrors } from './requestExamModel';

/**
 * "Request this exam" (C10): a dialog on desktop and a bottom sheet on phone (the shared `Dialog`, variant `responsive`).
 * Shows what was searched (editable), an optional email (prefilled for signed-in people), then success or an error with
 * "Try again". Not drawn: built with the existing form, button and dialog styles.
 */
export function RequestExamDialog({ open, onClose, slug, initialQuery }: { open: boolean; onClose: () => void; slug: string; initialQuery: string }) {
  const { user } = useSession();
  const [query, setQuery] = useState(initialQuery);
  const [email, setEmail] = useState(user?.email ?? '');
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [done, setDone] = useState<RequestDone | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const doneBtn = useRef<HTMLButtonElement>(null);

  // Reopened for another search: start clean.
  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setEmail(user?.email ?? '');
    setErrors({});
    setDone(null);
    setServerError(null);
  }, [open, initialQuery, user?.email]);

  // The form is replaced by the confirmation: keep the keyboard inside the dialog (Esc must still close it).
  useEffect(() => {
    if (done) doneBtn.current?.focus();
  }, [done]);

  const send = useMutation({
    mutationFn: () => requestExam(slug, requestBody({ query, email })),
    onSuccess: (r) => setDone(requestDone(r, !!email.trim() || !!user)),
    onError: (e) => setServerError(authErrorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const found = validateRequest({ query, email });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    send.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title={done ? done.title : 'Request this exam'} initialFocusRef={first} desktopPanelClassName="md:max-w-[480px] md:rounded-[20px] md:p-6">
      {done ? (
        <div className="flex flex-col gap-4" data-testid="request-done">
          <p role="status" className="m-0 text-base leading-[1.55] text-ink-2">
            {done.body}
          </p>
          <div className="flex flex-col gap-2 md:flex-row-reverse">
            <Button ref={doneBtn} variant="primary" size="lg" onClick={onClose}>
              Done
            </Button>
            <Link to={countryPath(slug, 'tests')} onClick={onClose} className={buttonClasses({ variant: 'neutral', size: 'lg' })}>
              Browse all mock tests
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="m-0 text-[15px] leading-normal text-ink-2">Tell us which exam you are preparing for. We add the tests people ask for most.</p>
          <Field
            ref={first}
            label="Job or exam"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Veterinary officer"
            maxLength={120}
            autoComplete="off"
            error={errors.query}
          />
          <Field
            label="Email (optional)"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            hint="Only used to tell you when this test is added."
            error={errors.email}
          />
          {serverError && (
            <p role="alert" className="m-0 rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-[15px] font-semibold text-incorrect">
              {serverError}
            </p>
          )}
          <div className="flex flex-col gap-2 md:flex-row-reverse">
            <Button type="submit" variant="primary" size="lg" loading={send.isPending}>
              {serverError ? 'Try again' : 'Send request'}
            </Button>
            <Button variant="neutral" size="lg" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
