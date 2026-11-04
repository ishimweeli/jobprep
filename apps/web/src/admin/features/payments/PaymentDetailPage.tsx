import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPayment, keys } from '../../api/admin';
import type { PaymentDetail } from '../../api/types';
import { AdminShell } from '../../components/AdminShell';
import { ErrorBox, Skeleton } from '../../components/states';
import { Btn, Pill } from '../../components/ui';
import { paymentTone } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { formatDateTime, formatLocalPhone, providerName } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { StuckBadge } from './PaymentBits';
import { ManualGrantDialog, useCheckPayment } from './PaymentDialogs';
import { ageText, buildTimeline, canGrantByHand, type GrantTarget, type TimelineItem } from './paymentsModel';

const DOT: Record<TimelineItem['tone'], string> = { neutral: 'bg-muted', good: 'bg-correct', bad: 'bg-incorrect', wait: 'bg-flagged' };
const TONE_WORD: Record<TimelineItem['tone'], string> = { neutral: '', good: 'Success. ', bad: 'Problem. ', wait: 'Waiting. ' };

/** The timeline as an ordered list: a dot, the event, its source and its time. The dot's colour is also said in words for screen readers. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {items.map((it, i) => (
        <li key={it.key} className="flex gap-3">
          <span aria-hidden="true" className="flex flex-col items-center">
            <span className={cx('mt-1.5 h-2.5 w-2.5 flex-none rounded-full', DOT[it.tone])} />
            {i < items.length - 1 && <span className="w-px flex-1 bg-border-strong" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 pb-4">
            <span className="text-[15px] font-semibold text-ink"><span className="sr-only">{TONE_WORD[it.tone]}</span>{it.title}</span>
            {it.detail && <span className="break-words text-[13px] text-ink-2">{it.detail}</span>}
            <span className="text-xs text-muted">{formatDateTime(it.at)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Facts({ d, grantable }: { d: PaymentDetail; grantable: boolean }) {
  const p = d.payment;
  const rows: [string, ReactNode][] = [
    ['Candidate', <Link key="u" to={`/admin/users/${d.user.id}`} className="font-semibold">{d.user.name}</Link>],
    ['Email', <span key="e" className="break-all">{d.user.email}</span>],
    ['Amount', p.priceLabel ?? '—'],
    ['Method', providerName(p.provider)],
    ['Payer number', formatLocalPhone(p.msisdn)],
    ['Country', p.countryCode],
    ['Requested', formatDateTime(p.createdAt)],
    ['Request ran until', formatDateTime(p.expiresAt)],
    ['Confirmed', p.confirmedAt ? formatDateTime(p.confirmedAt) : '—'],
    ['Operator reference', p.reference ? <span key="r" className="break-all font-mono text-xs">{p.reference}</span> : '—'],
    ['Transaction ID', p.transactionId ? <span key="t" className="break-all font-mono text-xs">{p.transactionId}</span> : '—'],
  ];
  if (p.failureReason) rows.push(['Why it failed', p.failureReason.replace(/_/g, ' ')]);
  return (
    <dl className="m-0 flex flex-col">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-t border-soft py-2 text-sm first:border-t-0">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 text-right font-semibold">{v}</dd>
        </div>
      ))}
      {!grantable && p.status === 'PENDING' && <p className="m-0 pt-2 text-xs text-muted">A pending payment can be granted by hand once it is stuck.</p>}
    </dl>
  );
}

/** One payment (A4): its facts, the event timeline (request, callbacks, polls, manual action, grant), and the actions the role may use. */
export function PaymentDetailPage() {
  const { id = '' } = useParams();
  const isDesktop = useIsDesktop();
  const q = useQuery({ queryKey: keys.payment(id), queryFn: () => getPayment(id), enabled: !!id });
  const title = 'Payment';
  const back = '/admin/payments';

  let body: ReactNode;
  if (q.isPending) body = <Skeleton label="Loading this payment…" />;
  else if (q.isError) body = <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  else body = <Body d={q.data} desktop={isDesktop} />;

  return (
    <AdminShell title={title} back={back}>
      {isDesktop && (
        <div className="flex flex-col gap-1">
          <Link to={back} className="text-sm font-semibold">← All payments</Link>
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Payment</h1>
        </div>
      )}
      {body}
    </AdminShell>
  );
}

function Body({ d, desktop }: { d: PaymentDetail; desktop: boolean }) {
  const { permissions } = useAdmin();
  const check = useCheckPayment();
  const [granting, setGranting] = useState(false);
  const p = d.payment;
  const tone = paymentTone(p.status);
  const stuck = p.stuck ?? false;
  const canCheck = permissions.includes('payments:check') && (p.canCheck ?? p.status === 'PENDING');
  const grantable = canGrantByHand(p.status, stuck, p.canManualGrant);
  const age = p.ageMinutes ?? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60_000));
  const target: GrantTarget = { id: p.id, candidate: d.user.name, priceLabel: p.priceLabel ?? 'Amount not set', providerLabel: providerName(p.provider), msisdn: p.msisdn, ageMinutes: age };
  const card = 'flex min-w-0 flex-col gap-3 rounded-[16px] border border-border bg-white p-5';

  const actions = (
    <div className="flex flex-wrap items-start gap-2">
      {canCheck && <Btn kind="outline-brand" onClick={() => check.run({ id: p.id, status: p.status })} busy={check.busyId === p.id}>{check.busyId === p.id ? 'Checking…' : 'Check status'}</Btn>}
      {grantable && <Btn kind="primary" onClick={() => setGranting(true)} whyDisabled={denyHint(permissions, 'payments:grant', 'grant access by hand')}>Grant access manually</Btn>}
    </div>
  );

  return (
    <>
      <div className={cx('flex flex-wrap items-center gap-2', !desktop && 'order-first')}>
        <Pill tone={tone}>{tone.label}</Pill>
        {stuck && <StuckBadge />}
        <span className="text-sm text-muted">{p.priceLabel} · {providerName(p.provider)} · requested {ageText(age)} ago</span>
      </div>
      {actions}
      <div className={cx('flex items-start gap-[18px]', desktop ? 'flex-row' : 'flex-col')}>
        <section aria-labelledby="pd-facts" className={cx(card, desktop ? 'flex-[1_1_360px]' : 'w-full')}>
          <h2 id="pd-facts" className="m-0 text-[17px]">Details</h2>
          <Facts d={d} grantable={grantable} />
        </section>
        <div className={cx('flex min-w-0 flex-col gap-[18px]', desktop ? 'flex-[1_1_360px]' : 'w-full')}>
          <section aria-labelledby="pd-time" className={card}>
            <h2 id="pd-time" className="m-0 text-[17px]">Timeline</h2>
            <Timeline items={buildTimeline(d)} />
          </section>
          <section aria-labelledby="pd-grant" className={card}>
            <h2 id="pd-grant" className="m-0 text-[17px]">Access granted</h2>
            {d.grant ? (
              <p className="m-0 text-[15px]">
                {d.grant.source === 'MANUAL' ? 'By hand' : 'Automatically'}: Full Access from {formatDateTime(d.grant.startsAt)} until <strong>{formatDateTime(d.grant.endsAt)}</strong>
                {d.grant.grantedBy ? `, granted by ${d.grant.grantedBy}` : ''}.
                {d.grant.reason ? <span className="block text-sm text-ink-2">Reason: {d.grant.reason}</span> : null}
              </p>
            ) : (
              <p className="m-0 text-[15px] text-ink-2">No access has been granted for this payment.</p>
            )}
          </section>
        </div>
      </div>
      {check.dialog}
      <ManualGrantDialog target={granting ? target : null} onClose={() => setGranting(false)} />
    </>
  );
}
