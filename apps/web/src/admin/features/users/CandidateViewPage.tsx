import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCandidateView, upKeys, type CandidateView } from '../../api/users-payments';
import { AdminShell } from '../../components/AdminShell';
import { EmptyState, ErrorBox, Skeleton } from '../../components/states';
import { Pill } from '../../components/ui';
import { paymentTone } from '../../lib/badges';
import { formatDateTime, formatDayYear, plural } from '../../lib/format';
import { useIsDesktop } from '../../lib/useMediaQuery';

/** The access line of the read-only view: from the dashboard when it has one, else from the admin's own access summary. */
export function candidateAccessLine(v: Pick<CandidateView, 'access' | 'dashboard'>): string {
  const cur = v.dashboard?.access?.current;
  if (cur) return `Full Access · ${plural(cur.daysLeft, 'day')} left, until ${formatDayYear(cur.endsAt)}${cur.endingSoon ? ' (ending soon)' : ''}`;
  const past = v.dashboard?.access?.expired;
  if (past) return `No Full Access · it ended ${formatDayYear(past.endedAt)}`;
  if (v.access?.state === 'active' && v.access.endsAt) return `Full Access · until ${formatDayYear(v.access.endsAt)}`;
  if (v.access?.state === 'suspended') return 'Account suspended';
  return 'Free: no Full Access yet';
}

const card = 'flex min-w-0 flex-col gap-2 rounded-[14px] border border-border bg-white p-4';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={card}>
      <h2 id={id} className="m-0 text-[17px]">{title}</h2>
      {children}
    </section>
  );
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`);

/**
 * "View as candidate" (A5): what the person sees, read only. A banner says so and has Exit. It reads one endpoint that
 * returns data only (no session switch), so there is nothing here that can act as the person: no links into the candidate
 * app, no buttons that change anything.
 */
export function CandidateViewPage() {
  const { id = '' } = useParams();
  const isDesktop = useIsDesktop();
  const q = useQuery({ queryKey: upKeys.candidateView(id), queryFn: () => getCandidateView(id), enabled: !!id, retry: false });
  const back = `/admin/users/${id}`;
  const name = q.data?.user.name ?? 'this person';

  const banner = (
    <div
      role="status"
      className="sticky top-[63px] z-[9] flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-flagged-line bg-flagged-bg px-3.5 py-2.5 min-[900px]:top-0 min-[900px]:z-20"
    >
      <span className="text-[15px] font-semibold text-flagged">Viewing as {name} — read only</span>
      <Link to={back} className="inline-flex min-h-11 items-center rounded-[10px] border border-flagged-line bg-white px-4 text-[15px] font-semibold text-flagged no-underline hover:text-flagged">
        Exit
      </Link>
    </div>
  );

  let body: ReactNode;
  if (q.isPending) body = <Skeleton label="Loading the candidate’s view…" />;
  else if (q.isError) body = <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  else body = <View v={q.data} />;

  return (
    <AdminShell title="Candidate view" back={back}>
      {isDesktop && <h1 className="m-0 text-[28px] tracking-[-0.02em]">Candidate view</h1>}
      {banner}
      <p className="m-0 text-sm text-muted">This is what the person sees on their own dashboard. You cannot change anything here. Opening this view is recorded in the audit log; the person is not told.</p>
      {body}
    </AdminShell>
  );
}

function View({ v }: { v: CandidateView }) {
  const d = v.dashboard;
  return (
    <div className="flex flex-col gap-3.5">
      <Section id="cv-access" title="Access">
        <p className="m-0 text-[15px] font-semibold">{candidateAccessLine(v)}</p>
        {d?.access?.otherCountries?.map((o) => (
          <p key={o.countryCode} className="m-0 text-sm text-ink-2">{o.countryCode}: {plural(o.daysLeft, 'day')} left, until {formatDayYear(o.endsAt)}</p>
        ))}
        {d?.pendingPayment && <p className="m-0 text-sm text-flagged">Payment pending: {d.pendingPayment.priceLabel} with {d.pendingPayment.providerLabel}, until {formatDateTime(d.pendingPayment.expiresAt)}.</p>}
        <p className="m-0 text-sm text-muted">{v.user.email ? `${v.user.email} · ` : ''}{v.country?.name ?? v.user.countryCode ?? ''}</p>
      </Section>

      {d ? (
        <Section id="cv-dash" title="Dashboard">
          <div className="flex flex-col">
            <Row k="Exam goal" v={d.goal?.name ?? '—'} />
            <Row k="Test in progress" v={d.resume ? (d.resume.title ?? d.resume.mockTestTitle ?? 'Yes') : 'None'} />
            <Row k="Suggested practice" v={d.recommended ? `${d.recommended.topicName} · ${d.recommended.percent}% · ${plural(d.recommended.questionCount, 'question')}` : 'None'} />
          </div>
          <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
            <div>
              <h3 className="m-0 mb-1 text-[15px]">Needs work</h3>
              {d.topics.needsWork.length === 0 ? <p className="m-0 text-sm text-muted">Nothing yet.</p> : d.topics.needsWork.map((t) => <Row key={t.topicId} k={t.name} v={pct(t.percent)} />)}
            </div>
            <div>
              <h3 className="m-0 mb-1 text-[15px]">Strong topics</h3>
              {d.topics.strong.length === 0 ? <p className="m-0 text-sm text-muted">Nothing yet.</p> : d.topics.strong.map((t) => <Row key={t.topicId} k={t.name} v={pct(t.percent)} />)}
            </div>
          </div>
          <div>
            <h3 className="m-0 mb-1 text-[15px]">Recently completed</h3>
            {d.recentlyCompleted.length === 0 ? <p className="m-0 text-sm text-muted">No finished tests yet.</p> : d.recentlyCompleted.map((a) => (
              <Row key={a.attemptId} k={`${a.title}${a.kind === 'PRACTICE' ? ' (practice)' : ''} · ${formatDayYear(a.submittedAt)}`} v={pct(a.percent)} />
            ))}
          </div>
        </Section>
      ) : (
        <Section id="cv-dash" title="Dashboard"><p className="m-0 text-sm text-muted">The dashboard is not available for this person.</p></Section>
      )}

      <Section id="cv-att" title="Attempts">
        {v.attempts.length === 0 ? <EmptyState title="No attempts yet." className="p-3" /> : (
          <ul className="m-0 flex list-none flex-col p-0">
            {v.attempts.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 border-t border-soft py-2 text-sm first:border-t-0">
                <span className="flex min-w-0 flex-col"><span className="font-semibold">{a.title}</span><span className="text-xs text-muted">{a.kind === 'PRACTICE' ? 'Practice' : 'Mock test'} · {a.status.toLowerCase().replace(/_/g, ' ')}{a.submittedAt ? ` · ${formatDateTime(a.submittedAt)}` : ''}</span></span>
                <strong className="tabular">{pct(a.percent)}</strong>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="cv-pay" title="Payments">
        {v.payments.length === 0 ? <EmptyState title="No payments yet." className="p-3" /> : (
          <ul className="m-0 flex list-none flex-col p-0">
            {v.payments.map((p) => {
              const t = paymentTone(p.status);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 border-t border-soft py-2 text-sm first:border-t-0">
                  <span className="flex min-w-0 flex-col"><span className="font-semibold">{p.priceLabel} · {p.providerLabel}</span><span className="break-all text-xs text-muted">{formatDateTime(p.createdAt)}{p.transactionId ? ` · ${p.transactionId}` : ''}{p.accessUntil ? ` · access until ${formatDayYear(p.accessUntil)}` : ''}</span></span>
                  <Pill tone={t}>{t.label}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-soft py-2 text-sm first:border-t-0">
      <span className="min-w-0 text-muted">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  );
}
