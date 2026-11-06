import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { getCountries, getCountry, keys } from '../../api/admin';
import type { CountryDetailX } from '../../api/governance';
import { AdminShell } from '../../components/AdminShell';
import { ErrorBox, Loader } from '../../components/states';
import { Btn, LinkButton, Pill } from '../../components/ui';
import { COUNTRY_TONE } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { countrySummary, defaultCountry } from './countriesModel';
import { CountryDetailPanel } from './CountryDetail';

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
              isDesktop ? 'rounded-[10px] p-3.5' : 'rounded-[10px] p-3.5',
              on ? 'border-2 border-brand bg-brand-softer' : 'border border-border bg-white',
            )}
          >
            <span className={cx('inline-flex flex-none items-center justify-center rounded-[10px] border border-border bg-page text-[13px] font-semibold text-muted', isDesktop ? 'h-10 w-10' : 'h-[38px] w-[38px]')}>{c.code}</span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className={cx('font-semibold', isDesktop ? 'text-base' : 'text-[15px]')}>{c.name}</span>
              <span className="text-[13px] text-muted">{countrySummary(c)}</span>
            </span>
            <Pill tone={t} className={isDesktop ? 'px-[9px] py-[3px]' : 'px-2 py-[3px] !text-[11px]'}>{t.label}</Pill>
          </button>
        );
      })}
    </section>
  );

  const state = list.isPending ? <Loader label="Loading countries…" /> : list.isError ? <ErrorBox error={list.error} onRetry={() => void list.refetch()} /> : null;

  if (!isDesktop) {
    return (
      <AdminShell title="Countries" back="/admin/settings">
        <p className="m-0 text-sm text-ink-2">Candidates only see Live countries.</p>
        {state ?? cards}
        {detail.data && <CountryDetailPanel d={detail.data as CountryDetailX} phone />}
        {detail.isError && <ErrorBox error={detail.error} onRetry={() => void detail.refetch()} />}
        <LinkButton to="/admin/countries/waiting-list" kind="secondary" size="lg">Waiting list</LinkButton>
        <Btn size="lg" whyDisabled="Not available yet: countries are added on the server.">+ Add country</Btn>
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
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/admin/countries/waiting-list" kind="secondary">Waiting list</LinkButton>
          <Btn kind="primary" whyDisabled="Not available yet: countries are added on the server.">+ Add country</Btn>
        </div>
      </div>
      {state ?? (
        <div className="flex flex-wrap items-start gap-[18px]">
          {cards}
          {detail.isPending && code ? <Loader className="min-w-0 flex-[999_1_560px]" label="Loading this country…" /> : detail.isError ? <ErrorBox error={detail.error} onRetry={() => void detail.refetch()} className="min-w-0 flex-[999_1_560px]" /> : detail.data && <CountryDetailPanel d={detail.data as CountryDetailX} phone={false} />}
        </div>
      )}
    </AdminShell>
  );
}
