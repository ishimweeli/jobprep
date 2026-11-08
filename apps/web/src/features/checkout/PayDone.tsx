import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { catalogKeys, getJob } from '../../api/catalog';
import type { CheckoutSummary, PaymentView } from '../../api/types';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';
import { useSession } from '../auth/session';
import { minutesLabel, nextExam, startLabel } from './checkoutModel';

/** Payment confirmed (PayDone.dc). Phone layout; on desktop the same column is centred (C19). */
export function PayDone({
  payment, summary, slug, testSlug, testTitle,
}: { payment: PaymentView; summary: CheckoutSummary; slug: string; testSlug: string | null; testTitle: string | undefined }) {
  useDocumentTitle('Payment confirmed');
  const { user, preferredJob } = useSession();
  // Bought from the pricing page, with no test in mind: their chosen job's next exam, so they land on something to take.
  const job = useQuery({
    queryKey: catalogKeys.jobDetail(slug, preferredJob?.slug ?? ''),
    queryFn: () => getJob(slug, preferredJob!.slug),
    enabled: !testSlug && !!preferredJob,
    staleTime: 0,
    retry: false,
  });
  const next = testSlug ? undefined : nextExam(job.data?.mockTests);
  const days = summary.plan?.durationDays ?? payment.access?.daysLeft ?? 30;
  const interview = summary.plan?.code === 'interview';
  const upgrade = interview && summary.plan?.kind === 'UPGRADE';
  const rows: [string, string][] = [
    ['Package', upgrade ? `${summary.plan!.name} (upgrade)` : `${summary.plan?.name ?? 'Full Access'} · ${days} days`],
    ...(interview ? ([['Interview time', minutesLabel(summary.plan?.interviewMinutes ?? 300)]] as [string, string][]) : []),
    ['Amount', payment.priceLabel],
    ['Paid with', payment.providerLabel],
    ...(payment.access ? ([['Access until', formatDate(payment.access.endsAt, true)]] as [string, string][]) : []),
    ...(payment.transactionId ? ([['Transaction ID', payment.transactionId]] as [string, string][]) : []),
  ];
  const targetSlug = testSlug ?? next?.slug ?? null;
  const startTo = targetSlug ? countryPath(slug, 'tests', targetSlug, 'start') : countryPath(slug, 'tests');
  return (
    <div className="flex flex-1 flex-col bg-page">
      <div className="mx-auto flex w-full max-w-[390px] flex-1 flex-col bg-page md:my-8 md:flex-none md:overflow-hidden md:rounded-card-lg md:border md:border-border">
        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col gap-[18px] px-4 pb-[18px] pt-10 outline-none">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-correct-bg">
              <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="#1E7A46" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 className="m-0 text-2xl tracking-tight">Payment confirmed</h1>
            <p className="m-0 text-base leading-normal text-ink-2">
              {interview
                ? `Interview prep is active: ${minutesLabel(summary.plan?.interviewMinutes ?? 300)} of AI interview practice, and every mock test is unlocked.`
                : `Full Access is active. Every mock test on JobPrep is unlocked for ${days} days.`}
            </p>
          </div>
          <dl className="m-0 rounded-card border border-border bg-surface px-4 py-1">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2.5 border-b border-soft py-3 text-[15px] last:border-b-0">
                <dt className="text-muted">{k}</dt>
                <dd className="m-0 break-all text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-center text-[13px] text-muted">A receipt was sent to {user?.email ?? 'your email'}.</p>
        </main>
        <footer className="flex flex-col gap-2 border-t border-border bg-surface px-4 pb-4 pt-3">
          {interview ? (
            <Link to={countryPath(slug, 'interview')} className="rounded-control bg-brand p-3 text-center text-[17px] font-semibold text-white no-underline hover:bg-brand-hover hover:text-white">
              Start an interview
            </Link>
          ) : (
            <Link to={startTo} className="rounded-control bg-brand p-3 text-center text-[17px] font-semibold text-white no-underline hover:bg-brand-hover hover:text-white">
              {targetSlug ? startLabel(testTitle ?? next?.title) : 'Choose a mock test'}
            </Link>
          )}
          <Link to={countryPath(slug, 'progress')} className="p-3 text-center text-[15px] font-semibold text-ink no-underline hover:text-ink">
            Go to My progress
          </Link>
        </footer>
      </div>
    </div>
  );
}
