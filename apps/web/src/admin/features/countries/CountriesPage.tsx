import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { getCountries, getCountry, keys } from '../../api/admin';
import type { CountryDetail } from '../../api/types';
import { AdminShell } from '../../components/AdminShell';
import { ErrorBox, Skeleton } from '../../components/states';
import { InertButton, Pill } from '../../components/ui';
import { COUNTRY_TONE, modeWord } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { amountFromLabel, languageName } from '../../lib/format';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { countrySummary, defaultCountry, testsLabel } from './countriesModel';

const field = 'h-11 rounded-[10px] border border-input-border bg-white px-3 text-[15px] font-normal text-ink';
const label = 'flex flex-col gap-1.5 text-sm font-bold';

function ReadOnlySelect({ ariaLabel, value, options }: { ariaLabel?: string; value: string; options: string[] }) {
  // Changing a country needs a reason and a confirmation that are not designed (A14): drawn, does nothing.
  return (
    <select aria-label={ariaLabel} aria-disabled="true" value={value} onChange={() => undefined} onMouseDown={(e) => e.preventDefault()} className={cx(field, 'cursor-default')}>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

function Detail({ d }: { d: CountryDetail }) {
  const c = d.country;
  const tone = COUNTRY_TONE[c.status];
  const price = amountFromLabel(d.plan?.priceLabel);
  return (
    <section aria-labelledby="cn-t" className="flex min-w-0 flex-[999_1_560px] flex-col gap-[18px] rounded-[16px] border border-border bg-white p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="cn-t" className="m-0 text-[21px]">{c.name}</h2>
        <span className="text-[13px] text-muted">{c.url}</span>
      </div>

      {c.status !== 'LIVE' && (
        <div className="flex flex-col gap-1.5 rounded-[12px] border border-[#FCD34D] bg-[#FFFBEB] p-3.5">
          <span className="text-sm font-bold text-[#78350F]">Before this country can go live</span>
          {d.checklist.map((k) => (
            <span key={k.key} className="flex gap-2 text-sm text-[#78350F]">
              <span aria-hidden="true">{k.ok ? '✓' : '✕'}</span>
              <span>
                <span className="sr-only">{k.ok ? 'Done: ' : 'Not done: '}</span>
                {k.label}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-3">
        <label className={label}>Status<ReadOnlySelect value={tone.label} options={[tone.label, ...['Live', 'Preparing', 'Planned'].filter((s) => s !== tone.label)]} /></label>
        <label className={label}>Currency<input type="text" readOnly value={c.currencyCode} className={field} /></label>
        <label className={label}>Full Access price<input type="text" readOnly value={price} placeholder="Set price" className={field} /></label>
        <label className={label}>Access days<input type="number" readOnly value={d.plan?.durationDays ?? ''} className={field} /></label>
        <label className={label}>Phone prefix<input type="text" readOnly value={c.dialCode} className={field} /></label>
        <label className={label}>Default language<ReadOnlySelect value={languageName(d.languages[0]?.code ?? 'en')} options={[languageName(d.languages[0]?.code ?? 'en')]} /></label>
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-sm font-bold">Payment methods</legend>
        <div className="flex flex-wrap gap-2">
          {d.paymentMethods.map((p) => (
            <label key={p.provider} className="flex items-center gap-2 rounded-[10px] border border-[#D4D4D8] px-3 py-2.5 text-[15px]">
              <input type="checkbox" checked={p.mode !== 'DISABLED'} onChange={() => undefined} aria-disabled="true" className="h-[18px] w-[18px] accent-brand" />
              {p.label}
              <span className="text-xs text-muted">{modeWord(p.mode)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-sm font-bold">Interface and question languages</legend>
        <div className="flex flex-wrap gap-2">
          {d.languages.map((l) => (
            <span key={l.code} className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4D8] px-3 py-2 text-sm font-semibold">
              {languageName(l.code)}
              <span className="text-xs font-medium text-muted">{l.completionPercent}%</span>
            </span>
          ))}
          <InertButton kind="secondary" sizeClass="min-h-[38px] rounded-full border-dashed px-3 text-sm font-semibold !text-ink-2">+ Language</InertButton>
        </div>
      </fieldset>

      <section aria-labelledby="cn-cat" className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <h3 id="cn-cat" className="m-0 text-[15px]">Job categories</h3>
          <button type="button" aria-disabled="true" onClick={(e) => e.preventDefault()} className="cursor-default border-0 bg-transparent py-2 text-sm font-semibold text-brand">Copy structure from Rwanda</button>
        </div>
        {d.categories.map((k) => (
          <div key={k.id} className="flex justify-between gap-2.5 border-t border-[#F4F4F5] py-[9px] text-sm">
            <span className="font-semibold">{k.name}</span>
            <span className="text-ink-2">{testsLabel(k.mockTests)}</span>
          </div>
        ))}
        {d.categories.length === 0 && (
          <div className="flex justify-between gap-2.5 border-t border-[#F4F4F5] py-[9px] text-sm"><span className="font-semibold">No categories yet</span></div>
        )}
      </section>

      <label className={label}>
        Independence notice shown in the footer and FAQ
        <textarea rows={2} readOnly value={c.disclaimer} className="rounded-[10px] border border-input-border bg-white px-3 py-2.5 text-[15px] font-normal text-ink" />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <InertButton kind="secondary" sizeClass="h-11 rounded-[10px] px-4 text-[15px] font-semibold">Preview as candidate</InertButton>
        <InertButton kind="primary" sizeClass="h-11 rounded-[10px] px-4 text-[15px] font-bold">Save country</InertButton>
      </div>
    </section>
  );
}

function PhoneChecklist({ d }: { d: CountryDetail }) {
  const c = d.country;
  const price = amountFromLabel(d.plan?.priceLabel);
  return (
    <section aria-labelledby="kp-t" className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-white p-4">
      <h2 id="kp-t" className="m-0 text-[17px]">{c.name} · ready to launch?</h2>
      {d.checklist.map((k) => (
        <div key={k.key} className="flex items-start gap-2.5 text-sm">
          <span
            aria-hidden="true"
            className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-xs font-extrabold"
            style={k.ok ? { background: '#D1FAE5', color: '#065F46' } : { background: '#FEE2E2', color: '#991B1B' }}
          >
            {k.ok ? '✓' : '✕'}
          </span>
          <span>
            <span className="sr-only">{k.ok ? 'Done: ' : 'Not done: '}</span>
            {k.label}
          </span>
        </div>
      ))}
      <label className={label}>
        Full Access price ({c.currencyCode})
        <input type="number" readOnly value={price} placeholder="Set price" className="h-[46px] rounded-[10px] border border-input-border bg-white px-3 text-base font-normal text-ink" />
      </label>
      <InertButton kind="primary" sizeClass="min-h-[50px] rounded-[12px] text-base font-bold">Save {c.name}</InertButton>
      <InertButton kind="secondary" sizeClass="border-0 bg-transparent p-2 text-[15px] font-semibold !text-brand">Preview as candidate</InertButton>
    </section>
  );
}

/**
 * Countries (AdminCountries.dc, AdminCountriesPhone.dc): the list with a status chip each, and for the chosen country
 * its detail (desktop) or its "ready to launch?" card (phone). Every change needs a reason or has no API yet (A14),
 * so Save, Preview, + Add country, + Language and the editable-looking fields are drawn and do nothing.
 */
export function CountriesPage() {
  const isDesktop = useIsDesktop();
  const [sp, setSp] = useSearchParams();
  const list = useQuery({ queryKey: keys.countries, queryFn: getCountries });
  const rows = list.data?.countries ?? [];
  const code = defaultCountry(rows, sp.get('country'));
  const detail = useQuery({ queryKey: keys.country(code ?? ''), queryFn: () => getCountry(code!), enabled: !!code });
  const pick = (c: string) => setSp(new URLSearchParams({ country: c }), { replace: true });

  const cards = (
    <section aria-label="Country list" className={cx('flex flex-col', isDesktop ? 'min-w-0 flex-[1_1_320px] gap-2.5' : 'gap-3.5')}>
      {rows.map((c) => {
        const on = c.code === code;
        const t = COUNTRY_TONE[c.status];
        return (
          <button
            key={c.code}
            type="button"
            aria-pressed={on}
            onClick={() => pick(c.code)}
            className={cx(
              'flex cursor-pointer items-center gap-3 text-left text-ink',
              isDesktop ? 'rounded-[14px] p-3.5' : 'rounded-[14px] p-3.5',
              on ? 'border-2 border-brand bg-brand-softer' : 'border border-border bg-white',
            )}
          >
            <span className={cx('inline-flex flex-none items-center justify-center rounded-[10px] bg-ink text-[13px] font-extrabold text-white', isDesktop ? 'h-10 w-10' : 'h-[38px] w-[38px]')}>{c.code}</span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className={cx('font-bold', isDesktop ? 'text-base' : 'text-[15px]')}>{c.name}</span>
              <span className="text-[13px] text-muted">{countrySummary(c)}</span>
            </span>
            <Pill tone={t} className={isDesktop ? 'px-[9px] py-[3px]' : 'px-2 py-[3px] !text-[11px]'}>{t.label}</Pill>
          </button>
        );
      })}
    </section>
  );

  const state = list.isPending ? <Skeleton label="Loading countries…" /> : list.isError ? <ErrorBox error={list.error} onRetry={() => void list.refetch()} /> : null;

  if (!isDesktop) {
    return (
      <AdminShell title="Countries" back="/admin/settings">
        <p className="m-0 text-sm text-ink-2">Candidates only see Live countries.</p>
        {state ?? cards}
        {detail.data && detail.data.country.status !== 'LIVE' && <PhoneChecklist d={detail.data} />}
        {detail.isError && <ErrorBox error={detail.error} onRetry={() => void detail.refetch()} />}
        <InertButton kind="secondary" sizeClass="min-h-12 rounded-[12px] border-dashed text-[15px] font-semibold !text-ink-2">+ Add country</InertButton>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Countries">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Countries</h1>
          <span className="text-sm text-muted">Each country has its own exams, price, currency, payment methods and languages. Candidates only see Live countries.</span>
        </div>
        <InertButton kind="primary" sizeClass="h-11 rounded-[10px] px-4 text-[15px] font-bold">+ Add country</InertButton>
      </div>
      {state ?? (
        <div className="flex flex-wrap items-start gap-[18px]">
          {cards}
          {detail.isPending && code ? <Skeleton className="min-w-0 flex-[999_1_560px]" label="Loading this country…" /> : detail.isError ? <ErrorBox error={detail.error} onRetry={() => void detail.refetch()} className="min-w-0 flex-[999_1_560px]" /> : detail.data && <Detail d={detail.data} />}
        </div>
      )}
    </AdminShell>
  );
}
