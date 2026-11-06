import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAuditList, keys } from '../../api/admin';
import { auditExportUrl, getAuditEntry, getAuditFilters } from '../../api/governance';
import { downloadCsv, type DownloadState } from '../../api/questions-demand';
import type { AuditEntry } from '../../api/types';
import { AdminDialog } from '../../components/AdminDialog';
import { AdminShell } from '../../components/AdminShell';
import { SelectField, TextField } from '../../components/forms';
import { EmptyState, ErrorBox, Loader } from '../../components/states';
import { Btn, Pager } from '../../components/ui';
import { COUNTRY_NAMES, formatCount, formatDateTime } from '../../lib/format';
import { allowedCountryCodes } from '../../lib/adminCountry';
import { pageCount } from '../../lib/queryState';
import { useDebouncedSearch } from '../../lib/useDebouncedSearch';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { actionLabel, auditSearch, dateRangeProblem, detailRows, hasBeforeAfter, hasFilters, parseAuditQuery, toApiQuery } from './auditModel';

const PAGE_SIZE = 25;

/** The details of one entry: who, when, what, the reason, before and after, and everything else the API stored. */
function EntryDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['admin', 'audit-entry', id], queryFn: () => getAuditEntry(id!), enabled: !!id });
  const e = q.data;
  const rows = e ? detailRows(e.metadata).filter((r) => r.key !== 'from' && r.key !== 'to') : [];
  return (
    <AdminDialog open={!!id} onClose={onClose} title="Audit entry" wide>
      {q.isPending ? (
        <Loader label="Loading the entry…" />
      ) : q.isError || !e ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-3 text-[15px]">
          <p className="m-0"><strong>{e.actor?.name ?? 'System'}</strong> {e.summary}</p>
          <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted">When</dt><dd className="m-0">{formatDateTime(e.at)} (Kigali time)</dd>
            <dt className="text-muted">Who</dt><dd className="m-0 break-all">{e.actor ? `${e.actor.name}${e.actor.email ? ` · ${e.actor.email}` : ''}` : 'System'}</dd>
            <dt className="text-muted">Action</dt><dd className="m-0">{actionLabel(e.action)}</dd>
            <dt className="text-muted">About</dt><dd className="m-0 break-all">{e.entityType}{e.entityId ? ` · ${e.entityId}` : ''}</dd>
            <dt className="text-muted">Country</dt><dd className="m-0">{e.countryCode ? COUNTRY_NAMES[e.countryCode] ?? e.countryCode : 'All'}</dd>
            <dt className="text-muted">Reason</dt><dd className="m-0">{e.reason ?? 'None given'}</dd>
          </dl>
          {hasBeforeAfter(e.metadata) && (
            <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2">
              <div className="rounded-[10px] border border-border bg-page p-3"><span className="block text-xs font-semibold text-muted">Before</span>{detailRows(e.metadata).find((r) => r.key === 'from')?.value}</div>
              <div className="rounded-[10px] border border-border bg-page p-3"><span className="block text-xs font-semibold text-muted">After</span>{detailRows(e.metadata).find((r) => r.key === 'to')?.value}</div>
            </div>
          )}
          {rows.length > 0 && (
            <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 border-t border-soft pt-3 text-sm">
              {rows.map((r) => (
                <div key={r.key} className="contents"><dt className="text-muted">{r.label}</dt><dd className="m-0 break-words">{r.value}</dd></div>
              ))}
            </dl>
          )}
          <div className="flex justify-end"><Btn kind="primary" onClick={onClose}>Close</Btn></div>
        </div>
      )}
    </AdminDialog>
  );
}

/**
 * The audit log (A12, no design). Everything the admins did: who, what, which entity, country, reason, time. Filters
 * (search, who, action, country, dates) live in the query string; a row opens its details (with before and after where
 * the entry has them); the current filters can be exported as CSV (the export is itself written to the log). Only roles with
 * `audit:read` (the System admin) reach it: anyone else sees the "You do not have access to this" page.
 */
export function AuditPage() {
  const isDesktop = useIsDesktop();
  const admin = useAdmin();
  const [sp, setSp] = useSearchParams();
  const f = parseAuditQuery(sp);
  // Two filters changed within one render (a date typed right after another) must both land: build each change on the
  // latest one, not on the filters of the render that was on screen when it was made.
  const latest = useRef(f);
  const search = sp.toString();
  useEffect(() => {
    latest.current = parseAuditQuery(new URLSearchParams(search));
  }, [search]);
  const setF = (next: Partial<typeof f>) => {
    const href = auditSearch(next, latest.current);
    latest.current = parseAuditQuery(new URLSearchParams(href));
    setSp(new URLSearchParams(href), { replace: true });
  };
  const [text, setText] = useDebouncedSearch(f.q, (q) => setF({ q }));
  const [open, setOpen] = useState<string | null>(null);
  const [dl, setDl] = useState<DownloadState>({ state: 'idle' });

  const filters = useQuery({ queryKey: ['admin', 'audit-filters'], queryFn: getAuditFilters, staleTime: 60_000 });
  const apiQuery = toApiQuery(f, PAGE_SIZE);
  const range = dateRangeProblem(f);
  const list = useQuery({ queryKey: keys.auditList(apiQuery as Record<string, unknown>), queryFn: () => getAuditList(apiQuery), placeholderData: keepPreviousData, enabled: !range });

  const rows = list.data?.results ?? [];
  const total = list.data?.total ?? 0;
  const pages = pageCount(total, PAGE_SIZE);
  const countries = allowedCountryCodes(admin.countryScope);

  const runExport = async () => {
    setDl({ state: 'working' });
    try {
      const fileName = await downloadCsv(auditExportUrl(toApiQuery(f, PAGE_SIZE, false)), 'audit-log.csv');
      setDl({ state: 'done', fileName });
    } catch (e) {
      setDl({ state: 'error', message: e instanceof Error ? e.message : 'The export could not be made. Try again.' });
    }
  };

  const filterBar = (
    <div className="grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-white p-4 min-[560px]:grid-cols-2 min-[1100px]:grid-cols-4">
      <TextField label="Search" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Action, reason or person" className="min-[1100px]:col-span-2" />
      <SelectField label="Who" value={f.actor} onChange={(e) => setF({ actor: e.target.value })}>
        <option value="">Everyone</option>
        {(filters.data?.actors ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </SelectField>
      <SelectField label="Action" value={f.action} onChange={(e) => setF({ action: e.target.value })}>
        <option value="">Any action</option>
        {(filters.data?.actions ?? []).map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
      </SelectField>
      <SelectField label="Country" value={f.country} onChange={(e) => setF({ country: e.target.value })}>
        <option value="">All countries</option>
        {countries.map((c) => <option key={c} value={c}>{COUNTRY_NAMES[c] ?? c}</option>)}
      </SelectField>
      <TextField label="From" type="date" value={f.from} onChange={(e) => setF({ from: e.target.value })} />
      <TextField label="To" type="date" value={f.to} error={range} onChange={(e) => setF({ to: e.target.value })} />
      <div className="flex flex-wrap items-end gap-2">
        <Btn onClick={() => { setText(''); setSp(new URLSearchParams(), { replace: true }); }} disabled={!hasFilters(f)}>Clear filters</Btn>
        <Btn onClick={() => void runExport()} busy={dl.state === 'working'}>Export CSV</Btn>
      </div>
    </div>
  );

  const exportNote = (
    <p role={dl.state === 'error' ? 'alert' : 'status'} className={dl.state === 'error' ? 'm-0 text-sm font-semibold text-incorrect' : 'm-0 text-sm text-muted'}>
      {dl.state === 'working' ? 'Preparing the file…' : dl.state === 'done' ? `Downloaded ${dl.fileName}. The export is recorded in this log.` : dl.state === 'error' ? dl.message : ''}
    </p>
  );

  const body = list.isPending && !range ? (
    <Loader label="Loading the audit log…" />
  ) : list.isError ? (
    <div className="p-4"><ErrorBox error={list.error} onRetry={() => void list.refetch()} /></div>
  ) : rows.length === 0 ? (
    <EmptyState title={hasFilters(f) ? 'No entries match these filters.' : 'Nothing has been recorded yet.'} action={hasFilters(f) ? <Btn onClick={() => { setText(''); setSp(new URLSearchParams(), { replace: true }); }}>Clear filters</Btn> : undefined} />
  ) : null;

  const pager = pages > 1 && (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted">
      <span>Page {f.page} of {formatCount(pages)} · {formatCount(total)} entries</span>
      <Pager page={f.page} pages={pages} onPage={(p) => setF({ page: p })} />
    </div>
  );

  const detailBtn = (e: AuditEntry) => <Btn size="sm" onClick={() => setOpen(e.id)} aria-label={`Details of: ${e.actor?.name ?? 'System'} ${e.summary}`}>Details</Btn>;

  const intro = <span className="text-sm text-muted">Every sensitive action, with who did it and why. Only System admins can see this page.</span>;

  if (!isDesktop) {
    return (
      <AdminShell title="Audit log" back="/admin/settings">
        {intro}
        {filterBar}
        {exportNote}
        {body ?? rows.map((e) => (
          <article key={e.id} className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-white p-3.5">
            <span className="text-sm"><strong>{e.actor?.name ?? 'System'}</strong> {e.summary}</span>
            <span className="text-xs text-muted">{formatDateTime(e.at)}{e.countryCode ? ` · ${COUNTRY_NAMES[e.countryCode] ?? e.countryCode}` : ''}</span>
            <span>{detailBtn(e)}</span>
          </article>
        ))}
        {!body && pager}
        <EntryDialog id={open} onClose={() => setOpen(null)} />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Audit log">
      <div className="flex flex-col gap-0.5">
        <h1 className="m-0 text-[28px] tracking-[-0.02em]">Audit log</h1>
        {intro}
      </div>
      {filterBar}
      {exportNote}
      <section aria-label="Audit entries" className="overflow-hidden rounded-[16px] border border-border bg-white">
        {body ?? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="bg-page text-left text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-2 py-3 font-semibold">Who</th>
                  <th className="px-2 py-3 font-semibold">What</th>
                  <th className="px-2 py-3 font-semibold">Country</th>
                  <th className="px-2 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 text-right font-semibold"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-soft align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-2">{formatDateTime(e.at)}</td>
                    <td className="px-2 py-3 font-semibold">{e.actor?.name ?? 'System'}</td>
                    <td className="px-2 py-3">{e.summary}<span className="block text-xs text-muted">{actionLabel(e.action)}</span></td>
                    <td className="px-2 py-3 text-ink-2">{e.countryCode ?? '—'}</td>
                    <td className="max-w-[240px] px-2 py-3 text-ink-2">{e.reason ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{detailBtn(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!body && pager}
      </section>
      <EntryDialog id={open} onClose={() => setOpen(null)} />
    </AdminShell>
  );
}

