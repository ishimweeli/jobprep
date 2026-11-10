import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { feedbackKey, getFeedback, type FeedbackRow } from '../../api/questions-demand';
import { AdminShell } from '../../components/AdminShell';
import { EmptyState, ErrorBox, Loader } from '../../components/states';
import { FilterChips, LinkButton, Pager, Pill } from '../../components/ui';
import { useAdminCountry } from '../../lib/adminCountry';
import { formatCount, formatDay } from '../../lib/format';
import { pageCount } from '../../lib/queryState';
import { useIsDesktop } from '../../lib/useMediaQuery';

const PAGE_SIZE = 25;
const CHIPS = [{ value: 'all', label: 'All' }, { value: 'comments', label: 'With a comment' }];
const stars = (n: number) => `${n} of 5`;

/** "Exam feedback": the optional rating and comment candidates send after a finished exam, newest first. */
export function FeedbackPage() {
  const isDesktop = useIsDesktop();
  const { country } = useAdminCountry();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const withComment = filter === 'comments';
  const list = useQuery({
    queryKey: feedbackKey({ country, withComment, page }),
    queryFn: () => getFeedback({ country, withComment, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = pageCount(data?.total ?? 0, PAGE_SIZE);
  const s = data?.summary;
  const chips = <FilterChips label="Feedback filter" items={CHIPS} value={filter} onPick={(v) => { setFilter(v); setPage(1); }} scroll={!isDesktop} />;

  const summary = s ? (
    <p className="m-0 text-sm text-muted" aria-live="polite">
      {s.count === 0 ? 'No feedback yet.' : `${formatCount(s.count)} ${s.count === 1 ? 'rating' : 'ratings'} · average ${s.average} of 5 · ${s.byRating.map((b) => `${b.rating}★ ${b.count}`).join('  ')}`}
    </p>
  ) : null;

  const row = (f: FeedbackRow) => (
    <article key={f.id} className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-white p-3.5">
      <span className="flex flex-wrap items-center gap-2">
        <Pill tone={{ bg: f.rating >= 4 ? '#E5F3EA' : f.rating === 3 ? '#FFF4DB' : '#FBE9E7', ink: f.rating >= 4 ? '#1E7A46' : f.rating === 3 ? '#8A5A00' : '#A1281B' }}>{stars(f.rating)}</Pill>
        <span className="text-[13px] font-semibold text-muted">{f.mockTest.title}</span>
      </span>
      <span className="text-[15px]">{f.comment ? `“${f.comment}”` : <span className="text-muted">No comment</span>}</span>
      <span className="text-[13px] text-muted">{f.user ? `${f.user.name} · ${f.user.email}` : 'Guest'} · {formatDay(f.createdAt)} · {f.countryCode}</span>
    </article>
  );

  const state = list.isPending ? <Loader label="Loading feedback…" /> : list.isError ? <ErrorBox error={list.error} onRetry={() => void list.refetch()} /> : null;
  const none = data && data.results.length === 0 ? <EmptyState title={withComment ? 'No comments yet.' : 'No feedback yet.'} hint="Candidates see an optional rating box at the bottom of their results." /> : null;
  const body = (
    <>
      {state}
      {none}
      {data?.results.map(row)}
      {data && pages > 1 && (
        <div className="flex items-center justify-between text-[13px] text-muted">
          <span>Page {page} of {formatCount(pages)}</span>
          <Pager page={page} pages={pages} onPage={setPage} />
        </div>
      )}
    </>
  );

  if (!isDesktop) {
    return (
      <AdminShell title="Exam feedback" back="/admin/exams" headerExtra={chips}>
        {summary}
        {body}
      </AdminShell>
    );
  }
  return (
    <AdminShell title="Exam feedback">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Exam feedback</h1>
          {summary ?? <span className="text-sm"> </span>}
        </div>
        <LinkButton to="/admin/exams" kind="secondary">Back to exams</LinkButton>
      </div>
      {chips}
      <div className="flex max-w-[820px] flex-col gap-2.5">{body}</div>
    </AdminShell>
  );
}
