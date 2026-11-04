import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { keys, patchCountry } from '../../api/admin';
import type { CountryDetailX } from '../../api/governance';
import { SaveStatus, type SaveState } from '../../components/states';
import { CheckField, FieldGroup, TextAreaField, TextField } from '../../components/forms';
import { Btn, LinkButton, Pill } from '../../components/ui';
import { COUNTRY_TONE, modeWord, MODE_TONE, PROVIDER_SWATCH } from '../../lib/badges';
import { describeAdminError } from '../../lib/apiErrors';
import { cx } from '../../lib/cx';
import { amountFromLabel, languageName } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';
import { useAdmin } from '../auth/session';
import { testsLabel } from './countriesModel';
import { COUNTRY_ERRORS, contactForm, contactProblems, countryPatch, providerLines, type ContactForm } from './countryActions';
import { GoLiveDialog, MoveBackDialog, ProviderModeDialog, SetPriceDialog } from './CountryDialogs';

const ro = 'h-11 w-full rounded-[10px] border border-input-border bg-soft px-3 text-[15px] font-normal text-ink';
const NOT_YET = 'Not available yet: the server has no way to do this.';

function Checklist({ d }: { d: CountryDetailX }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-flagged-line bg-flagged-bg p-3.5">
      <span className="text-sm font-semibold text-flagged">Before this country can go live</span>
      {d.checklist.map((k) => (
        <span key={k.key} className="flex gap-2 text-sm text-flagged">
          <span aria-hidden="true">{k.ok ? '✓' : '✕'}</span>
          <span>
            <span className="sr-only">{k.ok ? 'Done: ' : 'Not done: '}</span>
            {k.label}
            {k.detail && <span className="block text-[13px]">{k.detail}</span>}
          </span>
        </span>
      ))}
    </div>
  );
}

/** One country (AdminCountries.dc detail, and the phone's card): actions with confirmations, provider status, notice and contact. */
export function CountryDetailPanel({ d, phone }: { d: CountryDetailX; phone: boolean }) {
  const admin = useAdmin();
  const qc = useQueryClient();
  const c = d.country;
  const tone = COUNTRY_TONE[c.status];
  const canWrite = !denyHint(admin.permissions, 'countries:write');
  const why = (what: string) => denyHint(admin.permissions, 'countries:write', what);
  const canExams = admin.permissions.includes('exams:read');

  const [dialog, setDialog] = useState<'price' | 'live' | 'back' | null>(null);
  const [method, setMethod] = useState<CountryDetailX['paymentMethods'][number] | null>(null);

  const legalNow = d.legal?.reviewed ?? d.checklist.find((k) => k.key === 'legal')?.ok ?? false;
  const current = useMemo(() => ({ disclaimer: c.disclaimer, legalReviewed: legalNow, contact: contactForm(d.supportContact) }), [c.disclaimer, legalNow, d.supportContact]);
  const [notice, setNotice] = useState(current.disclaimer);
  const [legal, setLegal] = useState(current.legalReviewed);
  const [contact, setContact] = useState<ContactForm>(current.contact);
  const [tried, setTried] = useState(false);
  const [state, setState] = useState<SaveState>('idle');
  const [serverError, setServerError] = useState('');
  useEffect(() => {
    setNotice(current.disclaimer); setLegal(current.legalReviewed); setContact(current.contact); setTried(false);
  }, [current]);

  const patch = countryPatch(current, { disclaimer: notice, legalReviewed: legal, contact });
  const dirty = patch !== null;
  const { dialog: leaveDialog } = useUnsavedChanges(dirty);
  const noticeError = notice.trim().length < 10 || notice.trim().length > 300 ? 'The notice must be 10 to 300 characters.' : null;
  const cProblems = contactProblems(contact);
  const valid = !noticeError && Object.keys(cProblems).length === 0;

  const save = useMutation({
    mutationFn: () => patchCountry(c.code, patch!),
    onMutate: () => { setState('saving'); setServerError(''); },
    onSuccess: async () => {
      setState('saved');
      await qc.invalidateQueries({ queryKey: keys.country(c.code) });
      void qc.invalidateQueries({ queryKey: keys.countries });
      void qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
    onError: (e) => { setState('error'); setServerError(describeAdminError(e, COUNTRY_ERRORS)); },
  });
  const onSave = () => {
    setTried(true);
    if (patch && valid) save.mutate();
  };

  const price = amountFromLabel(d.plan?.priceLabel);
  const setCt = (k: keyof ContactForm) => (e: { target: { value: string } }) => { setContact({ ...contact, [k]: e.target.value }); setState('idle'); };

  return (
    <section aria-labelledby="cn-t" className={cx('flex min-w-0 flex-col gap-[18px] border border-border bg-white', phone ? 'rounded-[14px] p-4' : 'flex-[999_1_560px] rounded-[16px] p-[22px]')}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="cn-t" className="m-0 text-[17px]">{c.name}</h2>
        <span className="break-all text-[13px] text-muted">{c.url}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Pill tone={tone}>{tone.label}</Pill>
        {c.status !== 'LIVE' && <Btn kind="primary" onClick={() => setDialog('live')} whyDisabled={why('open a country to candidates')}>Go live…</Btn>}
        {c.status === 'LIVE' && <Btn kind="danger" onClick={() => setDialog('back')} whyDisabled={why('move a country back to Preparing')}>Move back to Preparing…</Btn>}
      </div>

      {c.status !== 'LIVE' && <Checklist d={d} />}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Full Access price<input type="text" readOnly value={price} placeholder="Not set" className={ro} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Access days<input type="text" readOnly value={d.plan?.durationDays ?? '—'} className={ro} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Currency<input type="text" readOnly value={c.currencyCode} className={ro} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Phone prefix<input type="text" readOnly value={c.dialCode} className={ro} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Default language<input type="text" readOnly value={languageName(d.languages[0]?.code ?? 'en')} className={ro} /></label>
      </div>
      <div>
        <Btn kind="outline-brand" onClick={() => setDialog('price')} whyDisabled={why('change the price')}>Set price…</Btn>
        <p className="m-0 mt-1.5 text-[13px] text-muted">A new price applies to new payments only. Active Full Access is never shortened.</p>
      </div>

      <FieldGroup legend="Payment methods" hint="Status only. Keys and secrets are never shown here.">
        {d.paymentMethods.map((p) => {
          const mt = MODE_TONE[p.mode];
          const lines = providerLines(p.providerStatus);
          return (
            <div key={p.provider} className="flex flex-col gap-2 rounded-[10px] border border-border-strong p-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span aria-hidden="true" className="h-7 w-7 flex-none rounded-lg" style={{ background: PROVIDER_SWATCH[p.provider] ?? '#CDD4DE' }} />
                <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{p.label}</span><span className="text-xs text-muted">{modeWord(p.mode)}</span></span>
                <Pill tone={mt}>{mt.label}</Pill>
                <Btn size="sm" onClick={() => setMethod(p)} whyDisabled={why('change a payment method')} aria-label={`Change mode of ${p.label}`}>Change mode</Btn>
              </div>
              {lines.length > 0 && <ul className="m-0 list-none break-all p-0 text-[13px] text-ink-2">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
            </div>
          );
        })}
      </FieldGroup>

      <FieldGroup legend="Interface and question languages">
        <div className="flex flex-wrap items-center gap-2">
          {d.languages.map((l) => (
            <span key={l.code} className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-2 text-sm font-semibold">
              {languageName(l.code)}
              <span className="text-xs font-medium text-muted">{l.completionPercent}%</span>
            </span>
          ))}
          <Btn size="sm" whyDisabled={NOT_YET}>+ Language</Btn>
        </div>
      </FieldGroup>

      <section aria-labelledby="cn-cat" className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="cn-cat" className="m-0 text-[15px]">Job categories</h3>
          <span className="flex flex-wrap gap-2">
            {canExams && <LinkButton to="/admin/exams/catalog" size="sm">Manage categories</LinkButton>}
            <Btn size="sm" whyDisabled={NOT_YET}>Copy structure from Rwanda</Btn>
          </span>
        </div>
        {d.categories.map((k) => (
          <div key={k.id} className="flex justify-between gap-2.5 border-t border-soft py-[9px] text-sm">
            <span className="font-semibold">{k.name}</span>
            <span className="text-ink-2">{testsLabel(k.mockTests)}</span>
          </div>
        ))}
        {d.categories.length === 0 && <div className="border-t border-soft py-[9px] text-sm font-semibold">No categories yet</div>}
      </section>

      <TextAreaField label="Independence notice shown in the footer and FAQ" rows={2} value={notice} readOnly={!canWrite} error={tried ? noticeError : null} onChange={(e) => { setNotice(e.target.value); setState('idle'); }} />
      <CheckField label="Terms and refund policy have had a legal review" checked={legal} disabled={!canWrite} onChange={(e) => { setLegal(e.target.checked); setState('idle'); }} hint="One of the items that must be done before the country goes live." />
      <FieldGroup legend="Support contact shown to candidates" hint="Leave a line empty to hide it.">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
          <TextField label="Phone" value={contact.phone} readOnly={!canWrite} error={tried ? cProblems.phone : null} onChange={setCt('phone')} />
          <TextField label="WhatsApp" value={contact.whatsapp} readOnly={!canWrite} error={tried ? cProblems.whatsapp : null} onChange={setCt('whatsapp')} />
          <TextField label="Email" type="email" value={contact.email} readOnly={!canWrite} error={tried ? cProblems.email : null} onChange={setCt('email')} />
          <TextField label="Opening hours" value={contact.hours} readOnly={!canWrite} error={tried ? cProblems.hours : null} onChange={setCt('hours')} />
        </div>
      </FieldGroup>

      {serverError && <div role="alert" className="rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">{serverError}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <SaveStatus state={state} savedText="Saved. Recorded in the audit log." />
        <span className="flex flex-wrap gap-2">
          <LinkButton to={`/${c.slug}`} target="_blank" rel="noreferrer">Preview as candidate</LinkButton>
          <Btn kind="primary" onClick={onSave} busy={state === 'saving'} disabled={!dirty} whyDisabled={why('save a country')}>Save country</Btn>
        </span>
      </div>

      <SetPriceDialog open={dialog === 'price'} onClose={() => setDialog(null)} d={d} />
      <GoLiveDialog open={dialog === 'live'} onClose={() => setDialog(null)} d={d} />
      <MoveBackDialog open={dialog === 'back'} onClose={() => setDialog(null)} d={d} />
      <ProviderModeDialog open={!!method} onClose={() => setMethod(null)} d={d} m={method} />
      {leaveDialog}
    </section>
  );
}
