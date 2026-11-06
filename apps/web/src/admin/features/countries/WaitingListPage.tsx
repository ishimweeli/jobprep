import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { downloadCsv, getWaitingList, notifyWaitingList, waitingListExportUrl, waitingListKey, type DownloadState, type WaitingCountry } from '../../api/questions-demand';
import { ActionDialog } from '../../components/ActionDialog';
import { AdminShell } from '../../components/AdminShell';
import { EmptyState, ErrorBox, Loader } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Btn, LinkButton, Pager, Pill } from '../../components/ui';
import { COUNTRY_TONE } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { formatCount, formatDateTime } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { pageCount } from '../../lib/queryState';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { canNotify, notifyResult, waitingLine, waitingSearch } from '../exams/demandModel';

const PAGE_SIZE = 25;

/**
 * Waiting list per country (A15, no design): who asked to be told when a country opens. Pick a country to see the people
 * (email, interest, when they joined, whether they were told), export them as a CSV file, and, once the country is Live,
 * tell everyone not yet told that it is open.
 */
export function WaitingListPage() {
  const isDesktop = useIsDesktop();
  const admin = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const code = (sp.get('country') ?? '').toUpperCase() || null;
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const [dl, setDl] = useState<DownloadState>({ state: 'idle' });
  const [notifying, setNotifying] = useState(false);
  const sent = useRef(0);
  const whyWrite = denyHint(admin.permissions, 'countries:write', 'tell the waiting list');

  const list = useQuery({
    queryKey: waitingListKey({ code, page }),
    queryFn: () => getWaitingList({ country: code ?? undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const countries = list.data?.countries ?? [];
  const chosen: WaitingCountry | undefined = countries.find((c) => c.code === code);
  const entries = list.data?.entries ?? [];
  const pages = pageCount(list.data?.total ?? 0, PAGE_SIZE);
  const go = (c: string | null, p = 1) => setSp(new URLSearchParams(waitingSearch(c, p)), { replace: true });

  const exportCsv = async () => {
    if (!chosen) return;
    setDl({ state: 'working' });
    try {
      const fileName = await downloadCsv(waitingListExportUrl(chosen.code), `waiting-list-${chosen.code}.csv`);
      setDl({ state: 'done', fileName });
    } catch (e) {
      setDl({ state: 'error', message: e instanceof Error ? e.message : 'The export could not be made. Try again.' });
    }
  };

  const cards = (
    <section aria-label="Countries with a waiting list" className={cx('flex flex-col gap-2.5', isDesktop && 'min-w-0 flex-[1_1_320px]')}>
      {countries.map((c) => {
        const on = c.code === code;
        const t = COUNTRY_TONE[c.status];
        return (
          <button
            key={c.code}
            type="button"
            aria-pressed={on}
            onClick={() => { setDl({ state: 'idle' }); go(c.code); }}
            className={cx('flex min-h-[64px] cursor-pointer items-center gap-3 rounded-[10px] p-3.5 text-left text-ink', on ? 'border-2 border-brand bg-brand-softer' : 'border border-border bg-white')}
          >
            <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-border bg-page text-[13px] font-semibold text-muted">{c.code}</span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-base font-semibold">{c.name}</span>
              <span className="text-[13px] text-muted">{waitingLine(c)}</span>
            </span>
            <Pill tone={t}>{t.label}</Pill>
          </button>
        );
      })}
    </section>
  );

  const state = list.isPending ? <Loader label="Loading the waiting list…" /> : list.isError ? <div className="p-4"><ErrorBox error={list.error} onRetry={() => void list.refetch()} /></div> : null;

  const detail = chosen ? (
    <section aria-labelledby="wl-t" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3.5 rounded-[16px] border border-border bg-white p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="wl-t" className="m-0 text-[17px]">{chosen.name} · {formatCount(chosen.count)} on the list</h2>
        <div className="flex flex-wrap items-start gap-2">
          <Btn busy={dl.state === 'working'} onClick={() => void exportCsv()}>{dl.state === 'working' ? 'Preparing the file…' : 'Export CSV'}</Btn>
          <Btn
            kind="primary"
            onClick={() => setNotifying(true)}
            whyDisabled={whyWrite ?? (chosen.status !== 'LIVE' ? `Only when ${chosen.name} is Live. It is ${COUNTRY_TONE[chosen.status].label.toLowerCase()} now.` : !canNotify(chosen) ? 'Everyone on the list was told already.' : undefined)}
          >
            Tell them it is open
          </Btn>
        </div>
      </div>
      <p role={dl.state === 'error' ? 'alert' : 'status'} className={cx('m-0 min-h-5 text-sm font-semibold', dl.state === 'error' ? 'text-incorrect' : 'text-correct', dl.state === 'idle' || dl.state === 'working' ? 'sr-only' : '')}>
        {dl.state === 'done' ? `Downloaded ${dl.fileName}` : dl.state === 'error' ? dl.message : ''}
      </p>
      {entries.length === 0 ? (
        <EmptyState title="Nobody is on this list yet." hint="People join from the “Notify me when this country opens” form." />
      ) : isDesktop ? (
        <div className="overflow-x-auto rounded-[10px] border border-border">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="bg-page text-left text-xs text-muted">
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-2 py-3 font-semibold">Interest</th>
                <th className="px-2 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold">Told it is open</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-soft">
                  <td className="break-all px-4 py-2.5 font-semibold">{e.email}</td>
                  <td className="px-2 py-2.5 text-ink-2">{e.interest || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-ink-2">{formatDateTime(e.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-2">{e.notifiedAt ? formatDateTime(e.notifiedAt) : 'Not yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 rounded-[10px] border border-border p-3">
              <span className="break-all text-[15px] font-semibold">{e.email}</span>
              <span className="text-[13px] text-ink-2">{e.interest || 'No interest given'} · joined {formatDateTime(e.createdAt)}</span>
              <span className="text-[13px] text-muted">{e.notifiedAt ? `Told ${formatDateTime(e.notifiedAt)}` : 'Not told yet'}</span>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
          <span>Page {page} of {formatCount(pages)}</span>
          <Pager page={page} pages={pages} onPage={(p) => go(chosen.code, p)} />
        </div>
      )}
    </section>
  ) : null;

  const dialog = notifying && chosen && (
    <ActionDialog
      open
      onClose={() => setNotifying(false)}
      title={`Tell the ${chosen.name} waiting list`}
      confirmLabel="Send emails"
      reasonLabel="Reason"
      reasonHint="Why you are sending it now. Kept in the audit log."
      submit={async (reason) => { sent.current = (await notifyWaitingList({ countryCode: chosen.code, reason })).notified; }}
      onDone={() => {
        toast({ text: notifyResult(sent.current) });
        void qc.invalidateQueries({ queryKey: ['admin', 'waiting-list'] });
        void qc.invalidateQueries({ queryKey: ['admin', 'countries'] });
      }}
      errors={{ country_not_live: `${chosen.name} is not Live yet, so nobody can be told it is open.` }}
    >
      <p className="m-0">
        Everyone on the list who has not been told yet ({formatCount(Math.max(0, chosen.count - chosen.notified))}) gets one email saying {chosen.name} is open. This cannot be undone.
      </p>
    </ActionDialog>
  );

  const back = <LinkButton to="/admin/countries" kind="secondary">Back to countries</LinkButton>;
  const empty = list.data && countries.length === 0 ? <EmptyState title="No countries to show." hint="Only the countries your role covers are listed." /> : null;

  if (!isDesktop) {
    return (
      <AdminShell title="Waiting list" back="/admin/countries">
        <p className="m-0 text-sm text-ink-2">People who asked to be told when a country opens.</p>
        {state}
        {empty}
        {list.data && cards}
        {chosen ? detail : list.data && countries.length > 0 && <p className="m-0 text-sm text-muted">Choose a country to see its list.</p>}
        {dialog}
      </AdminShell>
    );
  }
  return (
    <AdminShell title="Waiting list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Waiting list</h1>
          <span className="text-sm text-muted">People who asked to be told when a country opens.</span>
        </div>
        {back}
      </div>
      {state}
      {empty}
      {list.data && (
        <div className="flex flex-wrap items-start gap-[18px]">
          {cards}
          {detail ?? <div className="min-w-0 flex-[999_1_560px] rounded-[16px] border border-dashed border-input-border bg-white"><EmptyState title="Choose a country" hint="Its list appears here." /></div>}
        </div>
      )}
      {dialog}
    </AdminShell>
  );
}
