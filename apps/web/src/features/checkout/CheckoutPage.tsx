import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { getMockTest, catalogKeys } from '../../api/catalog';
import { ApiError, isApiError } from '../../api/client';
import { meKeys } from '../../api/me';
import { createPayment, getCheckout, getPayment, paymentKeys, resendPayment } from '../../api/payments';
import type { CheckoutSummary, PaymentView } from '../../api/types';
import { QueryError, SkeletonList } from '../../components/states';
import { authErrorMessage } from '../../lib/errorCopy';
import { cx } from '../../lib/cx';
import { formatDate, mmss } from '../../lib/format';
import { signUpPath } from '../../lib/next';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { useRemaining } from '../exam/useRemaining';
import {
  canPay, checkoutCopy, displayNumber, notCompletedMessage, phaseFor, POLL_INTERVAL_MS, priceText, providerSwatch, receiptNumber, shouldPoll, toMsisdn,
  type CheckoutCopy,
} from './checkoutModel';
import { PayDone } from './PayDone';

/** The phone-first checkout column. On desktop the same layout sits in a centred column (no desktop design: C19). */
function Frame({ back, chip, children, footer }: { back: string; chip?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-page">
      <div className="mx-auto flex w-full max-w-[390px] flex-1 flex-col bg-page md:my-8 md:flex-none md:overflow-hidden md:rounded-card-lg md:border md:border-border">
        <header className="flex items-center gap-1 border-b border-border bg-surface px-2 py-2.5">
          <Link to={back} aria-label="Back" className="inline-flex h-11 w-11 items-center justify-center text-ink no-underline hover:text-ink">
            <ArrowLeft size={22} aria-hidden="true" />
          </Link>
          <span className="flex-1 text-[17px] font-bold">Get Full Access</span>
          {chip && <span className="mr-2 rounded-md bg-soft px-2 py-1 text-xs font-bold text-ink-2">{chip}</span>}
        </header>
        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col gap-4 px-4 py-[18px] outline-none">
          {children}
        </main>
        {footer && <footer className="sticky bottom-0 border-t border-border bg-surface px-4 pb-4 pt-3 md:static">{footer}</footer>}
      </div>
    </div>
  );
}

export function CheckoutPage() {
  useDocumentTitle('Get Full Access');
  const slug = useActiveCountrySlug();
  const [params] = useSearchParams();
  const testSlug = params.get('test');
  const { user, session, isLoading } = useSession();
  const summaryQ = useQuery({ queryKey: paymentKeys.checkout, queryFn: getCheckout, enabled: !!user, staleTime: 30_000, retry: false });
  const testQ = useQuery({
    queryKey: catalogKeys.detail(slug, testSlug ?? ''),
    queryFn: () => getMockTest(slug, testSlug ?? ''),
    enabled: !!testSlug && !!user,
    staleTime: 60_000,
    retry: false,
  });

  const here = `${countryPath(slug, 'checkout')}${testSlug ? `?test=${encodeURIComponent(testSlug)}` : ''}`;
  // A guest has no designed path to pay (C17): the existing sign-up screen is used and brings them back here.
  if (!isLoading && !user) return <Navigate to={signUpPath(here)} replace />;

  const back = testSlug ? countryPath(slug, 'tests', testSlug) : countryPath(slug, 'pricing');
  if (summaryQ.isError) {
    return (
      <Frame back={back}>
        <QueryError error={summaryQ.error} what="the checkout" onRetry={() => void summaryQ.refetch()} retrying={summaryQ.isFetching} />
      </Frame>
    );
  }
  if (!summaryQ.data) {
    return (
      <Frame back={back}>
        <SkeletonList count={2} label="Loading checkout…" />
      </Frame>
    );
  }
  return (
    <CheckoutFlow
      summary={summaryQ.data}
      slug={slug}
      back={back}
      testSlug={testSlug}
      testTitle={testQ.data?.title}
      accessEndsAt={session?.access.current?.endsAt ?? null}
    />
  );
}

function CheckoutFlow({
  summary, slug, back, testSlug, testTitle, accessEndsAt,
}: { summary: CheckoutSummary; slug: string; back: string; testSlug: string | null; testTitle: string | undefined; accessEndsAt: string | null }) {
  const qc = useQueryClient();
  const dial = summary.country.dialCode;
  const until = useMemo(() => {
    const base = accessEndsAt ? new Date(accessEndsAt) : new Date();
    const d = new Date(base.getTime() + (summary.plan?.durationDays ?? 30) * 86_400_000);
    return formatDate(d.toISOString(), true);
  }, [accessEndsAt, summary.plan?.durationDays]);
  const copy = checkoutCopy(summary, until);

  const [provider, setProvider] = useState(summary.paymentMethods[0]?.provider ?? '');
  const [number, setNumber] = useState(() => displayNumber(summary.prefillPhone, dial, copy.variant));
  const [numberError, setNumberError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const idemKey = useRef<string>(crypto.randomUUID());
  const expiredAt = useRef<number | null>(null);

  const pay = useQuery({
    queryKey: paymentKeys.payment(paymentId ?? ''),
    queryFn: () => getPayment(paymentId!),
    enabled: !!paymentId,
    retry: false,
    staleTime: 0,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === 'EXPIRED' && expiredAt.current === null) expiredAt.current = Date.now();
      return shouldPoll(s, expiredAt.current === null ? 0 : Date.now() - expiredAt.current) ? POLL_INTERVAL_MS : false;
    },
  });
  const payment = pay.data ?? null;
  const phase = phaseFor(payment, editing);
  const providerLabel = summary.paymentMethods.find((m) => m.provider === provider)?.label ?? 'mobile money';

  useEffect(() => {
    if (payment?.status === 'SUCCESSFUL') {
      void qc.invalidateQueries({ queryKey: meKeys.session });
      void qc.invalidateQueries({ queryKey: ['me', 'dashboard'] });
    }
  }, [payment?.status, qc]);

  const adopt = (p: PaymentView) => {
    qc.setQueryData(paymentKeys.payment(p.id), p);
    expiredAt.current = null;
    setPaymentId(p.id);
    setEditing(false);
  };
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'invalid_phone') setNumberError(authErrorMessage(e));
    else if (e instanceof ApiError && e.code === 'provider_unavailable') setFormError('We could not send the payment request. You were not charged. Try again.');
    else if (e instanceof ApiError && e.code === 'checkout_unavailable') setFormError('Checkout is not available yet.');
    else setFormError(isApiError(e) && e.isNetwork ? authErrorMessage(e) : 'We could not start the payment. You were not charged. Please try again.');
  };

  const create = useMutation({
    mutationFn: (msisdn: string) =>
      paymentId && payment?.status === 'PENDING'
        ? resendPayment(paymentId, msisdn) // "Use a different number": closes the old request first
        : createPayment({ provider, msisdn, idempotencyKey: idemKey.current }),
    onSuccess: adopt,
    onError,
  });
  const again = useMutation({ mutationFn: () => resendPayment(paymentId!), onSuccess: adopt, onError });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    const msisdn = toMsisdn(number, dial);
    if (!msisdn) {
      setNumberError(authErrorMessage(new ApiError(400, 'invalid_phone')));
      return;
    }
    setNumberError(null);
    create.mutate(msisdn);
  };
  const tryAgain = () => {
    idemKey.current = crypto.randomUUID();
    setPaymentId(null);
    setEditing(false);
    setFormError(null);
  };

  if (phase === 'done' && payment) {
    return <PayDone payment={payment} summary={summary} copy={copy} slug={slug} testSlug={testSlug} testTitle={testTitle} />;
  }

  const price = priceText(summary);
  const chip = copy.variant === 'prefix' ? `${summary.country.code} · ${summary.country.currencyCode}` : undefined;
  const sellable = canPay(summary);

  return (
    <Frame
      back={back}
      chip={chip}
      footer={
        phase === 'form' ? (
          <button
            key="pay"
            type="submit"
            form="pay-form"
            disabled={!sellable || create.isPending}
            aria-busy={create.isPending || undefined}
            className="min-h-[56px] w-full cursor-pointer rounded-[14px] border-0 bg-brand text-[17px] font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Pay {price}
          </button>
        ) : phase === 'pending' ? (
          <button
            key="different-number"
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-[52px] w-full cursor-pointer rounded-[14px] border border-input-border bg-surface text-base font-semibold text-ink"
          >
            Use a different number
          </button>
        ) : null
      }
    >
      <section aria-label="Order summary" className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4">
        <div className="flex justify-between gap-2.5">
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-bold">{copy.summaryTitle}</span>
            <span className="text-sm text-ink-2">{copy.summaryLine}</span>
          </span>
          <span className="whitespace-nowrap text-base font-extrabold">{price}</span>
        </div>
        <p className="m-0 border-t border-border pt-2.5 text-[13px] text-muted">{copy.note}</p>
      </section>

      {phase === 'form' && (
        <form id="pay-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-base font-bold">Pay with</legend>
            {summary.paymentMethods.map((m) => {
              const on = m.provider === provider;
              return (
                <button
                  key={m.provider}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setProvider(m.provider)}
                  className={cx(
                    'flex min-h-[60px] cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left text-ink',
                    on ? 'border-2 border-brand bg-brand-softer' : 'border border-zinc-300 bg-surface',
                  )}
                >
                  <span aria-hidden="true" className="h-8 w-8 rounded-[9px]" style={{ background: providerSwatch(m.provider) }} />
                  <span className="flex flex-1 flex-col">
                    <span className="text-base font-bold">{m.label}</span>
                    {m.hint && <span className="text-[13px] text-muted">{m.hint}</span>}
                  </span>
                  <span aria-hidden="true" className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-muted">
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                  </span>
                </button>
              );
            })}
          </fieldset>

          <NumberField copy={copy} dial={dial} providerLabel={providerLabel} value={number} onChange={(v) => { setNumber(v); setNumberError(null); }} error={numberError} />

          {formError && (
            <p role="alert" className="m-0 rounded-control border border-amber-300 bg-amber-50 p-3.5 text-sm font-semibold text-amber-900">
              {formError}
            </p>
          )}
        </form>
      )}

      {phase === 'pending' && payment && <Pending payment={payment} phone={receiptNumber(payment.msisdn, dial, copy.variant)} again={() => again.mutate()} sending={again.isPending} />}

      {phase === 'failed' && payment && (
        <section role="alert" className="flex flex-col gap-2.5 rounded-[14px] border border-amber-300 bg-amber-50 p-[18px]">
          <p className="m-0 text-base font-bold text-amber-900">Payment not completed</p>
          <p className="m-0 text-[15px] text-amber-900">{notCompletedMessage(payment)}</p>
          <button
            type="button"
            onClick={tryAgain}
            className="min-h-[44px] cursor-pointer self-start rounded-control border-0 bg-ink px-[18px] py-3 text-[15px] font-bold text-white"
          >
            Try again
          </button>
        </section>
      )}
    </Frame>
  );
}

function NumberField({
  copy, dial, providerLabel, value, onChange, error,
}: { copy: CheckoutCopy; dial: string; providerLabel: string; value: string; onChange: (v: string) => void; error: string | null }) {
  const input = (
    <input
      id="msisdn"
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? 'msisdn-help msisdn-err' : 'msisdn-help'}
      className={cx(
        'h-[54px] min-w-0 rounded-control border bg-surface px-3.5 text-lg text-ink',
        copy.variant === 'prefix' ? 'flex-1' : 'w-full tracking-[0.02em]',
        error ? 'border-red-600' : 'border-input-border',
      )}
    />
  );
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="msisdn" className="text-base font-bold">
        {copy.phoneLabel(providerLabel)}
      </label>
      {copy.variant === 'prefix' ? (
        <div className="flex gap-2">
          <span className="inline-flex h-[54px] shrink-0 items-center rounded-control border border-zinc-300 bg-soft px-3 font-semibold">{dial}</span>
          {input}
        </div>
      ) : (
        input
      )}
      {error && (
        <span id="msisdn-err" role="alert" className="text-[13px] font-semibold text-red-700">
          {error}
        </span>
      )}
      <span id="msisdn-help" className="text-[13px] text-muted">
        {copy.phoneHelp(providerLabel)}
      </span>
    </div>
  );
}

function Pending({ payment, phone, again, sending }: { payment: PaymentView; phone: string; again: () => void; sending: boolean }) {
  const left = useRemaining(payment.secondsLeft);
  return (
    <>
      <section role="status" className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-[18px] py-[22px] text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="#5B21B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="2" width="12" height="20" rx="2.5" />
            <path d="M11 18h2" />
          </svg>
        </span>
        <h1 className="m-0 text-[21px]">Approve on your phone</h1>
        <p className="m-0 text-[15px] leading-[1.55] text-ink-2">
          A {payment.providerLabel} prompt for <strong className="text-ink">{payment.priceLabel}</strong> was sent to{' '}
          <strong className="text-ink">{phone}</strong>. Enter your PIN to confirm.
        </p>
        <p className="m-0 text-sm text-muted">
          Waiting for confirmation…{payment.secondsLeft > 0 && <span className="tabular"> {mmss(left)}</span>}
        </p>
      </section>
      <p className="m-0 text-center text-sm text-ink-2">
        No prompt after a minute?{' '}
        <button type="button" onClick={again} disabled={sending} className="cursor-pointer border-0 bg-transparent px-1 py-2 text-sm font-semibold text-brand disabled:opacity-60">
          Send again
        </button>
      </p>
    </>
  );
}
