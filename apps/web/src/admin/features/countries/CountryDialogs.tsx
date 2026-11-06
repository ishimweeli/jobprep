import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { keys, patchCountry, patchPaymentMethod, patchPlan } from '../../api/admin';
import { getStatusImpact, type CountryDetailX } from '../../api/governance';
import type { ProviderMode } from '../../api/types';
import { ActionDialog } from '../../components/ActionDialog';
import { CheckField, FieldGroup, TextField } from '../../components/forms';
import { Loader } from '../../components/states';
import { useToast } from '../../components/Toast';
import { amountFromLabel, plural } from '../../lib/format';
import { COUNTRY_ERRORS, exponentFor, liveWarning, MODE_CHOICES, parsePrice, priceConsequence, priceError } from './countryActions';

type Method = CountryDetailX['paymentMethods'][number];

function useRefresh(code: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.country(code) });
    void qc.invalidateQueries({ queryKey: keys.countries });
    void qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    void qc.invalidateQueries({ queryKey: keys.audit(5) });
  };
}

/** Set the Full Access price (and optionally the days), with a reason; says plainly that it applies to new payments only. */
export function SetPriceDialog({ open, onClose, d }: { open: boolean; onClose: () => void; d: CountryDetailX }) {
  const toast = useToast();
  const refresh = useRefresh(d.country.code);
  const exp = exponentFor(d.country.currencyCode, d.plan);
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (open) { setPrice(amountFromLabel(d.plan?.priceLabel)); setDays(String(d.plan?.durationDays ?? 30)); setTried(false); }
  }, [open, d.plan]);
  const cur = d.country.currencyCode;
  const dayN = Number(days);
  const daysOk = Number.isInteger(dayN) && dayN >= 1 && dayN <= 365;
  const pErr = priceError(price, exp, cur);
  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={`Set the Full Access price in ${d.country.name}`}
      confirmLabel="Save price"
      fieldsOk={!pErr && daysOk}
      fieldsError="Check the price and the number of days."
      errors={COUNTRY_ERRORS}
      fields={
        <>
          <TextField label={`Price (${cur})`} inputMode="decimal" value={price} error={tried ? pErr : null} onChange={(e) => { setTried(true); setPrice(e.target.value); }} hint={`Whole ${cur === 'KES' ? 'shillings and cents' : 'amount'} in ${cur}, not typed with the currency name.`} />
          <TextField label="Access length (days)" type="number" min={1} max={365} value={days} error={tried && !daysOk ? 'Enter a whole number from 1 to 365.' : null} onChange={(e) => { setTried(true); setDays(e.target.value); }} />
        </>
      }
      submit={(reason) => patchPlan(d.country.code, { priceMinor: parsePrice(price, exp)!, durationDays: dayN, reason })}
      onDone={() => { refresh(); toast({ text: `The ${d.country.name} price is saved. It applies to new payments only.` }); }}
    >
      <p className="m-0">{priceConsequence(cur, price, exp, d.plan?.priceLabel ?? null)}</p>
    </ActionDialog>
  );
}

/** Go live: the checklist, blocking while items are open unless someone deliberately overrides it (and says why). */
export function GoLiveDialog({ open, onClose, d }: { open: boolean; onClose: () => void; d: CountryDetailX }) {
  const toast = useToast();
  const refresh = useRefresh(d.country.code);
  const [force, setForce] = useState(false);
  useEffect(() => { if (open) setForce(false); }, [open]);
  const open_ = d.checklist.filter((k) => !k.ok);
  const ready = open_.length === 0;
  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={`Open ${d.country.name} to candidates`}
      confirmLabel={ready ? 'Go live' : 'Go live anyway'}
      reasonHint={ready ? 'For example: checked with the team, launch date agreed.' : 'Why it is safe to open with the open items below.'}
      fieldsOk={ready || force}
      fieldsError="Finish the open items, or tick the box to open anyway."
      errors={COUNTRY_ERRORS}
      fields={
        <>
          <FieldGroup legend="Before a country goes live">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {d.checklist.map((k) => (
                <li key={k.key} className="flex gap-2 text-sm">
                  <span aria-hidden="true" className={k.ok ? 'font-semibold text-correct' : 'font-semibold text-incorrect'}>{k.ok ? '✓' : '✕'}</span>
                  <span>
                    <span className="sr-only">{k.ok ? 'Done: ' : 'Not done: '}</span>
                    {k.label}
                    {k.detail && <span className="block text-[13px] text-muted">{k.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </FieldGroup>
          {!ready && (
            <div role="note" className="rounded-[10px] border border-flagged-line bg-flagged-bg p-3 text-sm text-flagged">
              <strong>{plural(open_.length, 'item')} still open.</strong> Candidates would see a country that is not ready. Finish them first, or open it anyway on purpose.
              <CheckField className="mt-1" label="Open anyway, I understand" checked={force} onChange={(e) => setForce(e.target.checked)} />
            </div>
          )}
        </>
      }
      submit={(reason) => patchCountry(d.country.code, { status: 'LIVE', reason, ...(ready ? {} : { force: true }) })}
      onDone={() => { refresh(); toast({ text: `${d.country.name} is now live.` }); }}
    >
      <p className="m-0">Candidates in {d.country.name} will see the country, its prices and its mock tests straight away.</p>
    </ActionDialog>
  );
}

/** Move a live country back to Preparing, with the numbers it affects. */
export function MoveBackDialog({ open, onClose, d }: { open: boolean; onClose: () => void; d: CountryDetailX }) {
  const toast = useToast();
  const refresh = useRefresh(d.country.code);
  const impact = useQuery({ queryKey: ['admin', 'status-impact', d.country.code, 'PREPARING'], queryFn: () => getStatusImpact(d.country.code, 'PREPARING'), enabled: open });
  const i = impact.data;
  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={`Move ${d.country.name} back to Preparing`}
      confirmLabel="Move back to Preparing"
      kind="danger"
      errors={COUNTRY_ERRORS}
      submit={(reason) => patchCountry(d.country.code, { status: 'PREPARING', reason })}
      onDone={() => { refresh(); toast({ text: `${d.country.name} is back to Preparing.` }); }}
    >
      <p className="m-0">Candidates will no longer see {d.country.name} or its mock tests, and nobody can pay there. People who already have Full Access keep it.</p>
      {impact.isPending ? (
        <Loader label="Counting who is affected…" />
      ) : i ? (
        <ul className="m-0 list-disc pl-5 text-sm">
          <li>{plural(i.users, 'person', 'people')} registered in {d.country.name}</li>
          <li>{plural(i.activeAccessGrants, 'active Full Access', 'active Full Access')}</li>
          <li>{plural(i.attemptsInProgress, 'test in progress', 'tests in progress')} (they keep running)</li>
          <li>{plural(i.publishedTests, 'published mock test')}</li>
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted">The numbers could not be loaded; you can still continue.</p>
      )}
    </ActionDialog>
  );
}

/** Sandbox / live / off for one payment method, with its status (never a secret). */
export function ProviderModeDialog({ open, onClose, d, m }: { open: boolean; onClose: () => void; d: CountryDetailX; m: Method | null }) {
  const toast = useToast();
  const refresh = useRefresh(d.country.code);
  const [mode, setMode] = useState<ProviderMode>('SANDBOX');
  useEffect(() => { if (open && m) setMode(m.mode); }, [open, m]);
  const warn = liveWarning(m?.providerStatus, mode);
  return (
    <ActionDialog
      open={open && !!m}
      onClose={onClose}
      title={`${m?.label ?? 'Payment method'} in ${d.country.name}`}
      confirmLabel="Save"
      fieldsOk={!!m && mode !== m.mode}
      fieldsError="Choose a different mode first."
      errors={COUNTRY_ERRORS}
      fields={
        <FieldGroup legend="Mode">
          {MODE_CHOICES.map((c) => (
            <label key={c.value} className="flex min-h-11 items-start gap-2.5 rounded-[10px] border border-border-strong p-2.5 text-[15px] has-[:checked]:border-brand has-[:checked]:bg-brand-softer">
              <input type="radio" name="provider-mode" checked={mode === c.value} onChange={() => setMode(c.value)} className="mt-1 h-5 w-5 flex-none accent-brand" />
              <span className="flex flex-col"><span className="font-semibold">{c.label}</span><span className="text-[13px] text-muted">{c.help}</span></span>
            </label>
          ))}
          {warn && <p role="note" className="m-0 rounded-[10px] border border-flagged-line bg-flagged-bg p-3 text-sm text-flagged">{warn}</p>}
        </FieldGroup>
      }
      submit={(reason) => patchPaymentMethod(d.country.code, m!.provider, { mode, reason })}
      onDone={() => { refresh(); toast({ text: `${m?.label} is now ${MODE_CHOICES.find((c) => c.value === mode)?.label.toLowerCase()}.` }); }}
    >
      <p className="m-0">Secrets and keys are never shown here. They are set on the server.</p>
    </ActionDialog>
  );
}
