import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { getPayment, paymentKeys, resendPayment } from '../../api/payments';
import type { DashboardResponse } from '../../api/types';
import { buttonClasses } from '../../components/Button';
import { authErrorMessage } from '../../lib/errorCopy';
import { cx } from '../../lib/cx';
import { formatDate } from '../../lib/format';
import { formatPhone } from '../../lib/phone';
import { countryPath, useCountryDetail } from '../country/hooks';
import { accessCardView, type BadgeTone } from './dashboardModel';

const badgeTone: Record<BadgeTone, string> = {
  soft: 'bg-soft text-ink-2',
  amber: 'bg-flagged-bg text-flagged-ink',
  green: 'bg-free-bg text-free',
};

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

/** "My access" (DashboardNew.dc): free only, payment pending, active, ending soon, expired. Every line comes from the API. */
export function MyAccessCard({ d, slug, className }: { d: DashboardResponse; slug: string; className?: string }) {
  const navigate = useNavigate();
  const country = useCountryDetail(slug);
  const pendingId = d.pendingPayment?.id;
  const pendingQ = useQuery({
    queryKey: paymentKeys.payment(pendingId ?? ''),
    queryFn: () => getPayment(pendingId!),
    enabled: !!pendingId,
    staleTime: 15_000,
    retry: false,
  });
  const resend = useMutation({
    mutationFn: () => resendPayment(pendingId!),
    // The checkout screen shows "Approve on your phone" for the payment that was just sent again.
    onSuccess: (p) => navigate(`${countryPath(slug, 'checkout')}?payment=${encodeURIComponent(p.id)}`),
  });

  const plan = country.data?.plan ?? null;
  const view = accessCardView({
    d,
    countryName: d.country.name,
    plan: plan && { priceLabel: plan.priceLabel, durationDays: plan.durationDays, checkoutAvailable: plan.checkoutAvailable },
    pending: pendingQ.data ? { msisdn: pendingQ.data.msisdn, createdAt: pendingQ.data.createdAt } : null,
    formatDate: (iso) => formatDate(iso, true),
    formatTime: time,
    formatPhone: (e164) => formatPhone(e164, country.data?.dialCode),
  });

  const checkout = countryPath(slug, 'checkout');
  const ctaTo = view.cta?.target === 'check' && pendingId ? `${checkout}?payment=${encodeURIComponent(pendingId)}&check=1` : checkout;

  return (
    <section aria-labelledby="ma-t" className={cx('flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-5 dark:border-night-border dark:bg-night-surface', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="ma-t" className="m-0 text-base font-bold text-heading dark:text-night-heading">
          My access
        </h2>
        <span className={cx('rounded-pill px-2.5 py-[3px] text-xs font-semibold', badgeTone[view.badge.tone])}>{view.badge.text}</span>
      </div>
      <p className="m-0 text-[17px] font-semibold text-heading dark:text-night-heading">{view.title}</p>
      <p className="m-0 text-[15px] leading-normal text-ink-2 dark:text-night-ink">{view.body}</p>
      {view.bar && (
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-pill bg-soft">
          <div className="h-2" style={{ width: `${view.bar.percent}%`, background: view.bar.amber ? '#8A5300' : '#164A7A' }} />
        </div>
      )}
      {view.cta && (
        <Link to={ctaTo} className={buttonClasses({ variant: 'primary', size: 'lg' })}>
          {view.cta.label}
        </Link>
      )}
      {view.link?.target === 'catalog' && (
        <Link to={countryPath(slug, 'tests')} className="link py-1.5 text-[15px] font-semibold">
          {view.link.label}
        </Link>
      )}
      {view.link?.target === 'resend' && (
        <button
          type="button"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          className="cursor-pointer self-start border-0 bg-transparent py-1.5 text-[15px] font-semibold text-brand hover:text-brand disabled:opacity-60"
        >
          {view.link.label}
        </button>
      )}
      {resend.isError && (
        <p role="alert" className="m-0 text-sm font-semibold text-incorrect">
          {authErrorMessage(resend.error)}
        </p>
      )}
    </section>
  );
}
