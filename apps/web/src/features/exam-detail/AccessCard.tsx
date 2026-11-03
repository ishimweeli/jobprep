import type { ExamDetail } from '../../api/types';
import { ActionLink, buttonClasses } from '../../components/Button';
import { ROUTES_READY } from '../../lib/routesReady';
import { countryPath } from '../country/hooks';

/**
 * What the CTA area shows for an exam. Pure data -> view model so the rules are unit-testable:
 *  - price / duration / currency only ever come from the API (`pricing.priceLabel`, `pricing.durationDays`)
 *  - FREE and GRANTED tests start directly; LOCKED tests offer Full Access + the free sample
 * Copy is the artboards' (ExamDetail.dc / ExamDetailPhone.dc / States.dc "Unlocked · N days left").
 */
export interface AccessView {
  kind: 'free' | 'granted' | 'locked';
  /** Small label above the price ("This test", "Full Access · 30 days"). */
  label: string;
  /** Big text ("Free", "RWF 2,000"). */
  headline: string;
  note: string | null;
  startPath: string;
  checkoutPath: string;
  /** Link target for "Get Full Access": checkout, remembering which test to start afterwards. */
  checkoutTo: string;
  samplePath: string | null;
  sampleLabel: string | null;
  /** Desktop note under the buttons ("Pay with MTN MoMo or Airtel Money", "No account needed…"). */
  footNote: string | null;
  /** Locked, but the country has no sellable price: no purchase button is shown. */
  canBuy: boolean;
  getFullAccessLabel: string | null;
}

export function accessView(exam: ExamDetail, slug: string): AccessView {
  const base = {
    startPath: countryPath(slug, 'tests', exam.slug, 'start'),
    checkoutPath: countryPath(slug, 'checkout'),
    checkoutTo: `${countryPath(slug, 'checkout')}?test=${encodeURIComponent(exam.slug)}`,
    samplePath: null,
    sampleLabel: null,
    footNote: null,
    canBuy: false,
    getFullAccessLabel: null,
  };

  if (exam.access.state === 'FREE') {
    return {
      ...base,
      kind: 'free',
      label: 'This test',
      headline: 'Free',
      note: exam.attempts === 'UNLIMITED' ? 'Unlimited attempts' : null,
      footNote: 'No account needed. Sign in afterwards to save your result.',
    };
  }
  if (exam.access.state === 'GRANTED') {
    const d = exam.access.daysLeft;
    return {
      ...base,
      kind: 'granted',
      label: 'This test',
      headline: d !== null ? `Unlocked · ${d} ${d === 1 ? 'day' : 'days'} left` : 'Unlocked',
      note: exam.attempts === 'UNLIMITED' ? 'Unlimited attempts' : null,
    };
  }
  const p = exam.pricing;
  const price = p?.priceLabel ?? null;
  return {
    ...base,
    kind: 'locked',
    label: p?.durationDays ? `Full Access · ${p.durationDays} days` : 'Full Access',
    headline: price ?? '',
    note: 'One payment. Every mock test in every category, unlimited attempts.',
    samplePath: exam.freeSample ? countryPath(slug, 'tests', exam.freeSample.slug, 'start') : null,
    sampleLabel: exam.freeSample ? `Try the free ${exam.freeSample.questionCount}-question sample` : null,
    footNote: p && p.paymentMethods.length > 0 ? `Pay with ${p.paymentMethods.join(' or ')}` : null,
    canBuy: !!p && p.checkoutAvailable && !!price,
    getFullAccessLabel: price ? `Get Full Access · ${price}` : null,
  };
}

/**
 * Guests who tap "Get Full Access" see the "This test is part of Full Access" dialog (GuestPaid.dc) instead of going
 * straight to checkout: `onBuy` replaces the link.
 */
function BuyButton({ view, onBuy, className, children }: { view: AccessView; onBuy?: () => void; className: string; children: React.ReactNode }) {
  if (onBuy) {
    return (
      <button type="button" onClick={onBuy} className={buttonClasses({ variant: 'primary', block: true, className: `cursor-pointer ${className}` })}>
        {children}
      </button>
    );
  }
  return (
    <ActionLink ready={ROUTES_READY.checkout} to={view.checkoutTo} variant="primary" block className={className}>
      {children}
    </ActionLink>
  );
}

/** Desktop sidebar card. */
export function AccessCard({ view, onBuy }: { view: AccessView; onBuy?: () => void }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-[22px]">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-muted">{view.label}</span>
        <span className="text-3xl font-bold">{view.headline}</span>
        {view.note && <span className="text-sm text-ink-2">{view.note}</span>}
      </div>
      {view.kind === 'locked' ? (
        <>
          {view.canBuy && (
            <BuyButton view={view} onBuy={onBuy} className="py-[11px]">
              {view.getFullAccessLabel}
            </BuyButton>
          )}
          {view.samplePath && (
            <ActionLink ready={ROUTES_READY.examStart} to={view.samplePath} variant="secondary" size="sm" block className="py-[13px]">
              {view.sampleLabel}
            </ActionLink>
          )}
        </>
      ) : (
        <ActionLink ready={ROUTES_READY.examStart} to={view.startPath} variant="primary" block className="py-[11px]">
          Get started
        </ActionLink>
      )}
      {view.footNote && <p className="m-0 text-center text-[13px] text-muted">{view.footNote}</p>}
    </div>
  );
}

/** Phone fixed bottom bar: summary line + action(s) (ExamDetailPhone.dc). */
export function PhoneCtaBar({ view, onBuy }: { view: AccessView; onBuy?: () => void }) {
  const big = 'py-3 text-[17px]';
  return (
    <div data-testid="cta-bar" className="sticky bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-surface px-4 pb-4 pt-3 md:hidden">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">{view.label}</span>
        <span className="text-lg font-semibold">{view.headline}</span>
      </div>
      {view.kind === 'locked' ? (
        <>
          {view.canBuy && (
            <BuyButton view={view} onBuy={onBuy} className={big}>
              Unlock with Mobile Money
            </BuyButton>
          )}
          {view.samplePath && (
            <ActionLink ready={ROUTES_READY.examStart} to={view.samplePath} variant="ghost" size="sm" block className="py-2">
              {view.sampleLabel}
            </ActionLink>
          )}
        </>
      ) : (
        <ActionLink ready={ROUTES_READY.examStart} to={view.startPath} variant="primary" block className={big}>
          Get started
        </ActionLink>
      )}
    </div>
  );
}
