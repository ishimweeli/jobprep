import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyPayments, paymentsKeys } from '../../api/me';
import { checkPayment } from '../../api/payments';
import type { PaymentRow } from '../../api/types';
import { Button } from '../../components/Button';
import { PhoneBackHeader } from '../../components/layout/Header';
import { EmptyState, QueryError, SkeletonList } from '../../components/states';
import { cx } from '../../lib/cx';
import { authErrorMessage } from '../../lib/errorCopy';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { checkResultLine, notChargedLine, rowDetail, statusLabel, statusTone, type StatusTone } from './paymentsModel';

const toneClass: Record<StatusTone, string> = { good: 'bg-free-bg text-free', wait: 'bg-flagged-bg text-flagged-ink', bad: 'bg-incorrect-bg text-incorrect' };

export function StatusBadge({ status }: { status: PaymentRow['status'] }) {
  return <span className={cx('inline-flex shrink-0 whitespace-nowrap rounded-pill px-2.5 py-[3px] text-xs font-semibold', toneClass[statusTone(status)])}>{statusLabel(status)}</span>;
}

/**
 * Payment history (C21; not drawn): the signed-in person's payments, newest first, with a receipt link on each and
 * "Check payment" on one that is still pending. "Load more" for a long list. Phone-first, one column.
 */
export function PaymentHistoryPage() {
  useDocumentTitle('Payment history');
  const slug = useActiveCountrySlug();
  const q = useInfiniteQuery({
    queryKey: paymentsKeys.list,
    queryFn: ({ pageParam }) => listMyPayments(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 0,
    retry: false,
  });
  const rows = q.data?.pages.flatMap((p) => p.payments) ?? [];

  return (
    <div className="mx-auto w-full max-w-[480px] md:max-w-[560px]">
      <PhoneBackHeader to="/account/settings" label="Back to account" title="Payment history" />
      <main id="main-content" tabIndex={-1} className="flex flex-col gap-3 p-4 outline-none md:py-8">
        <h1 className="m-0 hidden text-[28px] tracking-tight md:block">Payment history</h1>
        {q.isError ? (
          <QueryError error={q.error} what="your payments" onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : !q.data ? (
          <SkeletonList count={3} label="Loading your payments…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No payments yet" message="When you buy Full Access, the payment and its receipt appear here.">
            <Link to={countryPath(slug, 'pricing')} className="link py-2.5 text-[15px] font-semibold">
              See pricing
            </Link>
          </EmptyState>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {rows.map((r) => (
                <PaymentItem key={r.id} row={r} />
              ))}
            </ul>
            {q.hasNextPage && (
              <div className="flex flex-col items-center gap-2 pt-1">
                {q.isFetchNextPageError && (
                  <p role="alert" className="m-0 text-sm font-semibold text-incorrect">
                    We could not load more payments. Try again.
                  </p>
                )}
                <Button variant="secondary" size="lg" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function PaymentItem({ row }: { row: PaymentRow }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<string | null>(null);
  const check = useMutation({
    mutationFn: () => checkPayment(row.id),
    onSuccess: (p) => {
      setResult(checkResultLine(p.status));
      void qc.invalidateQueries({ queryKey: paymentsKeys.list });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => setResult(authErrorMessage(e)),
  });
  const notCharged = notChargedLine(row.status);
  return (
    <li className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
      <Link to={`/account/payments/${encodeURIComponent(row.id)}`} className="flex items-start justify-between gap-3 text-ink no-underline hover:text-ink">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-base">{row.priceLabel}</strong>
            <StatusBadge status={row.status} />
          </span>
          <span className="text-[13px] text-muted">{formatDate(row.createdAt, true)}</span>
          <span className="break-words text-[13px] text-ink-2">{rowDetail(row, (iso) => formatDate(iso, true))}</span>
          {notCharged && <span className="text-[13px] font-semibold text-ink-2">{notCharged}</span>}
        </span>
        <span className="mt-1 inline-flex items-center gap-0.5 text-sm font-semibold text-brand">
          Details
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </Link>
      {row.canCheck && (
        <div className="flex flex-col gap-1.5">
          <Button variant="secondary" size="sm" className="self-start" loading={check.isPending} onClick={() => check.mutate()}>
            Check payment
          </Button>
          {result && (
            <p role="status" className="m-0 text-sm text-ink-2">
              {result}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
