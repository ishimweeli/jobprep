import { useQueryClient } from '@tanstack/react-query';
import { useReducer, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { requestOtp, signIn } from '../../api/auth';
import { meKeys } from '../../api/me';
import { Button } from '../../components/Button';
import { PhoneBackHeader } from '../../components/layout/Header';
import { SiteShell } from '../../components/layout/SiteLayout';
import { cx } from '../../lib/cx';
import { INVALID_EMAIL_MESSAGE, isValidEmail, normalizeEmail } from '../../lib/email';
import { readGuestTokens } from '../../lib/guestTokens';
import { ADMIN_STALE_NOTICE, ADMIN_STALE_REASON, safeNext } from '../../lib/next';
import { setSystemState } from '../../lib/systemState';
import { useCountdown } from '../../lib/useCountdown';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountry } from '../country/hooks';
import { EmailField } from './EmailField';
import { useSession } from './session';
import { OTP_LENGTH, OtpInput } from './OtpInput';
import {
  codeErrorBox, emailRequestError, expiresMinutes, initialSignInState, minutesLabel, resendLabel, signInReducer, type ErrorBox,
} from './signInModel';

/** The artboard's coloured box: red for a wrong or dead code, amber for expired / offline / "please wait". */
export function ErrorBoxView({ box, id }: { box: ErrorBox; id?: string }) {
  const tone = box.tone === 'red' ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900';
  return (
    <div id={id} role="alert" className={cx('flex flex-col gap-0.5 rounded-control border px-3.5 py-3', tone)}>
      <strong className="text-[15px]">{box.title}</strong>
      <span className="text-sm">{box.body}</span>
    </div>
  );
}

/**
 * Sign in (SignIn.dc, SignInPhone.dc): email address, then the 6-digit code. After success the user returns to a
 * same-site `?next=` or to their country dashboard. The request answer is the same for unknown addresses, and the
 * copy never says whether an account exists.
 */
export function SignInPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  // The admin area asked for a fresh sign-in (its session is more than 12 hours old): stay on this screen even though a session exists.
  const adminStale = params.get('reason') === ADMIN_STALE_REASON;
  const { user, isLoading } = useSession();
  const { slug } = useActiveCountry();
  const [state, dispatch] = useReducer(signInReducer, initialSignInState);
  const [emailInput, setEmailInput] = useState('');
  const [code, setCode] = useState('');
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCountdown(0);

  const email = normalizeEmail(emailInput);
  const suffix = next ? `?next=${encodeURIComponent(next)}` : '';

  if (user && !adminStale) return <Navigate to={next ?? countryPath(user.countryCode.toLowerCase(), 'progress')} replace />;
  if (isLoading) return null;

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!isValidEmail(emailInput)) {
      dispatch({ type: 'requestFailed', error: { kind: 'email', message: INVALID_EMAIL_MESSAGE } });
      return;
    }
    setBusy(true);
    try {
      const r = await requestOtp({ purpose: 'sign_in', email });
      setCode('');
      setCodeHint(null);
      cooldown.start(r.cooldownSeconds);
      dispatch({ type: 'codeSent', response: r });
    } catch (err) {
      const failure = emailRequestError(err, state.expiresInSeconds);
      if (failure.kind === 'box' && failure.box.waitSeconds) cooldown.start(failure.box.waitSeconds);
      dispatch({ type: 'requestFailed', error: failure });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setCodeHint(null);
    try {
      const r = await requestOtp({ purpose: 'sign_in', email });
      setCode('');
      cooldown.start(r.cooldownSeconds);
      dispatch({ type: 'codeSent', response: r });
    } catch (err) {
      const box = codeErrorBox(err, state.expiresInSeconds);
      if (box.waitSeconds) cooldown.start(box.waitSeconds);
      dispatch({ type: 'resendFailed', box });
    } finally {
      setResending(false);
    }
  };

  const verify = async (e?: FormEvent) => {
    e?.preventDefault();
    if (state.locked || busy) return;
    if (code.length !== OTP_LENGTH) {
      setCodeHint(`Enter all ${OTP_LENGTH} digits of the code.`);
      return;
    }
    setCodeHint(null);
    setBusy(true);
    try {
      const r = await signIn({ email, code, guestTokens: readGuestTokens() });
      setSystemState(null);
      qc.removeQueries({ queryKey: ['admin'] });
      await qc.invalidateQueries({ queryKey: meKeys.session });
      navigate(next ?? countryPath(r.user.countryCode.toLowerCase(), 'progress'), { replace: true });
    } catch (err) {
      const box = codeErrorBox(err, state.expiresInSeconds);
      if (box.clearCode) setCode('');
      dispatch({ type: 'verifyFailed', box });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SiteShell>
      <PhoneBackHeader to={countryPath(slug)} title="Sign in" />
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-start justify-center bg-surface px-4 py-5 outline-none md:bg-page md:py-14">
        <div className="flex w-full max-w-[460px] flex-col gap-[18px] md:rounded-[20px] md:border md:border-border md:bg-surface md:p-7">
          {state.step === 'email' ? (
            <form onSubmit={sendCode} noValidate className="flex flex-col gap-[18px]">
              <div className="flex flex-col gap-1.5">
                <h1 className="m-0 text-[26px] tracking-tight">Sign in</h1>
                <p className="m-0 text-[15px] text-ink-2">Enter the email address you signed up with. We’ll email you a 6-digit code — there is no password.</p>
              </div>
              {adminStale && (
                <p role="status" className="m-0 rounded-control border border-amber-300 bg-amber-50 px-3.5 py-3 text-[15px] font-semibold text-amber-900">
                  {ADMIN_STALE_NOTICE}
                </p>
              )}
              <EmailField id="si-email" value={emailInput} onChange={setEmailInput} error={state.emailError} />
              {state.box && <ErrorBoxView box={state.box} />}
              <Button type="submit" variant="primary" size="lg" loading={busy}>
                Send code
              </Button>
              <p className="m-0 text-sm text-ink-2">
                New to JobPrep?{' '}
                <Link to={`/sign-up${suffix}`} className="link font-semibold">
                  Create a free account
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={verify} noValidate className="flex flex-col gap-[18px]">
              <div className="flex flex-col gap-1.5">
                <h1 className="m-0 text-[26px] tracking-tight">Enter your code</h1>
                <p className="m-0 text-[15px] text-ink-2">
                  If <strong className="break-all text-ink">{email}</strong> has a JobPrep account, a code is on its way to your email. It works for{' '}
                  {minutesLabel(expiresMinutes(state.expiresInSeconds))}.
                </p>
              </div>
              <OtpInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setCodeHint(null);
                  dispatch({ type: 'typing' });
                }}
                disabled={busy}
                invalid={!!state.box?.invalidBoxes}
                describedBy={state.box ? 'si-code-error' : undefined}
              />
              {state.box && <ErrorBoxView box={state.box} id="si-code-error" />}
              {codeHint && (
                <p role="alert" className="m-0 text-sm font-semibold text-incorrect">
                  {codeHint}
                </p>
              )}
              <button
                type="submit"
                aria-disabled={state.locked || undefined}
                aria-busy={busy || undefined}
                className={cx(
                  'inline-flex min-h-[52px] cursor-pointer items-center justify-center rounded-control border-0 bg-brand px-5 text-base font-bold text-white hover:bg-brand-hover',
                  state.locked && 'cursor-not-allowed opacity-45 hover:bg-brand',
                )}
              >
                Verify and sign in
              </button>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => void resend()}
                  disabled={!cooldown.done || resending}
                  className="min-h-[44px] cursor-pointer border-0 bg-transparent py-2 font-semibold text-brand disabled:cursor-not-allowed disabled:text-muted"
                >
                  {resendLabel(cooldown.remaining, state.needsNewCode)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCode('');
                    setCodeHint(null);
                    dispatch({ type: 'useDifferentEmail' });
                  }}
                  className="min-h-[44px] cursor-pointer border-0 bg-transparent py-2 font-semibold text-ink-2"
                >
                  Use a different email
                </button>
              </div>
              <p className="m-0 hidden text-[13px] text-muted md:block">
                No code after a few minutes? Check the address, or <Link to={`/sign-up${suffix}`} className="link">create an account</Link> if you have not signed up yet.
              </p>
            </form>
          )}
        </div>
      </main>
    </SiteShell>
  );
}
