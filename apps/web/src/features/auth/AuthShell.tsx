import { useId, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { StrokeIcon } from '../../components/StrokeIcon';
import { cx } from '../../lib/cx';
import type { ErrorBox } from './codeErrorModel';

/**
 * The frame of every sign-in, sign-up and setup screen (SignUp.dc, SignIn.dc, VerifyEmail.dc, Onboard*.dc, ChangeCountry.dc ...
 * and their Phone twins): the page colour, the logo top left, and a single centred column. One responsive component per screen:
 * the desktop artboard is 1440 wide with a 448px column, the phone artboard 390 wide with 20px gutters.
 */
export function AuthFrame({ children, homeTo, backHome }: { children: ReactNode; homeTo: string; backHome?: boolean }) {
  return (
    <div className="min-h-screen bg-page px-5 pb-8 pt-5 md:px-6 md:pb-16">
      {backHome ? (
        <div className="flex items-center justify-between gap-3">
          <Logo to={homeTo} size="lg" />
          <Link to={homeTo} className="link inline-flex min-h-[44px] items-center gap-1.5 px-1 text-[15px] font-medium no-underline">
            <ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" />
            Back to home
          </Link>
        </div>
      ) : (
        <Logo to={homeTo} size="lg" />
      )}
      <main id="main-content" tabIndex={-1} className="mx-auto mt-7 flex w-full max-w-[448px] flex-col gap-5 outline-none md:mt-12 md:gap-[22px]">
        {children}
      </main>
    </div>
  );
}

/** "Step 2 of 3": the active step is a longer pill (OnboardCountry.dc and the others). */
export function StepDots({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div role="img" aria-label={`Step ${step} of ${total}`} className="flex gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx('h-2 rounded bg-brand', i + 1 === step ? 'w-6' : 'w-2')} />
      ))}
    </div>
  );
}

const backClass = 'inline-flex min-h-[32px] items-center gap-1.5 self-start border-0 bg-transparent p-0 text-base font-normal text-brand no-underline hover:text-brand-hover';

/** The "‹ Back" link above a heading. */
export function BackLink({ to, onClick, children = 'Back' }: { to?: string; onClick?: () => void; children?: ReactNode }) {
  const inner = (
    <>
      <ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" />
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={backClass}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cx(backClass, 'cursor-pointer')}>
      {inner}
    </button>
  );
}

/** Heading block: optional back link, the 30/34px title and the grey lead line. */
export function AuthHeading({ title, back, children }: { title: ReactNode; back?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {back}
      <h1 className="m-0 text-[30px] font-bold leading-[1.15] tracking-[-0.02em] md:text-[34px]">{title}</h1>
      {children && <p className="m-0 text-base leading-normal text-muted">{children}</p>}
    </div>
  );
}

/** The white card holding a form (padding 20 on phones, 24 on desktop). A `<form>` when `onSubmit` is given. */
export function AuthCard({ children, onSubmit }: { children: ReactNode; onSubmit?: (e: FormEvent<HTMLFormElement>) => void }) {
  const cls = 'flex flex-col gap-4 rounded-card border border-border bg-surface p-5 md:p-6';
  return onSubmit ? (
    <form onSubmit={onSubmit} noValidate className={cls}>
      {children}
    </form>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** Label (14px, 600), 48px input, optional hint and inline error wired with ids. */
export function AuthField({
  label, hint, error, labelAside, id, className, ...rest
}: { label: ReactNode; hint?: ReactNode; error?: string | null; labelAside?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={inputId} className="text-sm font-semibold">
          {label}
        </label>
        {labelAside}
      </div>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'box-border h-12 w-full min-w-0 rounded-control border bg-surface px-3.5 text-base text-ink placeholder:text-muted',
          error ? 'border-incorrect' : 'border-input-border',
          className,
        )}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="m-0 text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="m-0 text-sm font-semibold text-incorrect">
          {error}
        </p>
      )}
    </div>
  );
}

/** The plain status line under the Google button while Google is not set up (no artboard: MISSING_DESIGNS E4). */
export function GoogleNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="m-0 rounded-control border border-flagged/30 bg-flagged-bg px-3.5 py-3 text-sm font-semibold text-flagged-ink">
      {children}
    </p>
  );
}

/** "Continue with Google" (SignUp.dc, SignIn.dc): a button that leaves for Google. */
export function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 cursor-pointer items-center justify-center gap-2.5 rounded-control border border-border bg-surface text-[15px] font-semibold text-ink md:h-12"
    >
      <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[13px] font-bold text-brand">
        G
      </span>
      Continue with Google
    </button>
  );
}

/** The "or" / "or sign in with email" rule between the Google button and the form. */
export function OrDivider({ children = 'or' }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** The designed error box (SignIn.dc, red) and the verify-email boxes (red or amber). */
export function AlertBox({ title, body, tone = 'red', id }: { title: ReactNode; body?: ReactNode; tone?: 'red' | 'amber'; id?: string }) {
  const toneClass = tone === 'red' ? 'border-incorrect/25 bg-incorrect-bg text-incorrect' : 'border-flagged/30 bg-flagged-bg text-flagged-ink';
  return (
    <div id={id} role="alert" className={cx('flex flex-col gap-0.5 rounded-control border px-3.5 py-3', toneClass)}>
      <strong className="text-[15px]">{title}</strong>
      {body && <span className="text-sm">{body}</span>}
    </div>
  );
}

export const ErrorBoxView = ({ box, id }: { box: ErrorBox; id?: string }) => <AlertBox id={id} title={box.title} body={box.body} tone={box.tone} />;

/** The green "Check your email" box of Forgot password. */
export function SuccessBox({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-1 rounded-control border border-correct/25 bg-correct-bg px-4 py-3.5 text-correct">
      <strong className="text-base">{title}</strong>
      <span className="text-[15px] leading-normal">{children}</span>
    </div>
  );
}

/** The blue "After you create your account … payment for <test>" note (fromPaid variants). */
export function PaidNote({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-control border border-brand-soft bg-brand-softer px-3.5 py-3 text-sm leading-normal text-brand-hover">
      <StrokeIcon name="access" className="mt-px flex-none" />
      <span>{children}</span>
    </div>
  );
}

/** Centred secondary text link under a card ("Skip for now", "Back to sign in"). */
export const authTextLink = 'inline-flex min-h-[44px] items-center rounded-[10px] px-3.5 text-sm font-semibold text-brand no-underline hover:text-brand-hover';
