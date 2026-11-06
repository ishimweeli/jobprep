import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getExams } from '../../api/admin';
import { examRequestsKey, getCountryOptions, getExamRequests, markExamRequestDone, type ExamRequestGroup } from '../../api/questions-demand';
import { ActionDialog } from '../../components/ActionDialog';
import { AdminShell } from '../../components/AdminShell';
import { CheckField, SelectField, TextAreaField } from '../../components/forms';
import { EmptyState, ErrorBox, Loader } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Btn, FilterChips, LinkButton, Pager, Pill } from '../../components/ui';
import { useAdminCountry } from '../../lib/adminCountry';
import { countryName, formatCount, formatDay } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { pageCount } from '../../lib/queryState';
import { useDebouncedSearch } from '../../lib/useDebouncedSearch';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { doneNote, emailWords, markDoneBody, markDoneResult, parseRequestsQuery, planExamUrl, requestCounts, requestsSearch } from './demandModel';

const PAGE_SIZE = 25;

/** "Mark done": optional note, optional "email the people who asked", optional link to the mock test that now exists. */
function MarkDoneDialog({ group, onClose }: { group: ExamRequestGroup; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(false);
  const [testId, setTestId] = useState('');
  const result = useRef<{ marked: number; notified: number } | null>(null);
  const tests = useQuery({ queryKey: ['admin', 'exams', { requestsFor: group.countryCode }], queryFn: () => getExams({ country: group.countryCode, pageSize: 100 }) });
  return (
    <ActionDialog
      open
      onClose={onClose}
      title="Mark this request done"
      confirmLabel="Mark done"
      reason={false}
      note="This is recorded in the audit log."
      fields={
        <>
          <SelectField label="Mock test that answers it" optional hint="Pick it if the test now exists." value={testId} onChange={(e) => setTestId(e.target.value)}>
            <option value="">No mock test chosen</option>
            {(tests.data?.results ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </SelectField>
          <CheckField
            label={group.withEmail > 0 ? `Email the people who left an address (${group.withEmail})` : 'Email the people who left an address'}
            hint={group.withEmail > 0 ? 'Each gets a short email saying the test they asked for was added.' : 'Nobody left an email address, so nobody can be told.'}
            checked={notify}
            disabled={group.withEmail === 0}
            onChange={(e) => setNotify(e.target.checked)}
          />
          <TextAreaField label="Note" optional rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </>
      }
      submit={async () => {
        result.current = await markExamRequestDone(markDoneBody(group, { reason: note, notify, mockTestId: testId }));
      }}
      onDone={() => {
        if (result.current) toast({ text: markDoneResult(result.current) });
        void qc.invalidateQueries({ queryKey: ['admin', 'exam-requests'] });
        void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
      }}
      errors={{ request_not_found: 'These requests are not there any more. Reload the page.' }}
    >
      <p className="m-0"><strong>{group.query}</strong> in {countryName(group.countryCode)}: {requestCounts(group)}. All of them are marked done together.</p>
    </ActionDialog>
  );
}

/**
 * Exam requests (A15, no design): what candidates asked for and no mock test covers, grouped by search ("Veterinary
 * officer — 7 requests, last 1 Nov"), most requested first. "Plan exam" opens the mock-test form with the search as the
 * title; "Mark done" closes the group and can email the people who left an address.
 */
export function RequestsPage() {
  const isDesktop = useIsDesktop();
  const admin = useAdmin();
  const [sp, setSp] = useSearchParams();
  const query = parseRequestsQuery(sp);
  const { country, setCountry, canChooseAll } = useAdminCountry();
  const [marking, setMarking] = useState<ExamRequestGroup | null>(null);
  const why = denyHint(admin.permissions, 'exams:write', 'plan exams or mark requests done');

  const options = useQuery({ queryKey: ['admin', 'country-options'], queryFn: getCountryOptions, staleTime: 5 * 60_000 });
  const list = useQuery({
    queryKey: examRequestsKey({ ...query, country }),
    queryFn: () => getExamRequests({ status: query.status, country, q: query.q || undefined, page: query.page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const setQuery = (next: Partial<typeof query>) => {
    const out = new URLSearchParams(requestsSearch(next, query));
    const c = sp.get('country');
    if (c) out.set('country', c);
    setSp(out, { replace: true });
  };
  const [text, setText] = useDebouncedSearch(query.q, (q) => setQuery({ q }));
  const rows = list.data?.results ?? [];
  const total = list.data?.total ?? 0;
  const pages = pageCount(total, PAGE_SIZE);
  const open = query.status === 'open';

  const filters = (
    <FilterChips label="Request status" items={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }]} value={query.status} onPick={(v) => setQuery({ status: v as 'open' | 'done' })} scroll={!isDesktop} />
  );
  const search = (
    <>
      <label htmlFor="rq-q" className="sr-only">Search requests</label>
      <input id="rq-q" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search what was asked for" className="h-11 min-w-0 flex-[1_1_240px] rounded-[10px] border border-input-border bg-white px-3.5 text-[15px] text-ink" />
    </>
  );
  const countrySel = (
    <>
      <label htmlFor="rq-c" className="sr-only">Country</label>
      <select id="rq-c" value={country ?? ''} onChange={(e) => setCountry(e.target.value)} className="h-11 rounded-[10px] border border-input-border bg-white px-3 text-[15px] font-semibold text-ink">
        {canChooseAll && <option value="">All countries</option>}
        {(options.data ?? [{ code: country ?? 'RW', name: countryName(country ?? 'RW'), status: 'LIVE' as const }]).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>
    </>
  );

  const state = list.isPending ? <Loader label="Loading requests…" /> : list.isError ? <div className="p-4"><ErrorBox error={list.error} onRetry={() => void list.refetch()} /></div> : null;
  const none = list.data && rows.length === 0 ? (
    <EmptyState
      title={open ? (query.q ? 'No open request matches this search.' : 'No open exam requests.') : 'Nothing is marked done yet.'}
      hint={open ? 'When candidates ask for an exam we do not have, it appears here.' : undefined}
    />
  ) : null;

  const actions = (g: ExamRequestGroup, size: 'sm' | 'lg') =>
    open ? (
      <>
        {admin.permissions.includes('exams:write')
          ? <LinkButton to={planExamUrl(g)} kind="primary" size={size}>Plan exam</LinkButton>
          : <Btn kind="primary" size={size} whyDisabled={why}>Plan exam</Btn>}
        <Btn size={size} whyDisabled={admin.permissions.includes('exams:write') ? undefined : why} onClick={() => setMarking(g)}>Mark done</Btn>
      </>
    ) : null;

  const dialog = marking && <MarkDoneDialog group={marking} onClose={() => setMarking(null)} />;

  if (!isDesktop) {
    return (
      <AdminShell title="Exam requests" back="/admin/exams" headerExtra={<>{filters}<div className="flex flex-wrap gap-2">{countrySel}{search}</div></>}>
        {state}
        {none && <div className="rounded-[14px] border border-dashed border-input-border bg-white">{none}</div>}
        {rows.map((g) => (
          <article key={g.key + g.countryCode} className="flex flex-col gap-2 rounded-[14px] border border-border bg-white p-3.5">
            <span className="text-base font-semibold">{g.query}</span>
            <span className="text-[13px] text-ink-2">{countryName(g.countryCode)} · {requestCounts(g)} · {emailWords(g.withEmail)}</span>
            {!open && <span className="text-[13px] text-muted">{doneNote(g)}</span>}
            {open && <div className="flex flex-col gap-2">{actions(g, 'lg')}</div>}
          </article>
        ))}
        {list.data && pages > 1 && (
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
    <AdminShell title="Exam requests">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Exam requests</h1>
          <span className="text-sm text-muted" aria-live="polite">{list.data ? `${formatCount(total)} ${total === 1 ? 'search' : 'searches'} ${open ? 'waiting for an exam' : 'marked done'}` : ' '}</span>
        </div>
        <LinkButton to="/admin/exams" kind="secondary">Back to exams</LinkButton>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">{filters}{countrySel}{search}</div>
      <section aria-label="Exam requests" className="overflow-hidden rounded-[16px] border border-border bg-white">
        {state ?? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="bg-page text-left text-xs text-muted">
                    <th className="px-4 py-3 font-semibold">Asked for</th>
                    <th className="px-2 py-3 font-semibold">Country</th>
                    <th className="px-2 py-3 text-right font-semibold">Requests</th>
                    <th className="px-2 py-3 font-semibold">With an email</th>
                    <th className="px-2 py-3 font-semibold">{open ? 'Last request' : 'Done'}</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => (
                    <tr key={g.key + g.countryCode} className="border-t border-soft align-top">
                      <td className="px-4 py-3 font-semibold">{g.query}</td>
                      <td className="px-2 py-3"><Pill tone={{ bg: '#EEF1F5', ink: '#3A3F4A' }}>{g.countryCode}</Pill></td>
                      <td className="px-2 py-3 text-right tabular">{formatCount(g.count)}</td>
                      <td className="px-2 py-3 text-ink-2">{emailWords(g.withEmail)}</td>
                      <td className="px-2 py-3 text-ink-2">{open ? formatDay(g.lastAt) : doneNote(g)}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-2">{actions(g, 'sm')}</div></td>
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
      <p className="m-0 text-[13px] text-muted">Searches are grouped ignoring capitals and spacing. “Plan exam” opens the new mock test form with the search as its title.</p>
      {dialog}
    </AdminShell>
  );
}
