import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { closeQuestionReports, getClosedReports, getGroupedReports, reportsKey, type ClosedReport, type ClosedReportsPage, type GroupedReport, type GroupedReportsPage } from '../../api/questions-demand';
import type { ReportStatus } from '../../api/types';
import { ActionDialog } from '../../components/ActionDialog';
import { AdminShell } from '../../components/AdminShell';
import { EmptyState, ErrorBox, Loader } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Btn, FilterChips, LinkButton, Pager } from '../../components/ui';
import { useAdminCountry } from '../../lib/adminCountry';
import { formatCount, formatDay } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { pageCount } from '../../lib/queryState';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { closeBody, countWords, EMPTY_TEXT, latestMessage, parseReportsQuery, reportsSearch, STATUS_CHIPS, summaryLine } from './reportsModel';
import { excerpt } from './questionForm';

const PAGE_SIZE = 25;

type Pending = { action: 'resolve' | 'dismiss'; group: GroupedReport } | null;

/**
 * Candidate reports queue (A11, no design): the questions candidates reported, most reported first. Open → the question
 * editor ("Publish change & resolve reports" closes them), or close them here: "Resolve without changes" or "Dismiss" with
 * a reason. Resolved and Dismissed list the closed reports with who reported and the note. Reports of one question are
 * closed together.
 */
export function ReportsPage() {
  const isDesktop = useIsDesktop();
  const admin = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const query = parseReportsQuery(sp);
  const { country } = useAdminCountry();
  const [pending, setPending] = useState<Pending>(null);
  const why = denyHint(admin.permissions, 'reports:resolve', 'close reports');
  const grouped = query.status === 'OPEN';

  const list = useQuery<GroupedReportsPage | ClosedReportsPage>({
    queryKey: reportsKey({ ...query, country }),
    queryFn: () => (grouped
      ? getGroupedReports({ status: 'OPEN', country, page: query.page, pageSize: PAGE_SIZE })
      : getClosedReports({ status: query.status, country, page: query.page, pageSize: PAGE_SIZE })),
    placeholderData: keepPreviousData,
  });
  const setQuery = (next: Partial<typeof query>) => setSp(new URLSearchParams(reportsSearch(next, query)), { replace: true });
  const data = list.data;
  const total = data?.total ?? 0;
  const pages = pageCount(total, PAGE_SIZE);
  const empty = EMPTY_TEXT[query.status];
  const chips = <FilterChips label="Report status" items={STATUS_CHIPS} value={query.status} onPick={(v) => setQuery({ status: v as ReportStatus })} scroll={!isDesktop} />;

  const openLink = (testId: string, questionId: string, size: 'sm' | 'md' | 'lg' = 'md') => (
    <LinkButton to={`/admin/exams/${testId}/q/${questionId}`} kind="outline-brand" size={size}>Open question</LinkButton>
  );
  const closers = (g: GroupedReport, size: 'sm' | 'md' | 'lg') => (
    <>
      <Btn size={size} whyDisabled={why} onClick={() => setPending({ action: 'resolve', group: g })}>Resolve without changes</Btn>
      <Btn size={size} kind="danger" whyDisabled={why} onClick={() => setPending({ action: 'dismiss', group: g })}>Dismiss</Btn>
    </>
  );

  const state = list.isPending ? <Loader label="Loading reports…" /> : list.isError ? <div className="p-4"><ErrorBox error={list.error} onRetry={() => void list.refetch()} /></div> : null;
  const none = data && data.results.length === 0 ? <EmptyState title={empty.title} hint={empty.hint} /> : null;

  const dialog = pending && (
    <ActionDialog
      open
      onClose={() => setPending(null)}
      title={pending.action === 'dismiss' ? 'Dismiss these reports?' : 'Resolve these reports without changes?'}
      confirmLabel={pending.action === 'dismiss' ? 'Dismiss reports' : 'Resolve reports'}
      kind={pending.action === 'dismiss' ? 'danger' : 'primary'}
      reasonLabel={pending.action === 'dismiss' ? 'Why are you dismissing them?' : 'Note (optional)'}
      reasonHint={pending.action === 'dismiss' ? 'Required. Kept with the report and in the audit log.' : 'Leave it empty if there is nothing to add.'}
      reason={pending.action === 'dismiss'}
      submit={(reason) => closeQuestionReports(pending.group.question.id, closeBody(pending.action, reason))}
      onDone={() => {
        const n = pending.group.count;
        toast({ text: `${pending.action === 'dismiss' ? 'Dismissed' : 'Resolved'} ${n} ${n === 1 ? 'report' : 'reports'} on question ${pending.group.question.number}.` });
        void qc.invalidateQueries({ queryKey: ['admin', 'reports-queue'] });
        void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
        void qc.invalidateQueries({ queryKey: ['admin', 'exams'] });
        void qc.invalidateQueries({ queryKey: ['admin', 'mock-test', pending.group.mockTest.id] });
      }}
      errors={{ report_already_closed: 'These reports were already closed. Reload the page.', question_not_found: 'This question no longer exists.', reason_required: 'Write why you are dismissing them.' }}
    >
      <p className="m-0">
        <strong>{pending.group.mockTest.title}</strong>, question {pending.group.question.number}: {countWords(pending.group.count).toLowerCase()}.
      </p>
      <p className="m-0">
        {pending.action === 'dismiss'
          ? 'The question stays as it is. The reports are closed as dismissed and the reason is recorded.'
          : 'The question stays as it is. The reports are closed as resolved. To change the question and close the reports in one step, open the question instead.'}
      </p>
    </ActionDialog>
  );

  const groupedRows = (data?.results ?? []) as GroupedReport[];
  const closedRows = (data?.results ?? []) as ClosedReport[];

  if (!isDesktop) {
    return (
      <AdminShell title="Reports" back="/admin/exams" headerExtra={chips}>
        {state}
        {data && <span className="text-[13px] font-semibold text-muted" aria-live="polite">{summaryLine(query.status, total)}</span>}
        {none && <div className="rounded-[14px] border border-dashed border-input-border bg-white">{none}</div>}
        {grouped && groupedRows.map((g) => (
          <article key={g.question.id} className="flex flex-col gap-2 rounded-[14px] border border-border bg-white p-3.5">
            <span className="text-[13px] font-semibold text-muted">{g.mockTest.title} · Question {g.question.number}</span>
            <span className="text-[15px] font-semibold">{excerpt(g.question.stem, 110)}</span>
            <span className="text-[13px] text-flagged">{countWords(g.count)} · {formatDay(g.latestAt)}</span>
            <span className="text-[13px] text-ink-2">“{latestMessage(g)}”</span>
            <div className="flex flex-col gap-2">
              {openLink(g.mockTest.id, g.question.id, 'lg')}
              {closers(g, 'lg')}
            </div>
          </article>
        ))}
        {!grouped && closedRows.map((r) => (
          <article key={r.id} className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-white p-3.5">
            <span className="text-[13px] font-semibold text-muted">{r.mockTest.title} · Question {r.question.number}</span>
            <span className="text-[15px] font-semibold">{excerpt(r.question.stem, 110)}</span>
            <span className="text-[13px] text-ink-2">“{r.message?.trim() || 'No message'}” · {r.reporter ? r.reporter.name : 'Guest'} · {formatDay(r.createdAt)}</span>
            {r.resolutionNote && <span className="text-[13px] text-muted">Note: {r.resolutionNote}</span>}
            <Link to={`/admin/exams/${r.mockTest.id}/q/${r.question.id}`} className="py-2 text-sm font-semibold">Open question</Link>
          </article>
        ))}
        {data && pages > 1 && (
          <div className="flex items-center justify-between text-[13px] text-muted">
            <span>Page {query.page} of {formatCount(pages)}</span>
            <Pager page={query.page} pages={pages} onPage={(p) => setQuery({ page: p })} />
          </div>
        )}
        {dialog}
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Reported questions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Reported questions</h1>
          <span className="text-sm text-muted" aria-live="polite">{data ? summaryLine(query.status, total) : ' '}</span>
        </div>
        <LinkButton to="/admin/exams" kind="secondary">Back to exams</LinkButton>
      </div>
      {chips}
      <section aria-label="Reports" className="overflow-hidden rounded-[16px] border border-border bg-white">
        {state ?? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr className="bg-page text-left text-xs text-muted">
                    <th className="px-4 py-3 font-semibold">Mock test</th>
                    <th className="px-2 py-3 font-semibold">Question</th>
                    <th className="px-2 py-3 font-semibold">{grouped ? 'Reports' : 'Reported by'}</th>
                    <th className="px-2 py-3 font-semibold">{grouped ? 'Latest message' : 'Message and note'}</th>
                    <th className="px-2 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped && groupedRows.map((g) => (
                    <tr key={g.question.id} className="border-t border-soft align-top">
                      <td className="px-4 py-3 font-semibold">{g.mockTest.title}</td>
                      <td className="px-2 py-3"><span className="text-muted">Q{g.question.number}</span> {excerpt(g.question.stem, 80)}</td>
                      <td className="whitespace-nowrap px-2 py-3 font-semibold text-flagged">{countWords(g.count)}</td>
                      <td className="px-2 py-3 text-ink-2">“{latestMessage(g)}”</td>
                      <td className="whitespace-nowrap px-2 py-3 text-ink-2">{formatDay(g.latestAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">{openLink(g.mockTest.id, g.question.id, 'sm')}{closers(g, 'sm')}</div>
                      </td>
                    </tr>
                  ))}
                  {!grouped && closedRows.map((r) => (
                    <tr key={r.id} className="border-t border-soft align-top">
                      <td className="px-4 py-3 font-semibold">{r.mockTest.title}</td>
                      <td className="px-2 py-3"><span className="text-muted">Q{r.question.number}</span> {excerpt(r.question.stem, 80)}</td>
                      <td className="px-2 py-3">{r.reporter ? <span className="flex flex-col"><span>{r.reporter.name}</span><span className="text-xs text-muted">{r.reporter.email}</span></span> : <span className="text-muted">Guest</span>}</td>
                      <td className="px-2 py-3 text-ink-2">“{r.message?.trim() || 'No message'}”{r.resolutionNote && <span className="block text-xs text-muted">Note: {r.resolutionNote}</span>}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-ink-2">{formatDay(r.createdAt)}</td>
                      <td className="px-4 py-3 text-right">{openLink(r.mockTest.id, r.question.id, 'sm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {none}
            {pages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted">
                <span>Page {query.page} of {formatCount(pages)}</span>
                <Pager page={query.page} pages={pages} onPage={(p) => setQuery({ page: p })} />
              </div>
            )}
          </>
        )}
      </section>
      <p className="m-0 text-[13px] text-muted">
        Open a question to change it: “Publish change &amp; resolve reports” closes its reports. Dismiss when the question is fine; the reason is recorded.
      </p>
      {dialog}
    </AdminShell>
  );
}
