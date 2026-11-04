import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { checkPayment, manualGrant } from '../../api/admin';
import type { PaymentStatus } from '../../api/types';
import { fetchPaymentsExport, saveFile, type ExportFile } from '../../api/users-payments';
import { ActionDialog } from '../../components/ActionDialog';
import { AdminDialog } from '../../components/AdminDialog';
import { SelectField, TextField } from '../../components/forms';
import { Btn } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { describeAdminError } from '../../lib/apiErrors';
import { allowedCountryCodes } from '../../lib/adminCountry';
import { cx } from '../../lib/cx';
import { countryName, formatCount, formatLocalPhone } from '../../lib/format';
import { useAdmin } from '../auth/session';
import { emptyExportForm, exportQuery, exportSummary, PROVIDER_OPTIONS, STATUS_OPTIONS, validateExport, type ExportForm } from './exportModel';
import { ageText, checkOutcome, PAYMENT_ERRORS, transactionIdProblem, type CheckOutcome, type GrantTarget } from './paymentsModel';

/** Everything the payments list and the payment page share: manual grant, the result of a check, the accounting export. */

const refreshPayments = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ['admin', 'payments'] });
  void qc.invalidateQueries({ queryKey: ['admin', 'payment'] });
  void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
  void qc.invalidateQueries({ queryKey: ['admin', 'user'] });
};

// ───────────────────────── Check status

export interface CheckResult { id: string; before: PaymentStatus; outcome: CheckOutcome }

/** "Check status": asks the operator now; the answer opens in a small dialog (`dialog`) and the lists refresh. */
export function useCheckPayment() {
  const qc = useQueryClient();
  const toast = useToast();
  const [result, setResult] = useState<CheckResult | null>(null);
  const m = useMutation({
    mutationFn: ({ id }: { id: string; status: PaymentStatus }) => checkPayment(id),
    onSuccess: (r, { id, status }) => {
      setResult({ id, before: status, outcome: checkOutcome(status, r.status) });
      refreshPayments(qc);
    },
    onError: (e) => toast({ tone: 'error', text: describeAdminError(e, PAYMENT_ERRORS) }),
  });
  const dialog = (
    <AdminDialog open={!!result} onClose={() => setResult(null)} title="Result of the check">
      {result && (
        <div className="flex flex-col gap-3">
          <div
            role="status"
            className={cx(
              'flex flex-col gap-1 rounded-[10px] border px-3.5 py-3',
              result.outcome.tone === 'good' && 'border-correct-line bg-correct-bg text-correct',
              result.outcome.tone === 'wait' && 'border-flagged-line bg-flagged-bg text-flagged',
              result.outcome.tone === 'bad' && 'border-incorrect-line bg-incorrect-bg text-incorrect',
            )}
          >
            <span className="text-base font-semibold">{result.outcome.title}</span>
            <span className="text-sm">{result.outcome.text}</span>
          </div>
          <p className="m-0 text-xs text-muted">The check is recorded in the audit log.</p>
          <div className="flex justify-end"><Btn kind="primary" onClick={() => setResult(null)}>Close</Btn></div>
        </div>
      )}
    </AdminDialog>
  );
  return { run: (p: { id: string; status: PaymentStatus }) => m.mutate(p), busyId: m.isPending ? m.variables?.id : undefined, result, dialog };
}

// ───────────────────────── Manual grant

const FACT = 'flex justify-between gap-3 border-t border-soft py-2 text-sm first:border-t-0';

/** "Grant access manually" (A4): the payment's facts, the operator's transaction ID, a reason. */
export function ManualGrantDialog({ target, onClose }: { target: GrantTarget | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [txn, setTxn] = useState('');
  const open = !!target;
  useEffect(() => {
    if (open) setTxn('');
  }, [open, target?.id]);
  if (!target) return null;
  return (
    <ActionDialog
      open
      onClose={onClose}
      title="Grant access manually"
      confirmLabel="Grant access"
      reasonHint="For example: the candidate showed the operator's SMS; the callback never arrived."
      fieldsOk={!transactionIdProblem(txn)}
      fieldsError={transactionIdProblem(txn)}
      errors={PAYMENT_ERRORS}
      submit={(reason) => manualGrant(target.id, { transactionId: txn.trim(), reason })}
      onDone={() => {
        refreshPayments(qc);
        toast({ text: `Access granted to ${target.candidate}.` });
      }}
      fields={
        <>
          <dl className="m-0 flex flex-col rounded-[10px] border border-border bg-page px-3.5 py-1.5">
            <div className={FACT}><dt className="text-muted">Candidate</dt><dd className="m-0 font-semibold">{target.candidate}</dd></div>
            <div className={FACT}><dt className="text-muted">Amount</dt><dd className="m-0 font-semibold">{target.priceLabel}</dd></div>
            <div className={FACT}><dt className="text-muted">Method</dt><dd className="m-0 font-semibold">{target.providerLabel}</dd></div>
            <div className={FACT}><dt className="text-muted">Payer number</dt><dd className="m-0 font-semibold">{formatLocalPhone(target.msisdn)}</dd></div>
            <div className={FACT}><dt className="text-muted">Age of the request</dt><dd className="m-0 font-semibold">{ageText(target.ageMinutes)}</dd></div>
          </dl>
          <TextField
            label="Provider transaction ID"
            hint="From the operator's portal or the payer's confirmation message. One transaction ID can only be used once."
            value={txn}
            onChange={(e) => setTxn(e.target.value)}
            autoComplete="off"
            error={null}
          />
        </>
      }
    >
      <p className="m-0">Only grant access when you have seen the operator take the money. The candidate gets Full Access for the plan's days, exactly as if the callback had arrived.</p>
    </ActionDialog>
  );
}

// ───────────────────────── Accounting export (A16)

type Phase = { name: 'idle' } | { name: 'preparing' } | { name: 'done'; file: ExportFile } | { name: 'error'; message: string };

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const admin = useAdmin();
  const countries = allowedCountryCodes(admin.countryScope);
  const [form, setForm] = useState<ExportForm>(() => emptyExportForm(admin.countryScope.length === 1 ? admin.countryScope[0]! : ''));
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (open) {
      setPhase({ name: 'idle' });
      setTried(false);
    }
  }, [open]);

  const problems = validateExport(form);
  const set = <K extends keyof ExportForm>(k: K, v: ExportForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (phase.name !== 'preparing') setPhase({ name: 'idle' });
  };

  const run = async () => {
    setTried(true);
    if (Object.keys(problems).length > 0) return;
    setPhase({ name: 'preparing' });
    try {
      const file = await fetchPaymentsExport(exportQuery(form));
      saveFile(file);
      setPhase({ name: 'done', file });
    } catch (e) {
      setPhase({ name: 'error', message: describeAdminError(e, PAYMENT_ERRORS) });
    }
  };

  const busy = phase.name === 'preparing';
  return (
    <AdminDialog open={open} onClose={() => !busy && onClose()} title="Export for accounting">
      <form onSubmit={(e) => { e.preventDefault(); void run(); }} noValidate className="flex flex-col gap-4">
        <p className="m-0 text-[15px] text-ink-2">One row per payment. The payer number is masked to its last 4 digits. The export is recorded in the audit log.</p>
        <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
          <TextField label="From" type="date" value={form.from} onChange={(e) => set('from', e.target.value)} error={tried ? problems.from : null} optional />
          <TextField label="To" type="date" value={form.to} onChange={(e) => set('to', e.target.value)} error={tried ? problems.to : null} optional />
        </div>
        <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
          <SelectField label="Country" value={form.country} onChange={(e) => set('country', e.target.value)}>
            {admin.countryScope.length !== 1 && <option value="">All my countries</option>}
            {countries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </SelectField>
          <SelectField label="Status" value={form.status} onChange={(e) => set('status', e.target.value as ExportForm['status'])}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectField>
        </div>
        <SelectField label="Provider" value={form.provider} onChange={(e) => set('provider', e.target.value)}>
          {PROVIDER_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </SelectField>
        <SelectField label="Format" value="csv" onChange={() => undefined} hint="CSV opens in Excel and Google Sheets. It is the only format.">
          <option value="csv">CSV (.csv)</option>
        </SelectField>
        <p className="m-0 text-[13px] text-muted">Will export: {exportSummary(form, form.country ? countryName(form.country) : '')}. At most 20,000 rows.</p>
        <div aria-live="polite" className="min-h-5 text-sm">
          {phase.name === 'preparing' && <span className="font-semibold text-muted">Preparing the file…</span>}
          {phase.name === 'done' && (
            <span className="font-semibold text-correct">
              Downloaded {phase.file.filename}, {phase.file.rows === 0 ? 'no payments matched (the file has only the header row)' : `${formatCount(phase.file.rows)} ${phase.file.rows === 1 ? 'row' : 'rows'}`}.
            </span>
          )}
        </div>
        {phase.name === 'error' && (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">
            {phase.message}
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 min-[520px]:flex-row min-[520px]:justify-end">
          <Btn onClick={onClose} disabled={busy}>{phase.name === 'done' ? 'Close' : 'Cancel'}</Btn>
          <Btn type="submit" kind="primary" busy={busy}>{phase.name === 'error' ? 'Try again' : phase.name === 'done' ? 'Download again' : 'Download CSV'}</Btn>
        </div>
      </form>
    </AdminDialog>
  );
}
