import { Link } from 'react-router-dom';
import type { ExamDetail } from '../../api/types';
import { buttonClasses } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { signInPath, signUpPath } from '../../lib/next';
import { countryPath } from '../country/hooks';

/** Where a guest lands after creating an account or signing in: the checkout for this test. */
export const guestPaidNext = (slug: string, testSlug: string) => `${countryPath(slug, 'checkout')}?test=${encodeURIComponent(testSlug)}`;

/**
 * "This test is part of Full Access" (GuestPaid.dc, GuestPaidPhone.dc): what a guest sees after tapping a paid
 * test. Create an account (back to checkout afterwards), sign in, or try the free sample instead.
 * Price, days, payment methods and the country come from the API.
 */
export function GuestPaidDialog({
  open, onClose, exam, slug, countryName,
}: { open: boolean; onClose: () => void; exam: ExamDetail; slug: string; countryName: string }) {
  const next = guestPaidNext(slug, exam.slug);
  const days = exam.pricing?.durationDays;
  const price = exam.pricing?.priceLabel;
  const methods = exam.pricing?.paymentMethods ?? [];
  const sample = exam.freeSample;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="This test is part of Full Access"
      variant="responsive"
      titleClassName="m-0 pr-9 text-[22px] font-bold tracking-tight"
      desktopPanelClassName="md:max-w-[500px] md:rounded-[20px] md:p-7"
      panelClassName="relative flex flex-col gap-3 md:gap-3.5"
      headerAction={
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent text-[22px] text-ink-2"
        >
          <span aria-hidden="true">×</span>
        </button>
      }
    >
      <p className="m-0 text-[15px] leading-[1.55] text-ink-2">
        <strong className="text-ink">{exam.title}</strong> is not free. Full Access unlocks every mock test in {countryName}
        {days ? ` for ${days} days` : ''}
        {price ? (
          <>
            {' '}
            for one payment of <strong className="text-ink">{price}</strong>
          </>
        ) : null}
        .
      </p>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        <li className="flex items-start gap-3">
          <span aria-hidden="true" className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand-hover">
            1
          </span>
          <span className="text-[15px] leading-normal">
            <strong>Create a free account</strong> with your email address, so your access belongs to you on any device.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span aria-hidden="true" className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand-hover">
            2
          </span>
          <span className="text-[15px] leading-normal">
            <strong>{methods.length > 0 ? `Pay with ${methods.join(' or ')}.` : 'Pay with Mobile Money.'}</strong> You come straight back to this test.
          </span>
        </li>
      </ol>
      <Link to={signUpPath(next)} className={buttonClasses({ variant: 'primary', size: 'lg' })}>
        Create account and continue
      </Link>
      <Link to={signInPath(next)} className={buttonClasses({ variant: 'neutral', size: 'sm', className: '!min-h-[48px] !px-[18px] !font-semibold' })}>
        I already have an account
      </Link>
      {sample && (
        <Link to={countryPath(slug, 'tests', sample.slug, 'start')} className="link p-2.5 text-center text-[15px] font-semibold">
          Try the free {sample.questionCount}-question {exam.profession} sample instead
        </Link>
      )}
    </Dialog>
  );
}
