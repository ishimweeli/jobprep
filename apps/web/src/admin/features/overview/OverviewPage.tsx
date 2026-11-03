import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getCountries, getOverview, keys } from '../../api/admin';
import type { Overview } from '../../api/types';
import { AdminShell } from '../../components/AdminShell';
import { ErrorBox, Skeleton } from '../../components/states';
import { InertButton, Pill } from '../../components/ui';
import { ACCESS_TAG, paymentTone } from '../../lib/badges';
import { barHeights, chartSummary } from '../../lib/chart';
import { cx } from '../../lib/cx';
import { COUNTRY_NAMES, countryName, formatCount, formatDay, formatLongDate, formatTime } from '../../lib/format';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { buildAlerts, buildKpis, optionLabel } from './overviewModel';

const card = 'flex min-w-0 flex-col rounded-[16px] border border-border bg-white';
const phoneCard = 'flex flex-col gap-1 rounded-[14px] border border-border bg-white p-4';

function Section({ id, title, aside, phone, className, children }: { id: string; title: string; aside?: ReactNode; phone: boolean; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cx(phone ? phoneCard : cx(card, 'gap-1 p-5'), className)}>
      {aside ? (
        <div className={cx('flex items-baseline justify-between', phone ? 'mb-1.5' : 'mb-2')}>
          <h2 id={id} className={cx('m-0', phone ? 'text-[17px]' : 'text-lg')}>{title}</h2>
          {aside}
        </div>
      ) : (
        <h2 id={id} className={cx('m-0', phone ? 'mb-1.5 text-[17px]' : 'mb-2 text-lg')}>{title}</h2>
      )}
      {children}
    </section>
  );
}

export function OverviewPage() {
  const admin = useAdmin();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const country = sp.get('country')?.toUpperCase() || undefined;
  const [search, setSearch] = useState('');
  const canCountries = admin.permissions.includes('countries:read');

  const q = useQuery({ queryKey: keys.overview(country), queryFn: () => getOverview(country), placeholderData: (prev) => prev });
  const countries = useQuery({ queryKey: keys.countries, queryFn: getCountries, enabled: canCountries && isDesktop, staleTime: 5 * 60_000 });

  const scope = admin.countryScope;
  const codes = scope.length ? scope : Object.keys(COUNTRY_NAMES);
  const statusOf = (code: string) => countries.data?.countries.find((c) => c.code === code)?.status;
  const showAll = scope.length !== 1;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const term = search.trim();
    if (!term) return;
    // The search box has no results page of its own (no design): it opens the users list, or the exams list for an editor.
    if (admin.permissions.includes('users:read')) navigate(`/admin/users?q=${encodeURIComponent(term)}`);
    else if (admin.permissions.includes('exams:read')) navigate(`/admin/exams?q=${encodeURIComponent(term)}`);
  };

  const o = q.data;
  return (
    <AdminShell title="Overview" gap={22}>
      {isDesktop && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="m-0 text-[28px] tracking-[-0.02em]">Overview</h1>
            <span className="text-sm text-muted">{formatLongDate(o?.asOf ?? new Date())}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Country"
              value={country ?? (showAll ? '' : (scope[0] ?? ''))}
              onChange={(e) => {
                const next = new URLSearchParams(sp);
                if (e.target.value) next.set('country', e.target.value);
                else next.delete('country');
                setSp(next, { replace: true });
              }}
              className="h-11 rounded-[10px] border border-input-border bg-white px-3 text-[15px] font-semibold text-ink"
            >
              {showAll && <option value="">All countries</option>}
              {codes.map((c) => {
                const st = statusOf(c);
                return (
                  <option key={c} value={c}>
                    {st ? optionLabel(countryName(c), st) : countryName(c)}
                  </option>
                );
              })}
            </select>
            <form role="search" onSubmit={onSearch} className="contents">
              <label htmlFor="ao-q" className="sr-only">Search users, emails or exams</label>
              <input
                id="ao-q"
                type="search"
                placeholder="Search users, email or exam"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-[300px] max-w-full rounded-[10px] border border-input-border bg-white px-3.5 text-[15px] text-ink"
              />
            </form>
            <InertButton kind="primary" sizeClass="h-11 rounded-[10px] px-4 text-[15px] font-bold">
              + New mock test
            </InertButton>
          </div>
        </div>
      )}
      {!isDesktop && <span className="text-[13px] text-muted">{formatLongDate(o?.asOf ?? new Date())}</span>}

      {q.isPending ? (
        <Skeleton label="Loading the overview…" />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        o && <OverviewBody o={o} phone={!isDesktop} />
      )}
    </AdminShell>
  );
}

function OverviewBody({ o, phone }: { o: Overview; phone: boolean }) {
  const kpis = buildKpis(o, phone);
  const alerts = buildAlerts(o, phone);
  const bars = barHeights(o.chart.signups, o.chart.payments);
  const summary = chartSummary(o.chart.signups, o.chart.payments);
  const d = o.chart.days;
  const admin = useAdmin();
  const canPayments = admin.permissions.includes('payments:read');
  const canExams = admin.permissions.includes('exams:read');

  const kpiGrid = (
    <dl className={cx('m-0 grid', phone ? 'grid-cols-2 gap-2.5' : 'grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3.5')}>
      {kpis.map((k) => (
        <div key={k.label} className={cx('flex flex-col gap-1 border border-border bg-white', phone ? 'min-w-0 gap-0.5 rounded-[14px] p-3.5' : 'rounded-[16px] p-[18px]')}>
          <dt className={cx('font-semibold text-muted', phone ? 'text-xs' : 'text-sm')}>{k.label}</dt>
          <dd className={cx('m-0 font-extrabold tabular', phone ? 'text-[22px]' : 'text-[28px] tracking-[-0.02em]')}>{k.value}</dd>
          <dd className={cx('m-0 font-semibold', phone ? 'text-xs' : 'text-[13px]')} style={{ color: k.good ? '#065F46' : '#52525B' }}>
            {k.delta}
          </dd>
        </div>
      ))}
    </dl>
  );

  const attention = (
    <Section id="ao-att" title="Needs attention" phone={phone} className={phone ? '' : 'flex-[1_1_360px]'}>
      {alerts.length === 0 && <p className="m-0 border-t border-[#F4F4F5] py-3 text-sm text-muted">Nothing needs attention right now.</p>}
      {alerts.map((a) => {
        const allowed = a.to.startsWith('/admin/payments') ? canPayments : canExams;
        const inner = (
          <>
            <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full" style={{ background: a.dot }} />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{a.title}</span>
              {a.meta && <span className="text-[13px] text-muted">{a.meta}</span>}
            </span>
            {phone ? <span aria-hidden="true" className="text-muted">›</span> : <span className="whitespace-nowrap text-sm font-semibold text-brand">{a.action}</span>}
          </>
        );
        const cls = cx('flex items-start gap-3 border-t border-[#F4F4F5] py-3 text-ink no-underline hover:text-ink', phone && 'gap-2.5');
        return allowed ? (
          <Link key={a.key} to={a.to} className={cls}>
            {inner}
          </Link>
        ) : (
          <div key={a.key} className={cls}>
            {inner}
          </div>
        );
      })}
    </Section>
  );

  const legend = (small: boolean) => (
    <div className={cx('flex gap-3.5 text-ink-2', small ? 'pt-1.5 text-xs' : 'text-[13px]')}>
      <span className="flex items-center gap-1.5"><span className={cx('rounded-[3px] bg-[#DDD6FE]', small ? 'h-2.5 w-2.5' : 'h-3 w-3')} />Sign-ups</span>
      <span className="flex items-center gap-1.5"><span className={cx('rounded-[3px] bg-brand', small ? 'h-2.5 w-2.5' : 'h-3 w-3')} />Payments</span>
    </div>
  );

  const chartBars = (
    <>
      <div
        role="img"
        aria-label={summary}
        className={cx('flex items-end border-b border-[#D4D4D8]', phone ? 'h-[130px] gap-1' : 'h-[200px] gap-2 px-1')}
      >
        {bars.map((b, i) => (
          <div key={d[i] ?? i} className={cx('flex h-full flex-1 items-end', phone ? 'gap-px' : 'gap-0.5')}>
            <span className={cx('flex-1 bg-[#DDD6FE]', phone ? 'rounded-t-[3px]' : 'rounded-t')} style={{ height: b.s }} />
            <span className={cx('flex-1 bg-brand', phone ? 'rounded-t-[3px]' : 'rounded-t')} style={{ height: b.p }} />
          </div>
        ))}
      </div>
      {/* The same numbers as a table for screen readers (the picture above is one labelled image). */}
      <div className="sr-only"><table>
        <caption>New sign-ups and Full Access payments per day</caption>
        <thead><tr><th>Day</th><th>Sign-ups</th><th>Payments</th></tr></thead>
        <tbody>
          {d.map((day, i) => (
            <tr key={day}><td>{formatDay(day + 'T12:00:00Z')}</td><td>{o.chart.signups[i]}</td><td>{o.chart.payments[i]}</td></tr>
          ))}
        </tbody>
      </table></div>
    </>
  );

  const chart = phone ? (
    <Section id="op-c" title="Sign-ups and payments · 14 days" phone>
      {chartBars}
      {legend(true)}
    </Section>
  ) : (
    <section aria-labelledby="ao-ch" className={cx(card, 'flex-[999_1_520px] gap-3 p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="ao-ch" className="m-0 text-lg">New sign-ups and Full Access payments · last 14 days</h2>
        {legend(false)}
      </div>
      {chartBars}
      <div aria-hidden="true" className="flex justify-between text-xs text-muted">
        <span>{formatDay(d[0] ? `${d[0]}T12:00:00Z` : null)}</span>
        <span>{formatDay(d[6] ? `${d[6]}T12:00:00Z` : null)}</span>
        <span>{formatDay(d[d.length - 1] ? `${d[d.length - 1]}T12:00:00Z` : null)}</span>
      </div>
    </section>
  );

  const tag = (free: boolean) => (free ? ACCESS_TAG.free : ACCESS_TAG.paid);
  const top = phone ? (
    <Section id="op-t" title="Most-taken this week" phone>
      {o.topMockTests.map((t) => (
        <div key={t.mockTestId} className="flex justify-between gap-2.5 border-t border-[#F4F4F5] py-2.5">
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold">{t.title}</span>
            <span className="text-xs text-muted">avg {t.avgPercent === null ? '—' : `${t.avgPercent}%`} · {tag(t.isFree).label}</span>
          </span>
          <strong className="text-sm tabular">{formatCount(t.attempts)}</strong>
        </div>
      ))}
    </Section>
  ) : (
    <Section
      id="ao-top"
      title="Most-taken mock tests this week"
      phone={false}
      className="flex-[999_1_520px] gap-2.5"
      aside={canExams ? <Link to="/admin/exams" className="text-sm font-semibold">All exams</Link> : undefined}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 pr-2 font-semibold">Mock test</th>
              <th className="p-2 font-semibold">Access</th>
              <th className="p-2 text-right font-semibold">Attempts</th>
              <th className="p-2 text-right font-semibold">Avg score</th>
              <th className="py-2 pl-2 text-right font-semibold">Completion</th>
            </tr>
          </thead>
          <tbody>
            {o.topMockTests.map((t) => (
              <tr key={t.mockTestId} className="border-t border-[#F4F4F5]">
                <td className="py-[11px] pr-2 font-semibold">{t.title}</td>
                <td className="px-2 py-[11px]"><Pill tone={tag(t.isFree)} className="px-2 py-0.5">{tag(t.isFree).label}</Pill></td>
                <td className="px-2 py-[11px] text-right tabular">{formatCount(t.attempts)}</td>
                <td className="px-2 py-[11px] text-right tabular">{t.avgPercent === null ? '—' : `${t.avgPercent}%`}</td>
                <td className="py-[11px] pl-2 text-right tabular">{t.completionPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {o.topMockTests.length === 0 && <p className="m-0 text-sm text-muted">No mock test has been taken this week.</p>}
    </Section>
  );

  const pays = (
    <Section
      id={phone ? 'op-p' : 'ao-pay'}
      title="Latest payments"
      phone={phone}
      className={phone ? '' : 'flex-[1_1_360px]'}
      aside={canPayments ? <Link to="/admin/payments" className={cx('text-sm font-semibold', phone && 'py-2')}>{phone ? 'All' : 'All payments'}</Link> : undefined}
    >
      {o.latestPayments.map((p) => {
        const tone = paymentTone(p.status);
        return (
          <div key={p.id} className="flex items-center justify-between gap-2.5 border-t border-[#F4F4F5] py-2.5">
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{p.user.name}</span>
              <span className="text-xs text-muted">{p.providerLabel} · {formatTime(p.createdAt)}</span>
            </span>
            <Pill tone={tone} className="px-[9px] py-[3px]">{tone.label}</Pill>
          </div>
        );
      })}
      {o.latestPayments.length === 0 && <p className="m-0 border-t border-[#F4F4F5] py-2.5 text-sm text-muted">No payments yet.</p>}
    </Section>
  );

  return phone ? (
    <>
      {kpiGrid}
      {attention}
      {chart}
      {top}
      {pays}
    </>
  ) : (
    <>
      {kpiGrid}
      <div className="flex flex-wrap items-start gap-[18px]">
        {attention}
        {chart}
      </div>
      <div className="flex flex-wrap items-start gap-[18px]">
        {top}
        {pays}
      </div>
    </>
  );
}
