import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getMockTest, catalogKeys } from '../../api/catalog';
import { ApiError, isApiError } from '../../api/client';
import { meKeys } from '../../api/me';
import { createPayment, getCheckout, getPayment, paymentKeys, resendPayment } from '../../api/payments';
import type { CheckoutSummary, PaymentView } from '../../api/types';
import { buttonClasses } from '../../components/Button';
import { QueryError, SkeletonList } from '../../components/states';
import { authErrorMessage } from '../../lib/errorCopy';
import { cx } from '../../lib/cx';
import { formatDate, mmss } from '../../lib/format';
import { signInPath } from '../../lib/next';
import { formatPhone } from '../../lib/phone';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { useRemaining } from '../exam/useRemaining';
import {
  canPay, checkoutCopy, displayNumber, notCompletedMessage, phaseFor, POLL_INTERVAL_MS, priceText, providerSwatch, receiptNumber, shouldPoll, toMsisdn,
  type CheckoutCopy,
} from './checkoutModel';
import {
  cardKindFor, exampleNumber, invalidNumberMessage, otherProvider, resultCard, type ResultAction, type ResultCard, type ResultContext,
} from './checkoutResults';
import { PayDone } from './PayDone';

/**
 * The checkout column. Phone: header with back arrow, content, sticky pay button. Desktop (CheckoutStates.dc): the site
 * header, then a 480 px column with the "Get Full Access" heading and the button inline.
 */
function Frame({ back, chip, children, footer, heading }: { back: string; chip?: string; children: React.ReactNode; footer?: React.ReactNode; heading?: 'h1' | 'p' }) {
  const H = heading ?? 'p';
  return (
    <div className="flex flex-1 flex-col bg-page">
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col bg-page md:flex-none md:px-4 md:pb-14 md:pt-10">
        <header className="flex items-center gap-1 border-b border-border bg-surface px-2 py-2.5 md:hidden">
          <Link to={back} aria-label="Back" className="inline-flex h-11 w-11 items-center justify-center text-ink no-underline hover:text-ink">
            <ArrowLeft size={22} aria-hidden="true" />
          </Link>
          <span className="flex-1 text-[17px] font-bold">Get Full Access</span>
          {chip && <span className="mr-2 rounded-md bg-soft px-2 py-1 text-xs font-bold text-ink-2">{chip}</span>}
        </header>
        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col gap-4 px-4 py-[18px] outline-none md:flex-none md:px-0 md:py-0">
          <H className="m-0 hidden text-[26px] font-bold tracking-tight md:block md:pb-0">Get Full Access</H>
          {children}
        </main>
        {footer && (
          <footer className="sticky bottom-0 border-t border-border bg-surface px-4 pb-4 pt-3 md:static md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-4">{footer}</footer>
        )}
      </div>
    </div>
  );
}

export function CheckoutPage() {
  useDocumentTitle('Get Full Access');
  const slug = useActiveCountrySlug();
  const [params] = useSearchParams();
  const testSlug = params.get('test');
  const paymentParam = params.get('payment');
  const checkMode = params.get('check') === '1';
  const { user, isLoading } = useSession();
  const summaryQ = useQuery({ queryKey: paymentKeys.checkout, queryFn: getCheckout, enabled: !!user, staleTime: 0, retry: false });
  const testQ = useQuery({
    queryKey: catalogKeys.detail(slug, testSlug ?? ''),
    queryFn: () => getMockTest(slug, testSlug ?? ''),
    enabled: !!testSlug && !!user,
    staleTime: 60_000,
    retry: false,
  });

  const here = `${countryPath(slug, 'checkout')}${testSlug ? `?test=${encodeURIComponent(testSlug)}` : ''}`;
  // A guest sees "This test is part of Full Access" (GuestPaid.dc) on the test; with no test, they sign in first.
  if (!isLoading && !user) {
    return <Navigate to={testSlug ? `${countryPath(slug, 'tests', testSlug)}?gate=paid` : signInPath(here)} replace />;
  }

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
      initialPaymentId={paymentParam}
      checkMode={checkMode}
    />
  );
}

function CheckoutFlow({
  summary, slug, back, testSlug, testTitle, initialPaymentId, checkMode,
}: {
  summary: CheckoutSummary; slug: string; back: string; testSlug: string | null; testTitle: string | undefined; initialPaymentId: string | null; checkMode: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const dial = summary.country.dialCode;
  // Buying while access runs adds days after the current end: the API says when the new access ends.
  const until = formatDate(summary.newAccessEndsAt ?? new Date(Date.now() + (summary.plan?.durationDays ?? 30) * 86_400_000).toISOString(), true);
  const copy = checkoutCopy(summary, until);

  const [provider, setProvider] = useState(summary.paymentMethods[0]?.provider ?? '');
  const [number, setNumber] = useState(() => (summary.prefillPhone ? displayNumber(summary.prefillPhone, dial, copy.variant) : ''));
  const [numberError, setNumberError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(initialPaymentId);
  const [editing, setEditing] = useState(false);
  const [providerDown, setProviderDown] = useState<null | { provider: string }>(null);
  /** "Check payment" from the dashboard: the user says they approved, so a payment still pending reads "Still waiting". */
  const [checking, setChecking] = useState(checkMode);
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
    setProviderDown(null);
    setChecking(false);
  };
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'invalid_phone') {
      setNumberError(invalidNumberMessage(summary.country.name, exampleNumber(summary.country.code)));
    } else if (e instanceof ApiError && e.code === 'provider_unavailable') {
      setProviderDown({ provider });
    } else if (e instanceof ApiError && e.code === 'checkout_unavailable') {
      setFormError('Checkout is not available yet.');
    } else {
      setFormError(isApiError(e) && e.isNetwork ? authErrorMessage(e) : 'We could not start the payment. You were not charged. Please try again.');
    }
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
      setNumberError(invalidNumberMessage(summary.country.name, exampleNumber(summary.country.code)));
      return;
    }
    setNumberError(null);
    create.mutate(msisdn);
  };
  const backToForm = (nextProvider?: string) => {
    idemKey.current = crypto.randomUUID();
    setPaymentId(null);
    setEditing(false);
    setFormError(null);
    setProviderDown(null);
    setChecking(false);
    if (nextProvider) setProvider(nextProvider);
  };

  if (phase === 'done' && payment) {
    return <PayDone payment={payment} summary={summary} slug={slug} testSlug={testSlug} testTitle={testTitle} />;
  }

  const price = priceText(summary);
  const chip = copy.variant === 'prefix' ? `${summary.country.code} · ${summary.country.currencyCode}` : undefined;
  const sellable = canPay(summary);
  const other = otherProvider(summary.paymentMethods, payment?.provider ?? providerDown?.provider ?? provider);
  const shownPhone = payment ? formatPhone(payment.msisdn, dial) : formatPhone(toMsisdn(number, dial) ?? `${dial}${number.replace(/\D/g, '')}`, dial);
  const ctx: ResultContext = {
    providerLabel: payment?.providerLabel ?? summary.paymentMethods.find((m) => m.provider === providerDown?.provider)?.label ?? providerLabel,
    otherProviderLabel: other?.label ?? null,
    phone: shownPhone,
    countryName: summary.country.name,
    accessUntil: summary.currentAccess ? formatDate(summary.currentAccess.endsAt, true) : null,
    planDays: summary.plan?.durationDays ?? null,
  };

  // Which result card (if any) the screen shows instead of the form.
  let card: ResultCard | null = null;
  const settled = payment ? cardKindFor(payment.status) : null;
  if (providerDown && !payment) card = resultCard('provider_unavailable', ctx);
  else if (phase === 'failed' && payment && settled) card = resultCard(settled, ctx);
  else if (phase === 'pending' && payment && checking) card = resultCard('waiting', ctx);
  else if (phase === 'form' && !payment && !editing && summary.currentAccess && !summary.currentAccess.endingSoon) card = resultCard('already_has_access', ctx);

  const act = (action: ResultAction) => {
    switch (action) {
      case 'tryAgain':
        return backToForm();
      case 'payOther':
        return backToForm(other?.provider);
      case 'tryProviderAgain':
        return backToForm(providerDown?.provider ?? payment?.provider);
      case 'differentNumber':
        backToForm(payment?.provider);
        setNumber('');
        return;
      case 'sendNewPrompt': {
        // Same number, same operator, a fresh request.
        const msisdn = payment?.msisdn;
        if (!msisdn) return backToForm();
        idemKey.current = crypto.randomUUID();
        setProvider(payment.provider);
        return createPayment({ provider: payment.provider, msisdn, idempotencyKey: idemKey.current }).then(adopt, onError);
      }
      case 'checkAgain':
        void pay.refetch();
        return;
      case 'dashboard':
        return navigate(countryPath(slug, 'progress'));
    }
  };

  if (card) {
    return (
      <Frame back={back} chip={chip}>
        <ResultSummary summary={summary} price={price} />
        <ResultCardView card={card} onAction={act} />
      </Frame>
    );
  }

  return (
    <Frame
      back={back}
      chip={chip}
      heading={phase === 'form' ? 'h1' : 'p'}
      footer={
        phase === 'form' ? (
          <button
            key="pay"
            type="submit"
            form="pay-form"
            disabled={!sellable || create.isPending || !!numberError}
            aria-busy={create.isPending || undefined}
            className="min-h-[56px] w-full cursor-pointer rounded-[14px] border-0 bg-brand text-[17px] font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45 md:min-h-[52px] md:rounded-control md:text-base"
          >
            {price ? `Pay ${price}` : 'Pay'}
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
          {price && <span className="whitespace-nowrap text-base font-extrabold">{price}</span>}
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
            onClick={() => backToForm()}
            className="min-h-[44px] cursor-pointer self-start rounded-control border-0 bg-ink px-[18px] py-3 text-[15px] font-bold text-white"
          >
            Try again
          </button>
        </section>
      )}
    </Frame>
  );
}

const ICON_PATH: Record<ResultCard['icon'], string> = {
  x: 'M18 6L6 18 M6 6l12 12',
  clock: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 9v4l2.5 2.5 M9 2h6',
  warn: 'M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  hour: 'M6 2h12 M6 22h12 M7 2v4l5 5 5-5V2 M7 22v-4l5-5 5 5v4',
  ok: 'M5 12.5l4.5 4.5L19 7.5',
};
const TONE: Record<ResultCard['tone'], string> = {
  red: 'bg-red-100 text-red-800',
  amber: 'bg-flagged-bg text-flagged-ink',
  purple: 'bg-brand-soft text-brand-hover',
  green: 'bg-free-bg text-free',
};

/** The order summary above a result card (CheckoutStates.dc). */
function ResultSummary({ summary, price }: { summary: CheckoutSummary; price: string | null }) {
  return (
    <section aria-label="Order summary" className="flex justify-between gap-2.5 rounded-card border border-border bg-surface p-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-bold">JobPrep Full Access · {summary.country.name}</span>
        <span className="text-sm text-ink-2">
          Every {summary.country.name} mock test · {summary.plan?.durationDays ?? 30} days
        </span>
      </span>
      {price && <span className="whitespace-nowrap text-base font-extrabold tabular">{price}</span>}
    </section>
  );
}

function ResultCardView({ card, onAction }: { card: ResultCard; onAction: (a: ResultAction) => void }) {
  return (
    <>
      <section role="status" className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-[18px] py-6 text-center">
        <span className={cx('inline-flex h-16 w-16 items-center justify-center rounded-full', TONE[card.tone])}>
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICON_PATH[card.icon]} />
          </svg>
        </span>
        <h1 className="m-0 text-[22px]">{card.title}</h1>
        <p className="m-0 text-[15px] leading-[1.55] text-ink-2">{card.body}</p>
        {card.notCharged && <p className="m-0 text-[15px] font-bold text-ink">You were not charged.</p>}
      </section>
      <button type="button" onClick={() => onAction(card.cta.action)} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'cursor-pointer' })}>
        {card.cta.label}
      </button>
      {card.alt && (
        <button
          type="button"
          onClick={() => onAction(card.alt!.action)}
          className="cursor-pointer border-0 bg-transparent p-2.5 text-center text-[15px] font-semibold text-brand hover:text-brand-hover"
        >
          {card.alt.label}
        </button>
      )}
    </>
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
        'h-[54px] min-w-0 rounded-control bg-surface px-3.5 text-lg text-ink',
        copy.variant === 'prefix' ? 'flex-1' : 'w-full tracking-[0.02em]',
        error ? 'border-2 border-incorrect' : 'border border-input-border',
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
        <span id="msisdn-err" role="alert" className="text-sm font-semibold text-incorrect">
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
