import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { catalogKeys, getPricing } from '../../api/catalog';
import type { PricingResponse } from '../../api/types';
import { ActionLink, LinkButton } from '../../components/Button';
import { ROUTES_READY } from '../../lib/routesReady';
import { PhoneBackHeader } from '../../components/layout/Header';
import { QueryError, Loader } from '../../components/states';
import { cx } from '../../lib/cx';
import { signInPath } from '../../lib/next';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { countryPath, useActiveCountrySlug, useCountryDetail } from '../country/hooks';

const PROVIDER_COLOURS: Record<string, string> = { MTN_MOMO: '#FFCB05', AIRTEL_MONEY: '#E40000', MPESA: '#00A651' };

const FREE_LIST = ['At least one sample test for every position', 'Full timer and question navigator', 'Score and answer explanations', 'No account needed to start'];

/** Feature list for the paid plan. Duration comes from the API, never from this file. */
export function fullAccessFeatures(days: number): string[] {
  return [
    'Every mock test in every job category',
    `Unlimited attempts for ${days} days`,
    'Explanations for every question',
    'Weak-topic practice sets',
    'Score history across attempts',
  ];
}

export function PricingPage() {
  const slug = useActiveCountrySlug();
  useDocumentTitle('Pricing', 'Try free mock tests first, then unlock every job exam practice test with one simple plan. Pay with mobile money.');
  const q = useQuery({ queryKey: catalogKeys.pricing(slug), queryFn: () => getPricing(slug), staleTime: 60_000 });
  const detail = useCountryDetail(slug);
  const { user } = useSession();
  const data = q.data;

  return (
    <div>
      {!user && <PhoneBackHeader to={countryPath(slug)} label="Back to home" title="Pricing" />}
      <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-[1040px] flex-col gap-[18px] px-4 pb-8 pt-[22px] md:gap-8 md:px-6 md:pb-[72px] md:pt-12">
        {q.isError ? (
          <QueryError error={q.error} what="the pricing" onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : !data ? (
          <Loader label="Loading pricing…" />
        ) : (
          <PricingBody slug={slug} data={data} disclaimer={detail.data?.disclaimer ?? null} signedIn={!!user} />
        )}
      </main>
    </div>
  );
}

function PricingBody({ slug, data, disclaimer, signedIn }: { slug: string; data: PricingResponse; disclaimer: string | null; signedIn: boolean }) {
  const plan = data.fullAccess;
  const days = plan?.durationDays;
  const sellable = !!plan && plan.checkoutAvailable && !!plan.priceLabel;
  const methods = data.paymentMethods;

  return (
    <>
      <div className="flex flex-col gap-2 md:items-center md:gap-2.5 md:text-center">
        <h1 className="m-0 text-[22px] font-bold leading-[1.15] tracking-[-0.02em] text-heading md:text-2xl dark:text-night-heading">One price. Every mock test.</h1>
        <p className="m-0 max-w-[36em] text-base leading-normal text-ink-2 md:text-lg">
          Try free sample tests first. {days ? `When you are ready, one payment unlocks everything for ${days} days.` : ''}
        </p>
      </div>

      <div className="grid items-stretch gap-[18px] md:grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <section aria-labelledby="p-pack" className="order-1 flex flex-col gap-3.5 rounded-card border-2 border-brand bg-surface p-[19px] md:order-2 md:gap-4 md:rounded-[20px] md:p-[27px]">
          <h2 id="p-pack" className="m-0 text-[17px] font-bold">
            {plan ? `${plan.name} · ${plan.durationDays} days` : 'Full Access'}
          </h2>
          <p className="m-0 flex items-baseline gap-1.5 md:gap-2">
            <span className="text-[34px] font-bold md:text-[40px] md:tracking-tight">{plan?.priceLabel ?? 'Price coming soon'}</span>
            {plan?.priceLabel && plan.paidOnce && <span className="text-sm text-muted md:text-[15px]">paid once</span>}
          </p>
          {plan && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] text-ink-2 md:gap-2.5 md:text-base">
              {fullAccessFeatures(plan.durationDays).map((f) => (
                <Feature key={f} tone="brand">
                  {f}
                </Feature>
              ))}
            </ul>
          )}
          {sellable && (
            <ActionLink ready={ROUTES_READY.checkout} to={countryPath(slug, 'checkout')} variant="primary" block className="mt-auto py-3 text-[17px] md:py-[11px] md:text-base">
              Continue to payment
            </ActionLink>
          )}
          {plan && !plan.autoRenew && (
            <p className="m-0 text-center text-[13px] text-muted">
              <span className="md:hidden">No subscription. Nothing renews.</span>
              <span className="hidden md:inline">Access ends automatically. No subscription, nothing renews.</span>
            </p>
          )}
        </section>

        <section aria-labelledby="p-free" className="order-2 flex flex-col gap-3 rounded-card border border-border bg-surface p-5 md:order-1 md:gap-4 md:rounded-[20px] md:p-7">
          <div className="flex items-baseline justify-between md:block">
            <h2 id="p-free" className="m-0 text-[17px] font-bold">
              Free samples
            </h2>
            <p className="m-0 text-2xl font-bold md:mt-4 md:text-[40px] md:tracking-tight">{data.free.priceLabel ?? 'Free'}</p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] text-ink-2 md:gap-2.5 md:text-base">
            {FREE_LIST.filter((f) => !signedIn || !/No account needed/.test(f)).map((f) => (
              <Feature key={f} tone="free">
                {f}
              </Feature>
            ))}
          </ul>
          <LinkButton to={`${countryPath(slug, 'tests')}?price=free`} variant="secondary" block className="mt-auto py-3 text-base md:py-[11px]">
            Find a free test
          </LinkButton>
        </section>

        {data.interviewPrep && data.interviewPrep.priceLabel && <InterviewPlanCard slug={slug} plan={data.interviewPrep} signedIn={signedIn} />}
      </div>

      {methods.length > 0 && (
        <section aria-labelledby="pay" className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-[18px] md:flex-row md:flex-wrap md:items-center md:gap-x-8 md:gap-y-4 md:rounded-[20px] md:px-7 md:py-6">
          <h2 id="pay" className="m-0 text-[17px] font-bold md:flex-[1_1_240px]">
            Pay with Mobile Money
          </h2>
          <ul className="m-0 flex list-none gap-2 p-0 md:flex-wrap md:gap-2.5">
            {methods.map((m) => (
              <li key={m.provider} className="flex flex-1 items-center gap-2 rounded-control border border-border p-2.5 text-sm font-semibold md:flex-none md:gap-2.5 md:px-3.5 md:text-base">
                <span aria-hidden="true" className="h-6 w-6 flex-none rounded-[7px] md:h-7 md:w-7 md:rounded-lg" style={{ background: PROVIDER_COLOURS[m.provider] ?? '#CDD4DE' }} />
                {m.label}
              </li>
            ))}
          </ul>
          <p className="m-0 text-sm text-ink-2 md:flex-[1_1_100%] md:text-[15px]">
            <span className="md:hidden">Approve with your PIN on your phone. JobPrep never asks for your PIN.</span>
            <span className="hidden md:inline">You approve the payment on your phone with your Mobile Money PIN. JobPrep never asks for your PIN.</span>
          </p>
        </section>
      )}

      <Faq days={days} disclaimer={disclaimer} />
    </>
  );
}

/** Full Access + Interview prep (only while interview prep is switched on and priced). */
function InterviewPlanCard({ slug, plan, signedIn }: { slug: string; plan: NonNullable<PricingResponse['interviewPrep']>; signedIn: boolean }) {
  const hours = plan.interviewMinutes / 60;
  const { session } = useSession();
  const upgrade = !!session?.access.current && !!plan.upgradePriceLabel;
  const to = `${countryPath(slug, 'checkout')}?plan=interview`;
  return (
    <section aria-labelledby="p-interview" className="order-3 flex flex-col gap-3.5 rounded-card border border-border bg-surface p-5 md:gap-4 md:rounded-[20px] md:p-7">
      <h2 id="p-interview" className="m-0 text-[17px] font-bold">{plan.name} · {plan.durationDays} days</h2>
      <p className="m-0 flex items-baseline gap-1.5 md:gap-2">
        <span className="text-[34px] font-bold md:text-[40px] md:tracking-tight">{upgrade ? plan.upgradePriceLabel : plan.priceLabel}</span>
        <span className="text-sm text-muted md:text-[15px]">{upgrade ? 'to upgrade your Full Access' : 'paid once'}</span>
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] text-ink-2 md:gap-2.5 md:text-base">
        {[
          'Everything in Full Access',
          `${hours} hours with an AI interviewer that asks follow-up questions`,
          'Upload or paste any job description',
          'Scores and feedback on every answer',
          'Practice focused on your weak areas',
        ].map((f) => <Feature key={f} tone="brand">{f}</Feature>)}
      </ul>
      <LinkButton to={signedIn ? to : signInPath(to)} variant="primary" block className="mt-auto py-3 text-base md:py-[11px]">
        {upgrade ? 'Upgrade' : 'Get interview prep'}
      </LinkButton>
      <p className="m-0 text-center text-[13px] text-muted">Minutes are used only during an interview and last as long as your access.</p>
    </section>
  );
}

function Feature({ children, tone, className }: { children: React.ReactNode; tone: 'brand' | 'free'; className?: string }) {
  return (
    <li className={cx('flex gap-2.5', className)}>
      <Check size={20} strokeWidth={2.4} className={cx('mt-0.5 flex-none', tone === 'brand' ? 'text-brand' : 'text-correct')} aria-hidden="true" />
      {children}
    </li>
  );
}

function Faq({ days, disclaimer }: { days: number | undefined; disclaimer: string | null }) {
  const items = [
    {
      q: 'When does my access start?',
      a: `Immediately after your Mobile Money payment is confirmed.${days ? ` The ${days} days are counted from that moment.` : ''}`,
    },
    {
      q: 'Can I prepare for more than one position?',
      a: 'Yes. Full Access covers every mock test on JobPrep in your country, so one payment lets you practise for several positions.',
    },
    {
      q: 'Are these the real examination questions?',
      a: `No. JobPrep writes original practice questions on the topics recruitment exams cover. ${disclaimer ?? 'We are not affiliated with any government recruitment body.'}`,
    },
    {
      q: 'My payment went through but I have no access.',
      a: 'Open My progress and tap “Check payment”. If it still shows pending after 10 minutes, contact support with your transaction ID.',
    },
  ];
  return (
    <section aria-labelledby="faq" className="flex flex-col gap-2 md:gap-2.5">
      <h2 id="faq" className="m-0 mb-1 text-[17px] font-bold md:mb-1.5">
        Questions
      </h2>
      {items.map((i) => (
        <details key={i.q} className="group rounded-[10px] border border-border bg-surface p-3.5 md:rounded-[14px] md:px-[18px] md:py-4">
          <summary className="cursor-pointer text-[15px] font-semibold md:text-base">{i.q}</summary>
          <p className="m-0 mt-2 text-sm leading-[1.55] text-ink-2 md:mt-2.5 md:text-[15px] md:leading-[1.6]">{i.a}</p>
        </details>
      ))}
    </section>
  );
}
