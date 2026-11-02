import { Link } from 'react-router-dom';
import type { CheckoutSummary, PaymentView } from '../../api/types';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';
import { receiptNumber, startLabel, type CheckoutCopy } from './checkoutModel';

/** Payment confirmed (PayDone.dc). Phone layout; on desktop the same column is centred (C19). */
export function PayDone({
  payment, summary, copy, slug, testSlug, testTitle,
}: { payment: PaymentView; summary: CheckoutSummary; copy: CheckoutCopy; slug: string; testSlug: string | null; testTitle: string | undefined }) {
  useDocumentTitle('Payment confirmed');
  const days = summary.plan?.durationDays ?? payment.access?.daysLeft ?? 30;
  const rows: [string, string][] = [
    ['Package', `${summary.plan?.name ?? 'Full Access'} · ${days} days`],
    ['Amount', payment.priceLabel],
    ['Paid with', payment.providerLabel],
    ...(payment.access ? ([['Access until', formatDate(payment.access.endsAt, true)]] as [string, string][]) : []),
    ...(payment.transactionId ? ([['Transaction ID', payment.transactionId]] as [string, string][]) : []),
  ];
  const startTo = testSlug ? countryPath(slug, 'tests', testSlug, 'start') : countryPath(slug, 'tests');
  return (
    <div className="flex flex-1 flex-col bg-page">
      <div className="mx-auto flex w-full max-w-[390px] flex-1 flex-col bg-page md:my-8 md:flex-none md:overflow-hidden md:rounded-card-lg md:border md:border-border">
        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col gap-[18px] px-4 pb-[18px] pt-10 outline-none">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-correct-bg">
              <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="#047857" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 className="m-0 text-[26px] tracking-tight">Payment confirmed</h1>
            <p className="m-0 text-base leading-normal text-ink-2">Full Access is active. Every mock test on JobPrep is unlocked for {days} days.</p>
          </div>
          <dl className="m-0 rounded-card border border-border bg-surface px-4 py-1">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2.5 border-b border-soft py-3 text-[15px] last:border-b-0">
                <dt className="text-muted">{k}</dt>
                <dd className="m-0 break-all text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-center text-[13px] text-muted">A receipt was sent by SMS to {receiptNumber(payment.msisdn, summary.country.dialCode, copy.variant)}.</p>
        </main>
        <footer className="flex flex-col gap-2 border-t border-border bg-surface px-4 pb-4 pt-3">
          <Link to={startTo} className="rounded-[14px] bg-brand p-4 text-center text-[17px] font-bold text-white no-underline hover:bg-brand-hover hover:text-white">
            {startLabel(testTitle)}
          </Link>
          <Link to={countryPath(slug, 'progress')} className="p-3 text-center text-[15px] font-semibold text-ink no-underline hover:text-ink">
            Go to My progress
          </Link>
        </footer>
      </div>
    </div>
  );
}
