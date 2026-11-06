import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCountries, getCountry, getPayments, keys } from '../../api/admin';
import type { PaymentRow, PaymentTab } from '../../api/types';
import { AdminShell } from '../../components/AdminShell';
import { EmptyState, ErrorBox, Loader } from '../../components/states';
import { Btn, FilterChips, Pager, Pill } from '../../components/ui';
import { paymentNote, paymentTone } from '../../lib/badges';
import { denyHint } from '../../lib/permissions';
import { cx } from '../../lib/cx';
import { formatCount, formatDateTime, formatLocalPhone, formatTime, formatTotals } from '../../lib/format';
import { pageCount, parsePaymentsQuery, paymentsSearch } from '../../lib/queryState';
import { useAdminCountry } from '../../lib/adminCountry';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { StuckBadge } from './PaymentBits';
import { ExportDialog, ManualGrantDialog, useCheckPayment } from './PaymentDialogs';
import { canGrantByHand, type GrantTarget } from './paymentsModel';

const PAGE_SIZE = 25;

export { checkResultText } from './paymentsModel';

/** What the manual-grant dialog shows about a list row. */
export const grantTargetOf = (p: PaymentRow): GrantTarget => ({
  id: p.id, candidate: p.user.name, priceLabel: p.priceLabel ?? 'Amount not set', providerLabel: p.providerLabel, msisdn: p.msisdn,
  ageMinutes: p.waitingMinutes ?? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60_000)),
});

function Actions({ p, phone, check, onGrant }: { p: PaymentRow; phone: boolean; check: ReturnType<typeof useCheckPayment>; onGrant: (p: PaymentRow) => void }) {
  const { permissions } = useAdmin();
  const canCheck = permissions.includes('payments:check');
  const busy = check.busyId === p.id;
  const grantHint = denyHint(permissions, 'payments:grant', 'grant access by hand');
  const size = phone ? 'min-h-11 rounded-[10px] text-[15px] font-semibold' : 'min-h-9 rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap';
  const showGrant = p.actions.includes('grant') || (p.stuck && canGrantByHand(p.status, p.stuck));
  return (
    <div className={cx('flex flex-col gap-1.5', phone ? 'items-stretch' : 'items-end')}>
      {p.actions.includes('check') && canCheck && (
        <button
          type="button"
          onClick={() => check.run({ id: p.id, status: p.status })}
          disabled={busy}
          aria-busy={busy || undefined}
          className={cx('inline-flex items-center justify-center border border-brand bg-white text-brand disabled:opacity-60', size)}
        >
          {busy ? 'Checking…' : 'Check status'}
        </button>
      )}
      {showGrant && (
        <Btn kind="outline-brand" className={size} onClick={() => onGrant(p)} whyDisabled={grantHint} aria-label={`Grant access manually to ${p.user.name}`}>
          Grant access manually
        </Btn>
      )}
    </div>
  );
}

export function PaymentsPage() {
  const isDesktop = useIsDesktop();
  const admin = useAdmin();
  const [sp, setSp] = useSearchParams();
  const query = parsePaymentsQuery(sp);
  const check = useCheckPayment();
  const [grant, setGrant] = useState<PaymentRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const { country: filterCountry } = useAdminCountry();
  const canUsers = admin.permissions.includes('users:read');
  const canCountries = admin.permissions.includes('countries:read');

  const list = useQuery({
    queryKey: keys.payments({ ...query, country: filterCountry }),
    queryFn: () =>
      getPayments({ status: query.status, stuck: query.stuck, provider: query.provider || undefined, country: filterCountry, q: query.q || undefined, page: query.page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  // The page's one-line summary ("Full Access · RWF 2,000 · MTN MoMo and Airtel Money") comes from the live country's plan.
  const countries = useQuery({ queryKey: keys.countries, queryFn: getCountries, enabled: canCountries && isDesktop, staleTime: 5 * 60_000 });
  const live = countries.data?.countries.find((c) => c.status === 'LIVE');
  const country = useQuery({ queryKey: keys.country(live?.code ?? ''), queryFn: () => getCountry(live!.code), enabled: !!live, staleTime: 5 * 60_000 });
  const summaryLine = country.data
    ? ['Full Access', country.data.plan?.priceLabel, country.data.paymentMethods.map((m) => m.label).join(' and ')].filter(Boolean).join(' · ')
    : ' ';

  const setQuery = (next: Partial<typeof query>) => setSp(new URLSearchParams(paymentsSearch(next, query)), { replace: true });
  const data = list.data;
  const pending = data?.summary.pendingNow ?? 0;
  const tabs: { value: PaymentTab; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: `Pending (${pending})` },
    { value: 'paid', label: 'Paid' },
    { value: 'failed', label: 'Failed' },
  ];
  const rows = data?.results ?? [];
  const pages = pageCount(data?.total ?? 0, PAGE_SIZE);
  const sums = data
    ? [
        { k: 'Paid today', v: formatTotals(data.summary.paidToday) },
        { k: 'Successful payments today', v: formatCount(data.summary.successfulToday) },
        { k: 'Pending now', v: formatCount(data.summary.pendingNow) },
        { k: 'Failed or expired today', v: formatCount(data.summary.failedOrExpiredToday) },
      ]
    : [];
  const clearFilters = () => setSp(new URLSearchParams(), { replace: true });
  const filtered = query.status !== 'all' || query.stuck || !!query.q || !!query.provider;
  const empty = (
    <EmptyState
      title="No payments match."
      hint={filtered ? 'Try another status, or clear the filters.' : 'Payments appear here as candidates pay.'}
      action={filtered ? <Btn onClick={clearFilters}>Clear filters</Btn> : undefined}
    />
  );
  const dialogs = (
    <>
      {check.dialog}
      <ManualGrantDialog target={grant ? grantTargetOf(grant) : null} onClose={() => setGrant(null)} />
      <ExportDialog open={exporting} onClose={() => setExporting(false)} />
    </>
  );
  const pick = (v: string) => setQuery({ status: v as PaymentTab, stuck: false });

  const state = list.isPending ? <Loader label="Loading payments…" /> : list.isError ? <ErrorBox error={list.error} onRetry={() => void list.refetch()} /> : null;

  if (!isDesktop) {
    return (
      <AdminShell title="Payments" headerExtra={<FilterChips label="Status" items={tabs} value={query.status} onPick={pick} scroll />}>
        {state}
        {data && (
          <div className="grid grid-cols-2 gap-2.5">
            {[sums[0], sums[2]].map((s) => (
              <div key={s!.k} className="rounded-[10px] border border-border bg-white p-3">
                <span className="block text-xs font-semibold text-muted">{s!.k}</span>
                <span className="text-xl font-semibold">{s!.v}</span>
              </div>
            ))}
          </div>
        )}
        <Btn onClick={() => setExporting(true)} className="w-full">Export for accounting</Btn>
        {data && rows.length === 0 && <div className="rounded-[14px] border border-dashed border-input-border bg-white">{empty}</div>}
        {rows.map((p) => {
          const t = paymentTone(p.status);
          return (
            <article key={p.id} className={cx('flex flex-col gap-2 rounded-[14px] border p-3.5', p.stuck ? 'border-flagged-line bg-flagged-bg' : 'border-border bg-white')}>
              <div className="flex items-start justify-between gap-2.5">
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold">{p.user.name}</span>
                  <span className="break-all text-[13px] text-muted">{p.user.email} · {p.providerLabel}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Pill tone={t}>{t.label}</Pill>
                  {p.stuck && <StuckBadge />}
                </span>
              </div>
              <span className="text-[13px] text-ink-2">{[p.priceLabel, formatLocalPhone(p.msisdn), formatTime(p.createdAt), paymentNote(p, true)].filter(Boolean).join(' · ')}</span>
              {p.actions.length > 0 && <Actions p={p} phone check={check} onGrant={setGrant} />}
              <Link to={`/admin/payments/${p.id}`} aria-label={`Details of the payment by ${p.user.name}`} className="inline-flex min-h-11 items-center self-start text-[15px] font-semibold">
                Details
              </Link>
            </article>
          );
        })}
        {data && pages > 1 && (
          <div className="flex items-center justify-between text-[13px] text-muted">
            <span>Page {query.page} of {formatCount(pages)}</span>
            <Pager page={query.page} pages={pages} onPage={(p) => setQuery({ page: p })} />
          </div>
        )}
        {dialogs}
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Payments">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Payments</h1>
          <span className="text-sm text-muted">{summaryLine}</span>
        </div>
        <Btn onClick={() => setExporting(true)}>Export for accounting</Btn>
      </div>

      {data && (
        <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-3">
          {sums.map((s) => (
            <div key={s.k} className="flex flex-col gap-0.5 rounded-[14px] border border-border bg-white p-4">
              <dt className="text-[13px] font-semibold text-muted">{s.k}</dt>
              <dd className="m-0 text-2xl font-semibold tabular">{s.v}</dd>
            </div>
          ))}
        </dl>
      )}

      <FilterChips label="Status" items={tabs} value={query.status} onPick={pick} />

      <section aria-label="Payment list" className="overflow-hidden rounded-[16px] border border-border bg-white">
        {state ?? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr className="bg-page text-left text-xs text-muted">
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-2 py-3 font-semibold">Candidate</th>
                    <th className="px-2 py-3 font-semibold">Provider</th>
                    <th className="px-2 py-3 text-right font-semibold">Amount</th>
                    <th className="px-2 py-3 font-semibold">Status</th>
                    <th className="px-2 py-3 font-semibold">Reference</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const t = paymentTone(p.status);
                    return (
                      <tr key={p.id} className={cx('border-t border-soft align-top', p.stuck ? 'bg-flagged-bg' : 'bg-white')}>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-2">
                          <Link to={`/admin/payments/${p.id}`} aria-label={`Payment details, ${formatDateTime(p.createdAt)}`} className="text-ink-2 underline">
                            {formatDateTime(p.createdAt)}
                          </Link>
                        </td>
                        <td className="px-2 py-3">
                          <span className="flex flex-col">
                            {canUsers ? <Link to={`/admin/users/${p.user.id}`} className="font-semibold no-underline">{p.user.name}</Link> : <span className="font-semibold">{p.user.name}</span>}
                            <span className="text-xs text-muted">{p.user.email}</span>
                          </span>
                        </td>
                        <td className="px-2 py-3"><span className="flex flex-col">{p.providerLabel}<span className="text-xs text-muted">{formatLocalPhone(p.msisdn)}</span></span></td>
                        <td className="px-2 py-3 text-right tabular">{p.priceLabel}</td>
                        <td className="px-2 py-3">
                          <span className="inline-flex flex-col gap-0.5">
                            <span className="flex flex-wrap items-center gap-1">
                              <Pill tone={t} className="self-start px-[9px] py-[3px]">{t.label}</Pill>
                              {p.stuck && <StuckBadge />}
                            </span>
                            <span className="text-xs text-muted">{paymentNote(p)}</span>
                          </span>
                        </td>
                        <td className="px-2 py-3 font-mono text-xs text-ink-2">{p.reference}</td>
                        <td className="px-4 py-3 text-right">{p.actions.length > 0 && <Actions p={p} phone={false} check={check} onGrant={setGrant} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && empty}
            {pages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted">
                <span>Page {query.page} of {formatCount(pages)}</span>
                <Pager page={query.page} pages={pages} onPage={(p) => setQuery({ page: p })} />
              </div>
            )}
          </>
        )}
      </section>
      {dialogs}
      <p className="m-0 text-[13px] text-muted">
        Access is granted automatically when the provider confirms. “Grant access manually” is for confirmed payments whose callback never arrived, and asks for the provider transaction ID.
      </p>
    </AdminShell>
  );
}
