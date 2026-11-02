import { useQueryClient } from '@tanstack/react-query';
import { useReducer, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { requestOtp, signIn } from '../../api/auth';
import { ApiError } from '../../api/client';
import { meKeys } from '../../api/me';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { PhoneBackHeader } from '../../components/layout/Header';
import { SiteShell } from '../../components/layout/SiteLayout';
import { cx } from '../../lib/cx';
import { readGuestTokens } from '../../lib/guestTokens';
import { safeNext } from '../../lib/next';
import { formatPhone, groupNational, isValidNational, nationalDigits, toE164 } from '../../lib/phone';
import { setSystemState } from '../../lib/systemState';
import { useCountdown } from '../../lib/useCountdown';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountry } from '../country/hooks';
import { useSession } from './session';
import { OTP_LENGTH, OtpInput } from './OtpInput';
import {
  codeErrorBox, expiresMinutes, initialSignInState, minutesLabel, phoneRequestError, resendLabel, signInReducer, type ErrorBox,
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
 * Sign in (SignIn.dc, SignInPhone.dc): phone number, then the 6-digit code. After success the user returns to a
 * same-site `?next=` or to their country dashboard. The request answer is the same for unknown numbers, and the
 * copy never says whether an account exists.
 */
export function SignInPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const next = safeNext(useSearchParams()[0].get('next'));
  const { user, isLoading } = useSession();
  const { slug, country } = useActiveCountry();
  const [state, dispatch] = useReducer(signInReducer, initialSignInState);
  const [national, setNational] = useState('');
  const [code, setCode] = useState('');
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCountdown(0);

  const dial = country?.dialCode ?? '+250';
  const countryCode = country?.code ?? slug.toUpperCase();
  const countryName = country?.name ?? 'Rwanda';
  const e164 = toE164(national, dial);
  const suffix = next ? `?next=${encodeURIComponent(next)}` : '';

  if (user) return <Navigate to={next ?? countryPath(user.countryCode.toLowerCase(), 'progress')} replace />;
  if (isLoading) return null;

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!isValidNational(national)) {
      dispatch({ type: 'requestFailed', error: phoneRequestError(new ApiError(400, 'invalid_phone'), countryName) });
      return;
    }
    setBusy(true);
    try {
      const r = await requestOtp({ purpose: 'sign_in', phone: e164, countryCode });
      setCode('');
      setCodeHint(null);
      cooldown.start(r.cooldownSeconds);
      dispatch({ type: 'codeSent', response: r });
    } catch (err) {
      const failure = phoneRequestError(err, countryName, state.expiresInSeconds);
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
      const r = await requestOtp({ purpose: 'sign_in', phone: e164, countryCode });
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
      const r = await signIn({ phone: e164, countryCode, code, guestTokens: readGuestTokens() });
      setSystemState(null);
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

  const chip = (
    <Link
      to="/choose-country"
      aria-label={`${countryCode} ${dial}, ${countryName}. Change country`}
      className="inline-flex h-[52px] flex-none items-center gap-1.5 rounded-control border border-input-border bg-surface px-3 font-bold text-ink no-underline hover:text-ink"
    >
      <span className="rounded bg-ink px-1 text-[11px] text-white">{countryCode}</span>
      {dial}
      <span aria-hidden="true">▾</span>
    </Link>
  );

  return (
    <SiteShell>
      <PhoneBackHeader to={countryPath(slug)} title="Sign in" />
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-start justify-center bg-surface px-4 py-5 outline-none md:bg-page md:py-14">
        <div className="flex w-full max-w-[460px] flex-col gap-[18px] md:rounded-[20px] md:border md:border-border md:bg-surface md:p-7">
          {state.step === 'phone' ? (
            <form onSubmit={sendCode} noValidate className="flex flex-col gap-[18px]">
              <div className="flex flex-col gap-1.5">
                <h1 className="m-0 text-[26px] tracking-tight">Sign in</h1>
                <p className="m-0 text-[15px] text-ink-2">Enter the phone number you signed up with. We’ll text you a 6-digit code — there is no password.</p>
              </div>
              <Field
                id="si-tel"
                label="Phone number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={groupNational(national)}
                onChange={(e) => setNational(nationalDigits(e.target.value, dial).slice(0, 9))}
                error={state.phoneError}
                className="text-[17px]"
                leading={chip}
              />
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
                  If <strong className="text-ink">{formatPhone(e164, dial)}</strong> has a JobPrep account, a code is on its way by SMS. It works for{' '}
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
                    dispatch({ type: 'useDifferentNumber' });
                  }}
                  className="min-h-[44px] cursor-pointer border-0 bg-transparent py-2 font-semibold text-ink-2"
                >
                  Use a different number
                </button>
              </div>
              <p className="m-0 hidden text-[13px] text-muted md:block">
                No code after a few minutes? Check the number, or <Link to={`/sign-up${suffix}`} className="link">create an account</Link> if you have not signed up yet.
              </p>
            </form>
          )}
        </div>
      </main>
    </SiteShell>
  );
}
