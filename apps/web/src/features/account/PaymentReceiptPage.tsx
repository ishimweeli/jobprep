import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getMyPayment, paymentsKeys } from '../../api/me';
import { checkPayment } from '../../api/payments';
import { Button } from '../../components/Button';
import { PhoneBackHeader } from '../../components/layout/Header';
import { QueryError, SkeletonList } from '../../components/states';
import { authErrorMessage } from '../../lib/errorCopy';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { StatusBadge } from './PaymentHistoryPage';
import { checkResultLine, notChargedLine, receiptRows } from './paymentsModel';

/**
 * Receipt detail (C21; not drawn). A paid payment shows the receipt rows (number, who, package, amount, dates);
 * any other payment shows its status, "You were not charged." where that is true, and "Check payment" while pending.
 */
export function PaymentReceiptPage() {
  useDocumentTitle('Receipt');
  const { paymentId = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: paymentsKeys.detail(paymentId), queryFn: () => getMyPayment(paymentId), retry: false, staleTime: 0 });
  const [result, setResult] = useState<string | null>(null);
  const check = useMutation({
    mutationFn: () => checkPayment(paymentId),
    onSuccess: (p) => {
      setResult(checkResultLine(p.status));
      void qc.invalidateQueries({ queryKey: paymentsKeys.detail(paymentId) });
      void qc.invalidateQueries({ queryKey: paymentsKeys.list });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => setResult(authErrorMessage(e)),
  });
  const d = q.data;
  const p = d?.payment;
  const fmt = (iso: string) => formatDate(iso, true);

  return (
    <div className="mx-auto w-full max-w-[480px] md:max-w-[560px]">
      <PhoneBackHeader to="/account/payments" label="Back to payment history" title="Receipt" />
      <main id="main-content" tabIndex={-1} className="flex flex-col gap-3 p-4 outline-none md:py-8">
        <h1 className="m-0 hidden text-[28px] tracking-tight md:block">{d?.receipt ? 'Receipt' : 'Payment'}</h1>
        {q.isError ? (
          <QueryError error={q.error} what="this payment" onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : !p ? (
          <SkeletonList count={2} label="Loading the receipt…" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-4">
              <span className="flex flex-col gap-0.5">
                <strong className="text-xl">{p.priceLabel}</strong>
                <span className="text-[13px] text-muted">{fmt(p.createdAt)}</span>
              </span>
              <StatusBadge status={p.status} />
            </div>
            {d?.receipt ? (
              <dl className="m-0 rounded-card border border-border bg-surface px-4 py-1" aria-label="Receipt details">
                {receiptRows(d.receipt, p.priceLabel, p.providerLabel, fmt).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2.5 border-b border-soft py-3 text-[15px] last:border-b-0">
                    <dt className="text-muted">{k}</dt>
                    <dd className="m-0 break-all text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
                <p className="m-0 text-[15px] leading-normal text-ink-2">
                  {p.providerLabel}
                  {p.transactionId ? ` · ID ${p.transactionId}` : ''}
                </p>
                {notChargedLine(p.status) && <p className="m-0 text-[15px] font-semibold text-ink">{notChargedLine(p.status)}</p>}
                {p.status === 'PENDING' && (
                  <>
                    <Button variant="secondary" size="sm" className="self-start" loading={check.isPending} onClick={() => check.mutate()}>
                      Check payment
                    </Button>
                    {result && (
                      <p role="status" className="m-0 text-sm text-ink-2">
                        {result}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {d?.receipt && (
              <Button variant="neutral" size="lg" onClick={() => window.print()}>
                Print receipt
              </Button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
