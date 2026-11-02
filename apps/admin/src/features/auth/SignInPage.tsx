import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReducer, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { adminMe, adminSignIn, keys, requestAdminOtp } from '../../api/admin';
import { ApiError } from '../../api/client';
import { Logo } from '../../components/ui';
import { cx } from '../../lib/cx';
import { formatPhone, groupNational, isValidNational, nationalDigits, toE164 } from '../../lib/phone';
import { firstAllowedPath } from '../../lib/permissions';
import { useCountdown } from '../../lib/useCountdown';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { OTP_LENGTH, OtpInput } from './OtpInput';
import { safeNext } from './session';
import { codeErrorBox, expiresMinutes, initialSignInState, minutesLabel, phoneRequestError, resendLabel, signInReducer, type ErrorBox } from './signInModel';

const DIAL = '+250';
const COUNTRY = 'RW';
const COUNTRY_NAME = 'Rwanda';

/** The artboard's coloured box: red for a wrong or dead code, amber for expired / offline / "please wait". */
function ErrorBoxView({ box, id }: { box: ErrorBox; id?: string }) {
  const tone = box.tone === 'red' ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900';
  return (
    <div id={id} role="alert" className={cx('flex flex-col gap-0.5 rounded-[12px] border px-3.5 py-3', tone)}>
      <strong className="text-[15px]">{box.title}</strong>
      <span className="text-sm">{box.body}</span>
    </div>
  );
}

/**
 * Admin sign-in. There is no admin artboard (MISSING_DESIGNS A1), so this is the candidate sign-in (SignIn.dc,
 * SignInPhone.dc) with the same copy and error states, calling the admin endpoints. Every number on screen
 * comes from the API (`expiresInSeconds`, `cooldownSeconds`, `triesLeft`, 429 wait), never from the artboard.
 */
export function SignInPage() {
  useDocumentTitle('Sign in · Admin');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isDesktop = useIsDesktop();
  const next = safeNext(useSearchParams()[0].get('next'));
  const me = useQuery({ queryKey: keys.me, queryFn: adminMe, retry: false, staleTime: 60_000 });
  const [state, dispatch] = useReducer(signInReducer, initialSignInState);
  const [national, setNational] = useState('');
  const [code, setCode] = useState('');
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCountdown(0);
  const e164 = toE164(national, DIAL);

  if (me.data) return <Navigate to={next ?? firstAllowedPath(me.data.permissions) ?? '/'} replace />;

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!isValidNational(national)) {
      dispatch({ type: 'requestFailed', error: phoneRequestError(new ApiError(400, 'invalid_phone'), COUNTRY_NAME) });
      return;
    }
    setBusy(true);
    try {
      const r = await requestAdminOtp(e164);
      setCode('');
      setCodeHint(null);
      cooldown.start(r.cooldownSeconds);
      dispatch({ type: 'codeSent', response: r });
    } catch (err) {
      const failure = phoneRequestError(err, COUNTRY_NAME, state.expiresInSeconds);
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
      const r = await requestAdminOtp(e164);
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
      const { admin } = await adminSignIn(e164, code);
      qc.setQueryData(keys.me, admin);
      navigate(next ?? firstAllowedPath(admin.permissions) ?? '/', { replace: true });
    } catch (err) {
      const box = codeErrorBox(err, state.expiresInSeconds);
      if (box.clearCode) setCode('');
      dispatch({ type: 'verifyFailed', box });
    } finally {
      setBusy(false);
    }
  };

  const primary = 'inline-flex min-h-[52px] cursor-pointer items-center justify-center rounded-[12px] border-0 bg-brand px-5 text-base font-bold text-white hover:text-white';

  return (
    <div className={cx('flex min-h-[100dvh] flex-col', isDesktop ? 'bg-page' : 'bg-white')}>
      {isDesktop ? (
        <header className="border-b border-border bg-white">
          <div className="mx-auto flex max-w-[1200px] items-center gap-2.5 px-6 py-3.5">
            <Logo size={32} />
            <span className="text-xl font-extrabold tracking-tight">JobPrep</span>
            <span className="rounded-md bg-[#3F3F46] px-[7px] py-[3px] text-[11px] font-bold text-[#E4E4E7]">ADMIN</span>
          </div>
        </header>
      ) : (
        <header className="flex min-h-[60px] items-center gap-2 border-b border-border bg-white px-4 py-2">
          <span className="flex-1 text-[17px] font-bold">Sign in</span>
          <span className="rounded-md bg-ink px-[7px] py-[3px] text-[11px] font-bold text-white">ADMIN</span>
        </header>
      )}
      <main id="main-content" tabIndex={-1} className={cx('flex flex-1 items-start justify-center outline-none', isDesktop ? 'px-4 py-14' : 'px-4 py-5')}>
        <div className={cx('flex w-full max-w-[460px] flex-col gap-[18px]', isDesktop && 'rounded-[20px] border border-border bg-white p-7')}>
          {state.step === 'phone' ? (
            <form onSubmit={sendCode} noValidate className="flex flex-col gap-[18px]">
              <div className="flex flex-col gap-1.5">
                <h1 className="m-0 text-[26px] tracking-tight">Sign in</h1>
                <p className="m-0 text-[15px] text-ink-2">Enter the phone number you signed up with. We’ll text you a 6-digit code — there is no password.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="si-tel" className="text-sm font-bold">Phone number</label>
                <div className="flex gap-2">
                  <span className="inline-flex h-[52px] flex-none items-center gap-1.5 rounded-[12px] border border-input-border bg-white px-3 font-bold text-ink">
                    <span className="rounded bg-ink px-1 text-[11px] text-white">{COUNTRY}</span>
                    {DIAL}
                  </span>
                  <input
                    id="si-tel"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={groupNational(national)}
                    onChange={(e) => setNational(nationalDigits(e.target.value, DIAL).slice(0, 9))}
                    aria-invalid={state.phoneError ? true : undefined}
                    aria-describedby={state.phoneError ? 'si-err' : undefined}
                    className={cx('h-[52px] min-w-0 flex-1 rounded-[12px] border bg-white px-3.5 text-[17px] text-ink', state.phoneError ? 'border-incorrect' : 'border-input-border')}
                  />
                </div>
                {state.phoneError && (
                  <p id="si-err" role="alert" className="m-0 text-sm font-semibold text-incorrect">
                    {state.phoneError}
                  </p>
                )}
              </div>
              {state.box && <ErrorBoxView box={state.box} />}
              <button type="submit" aria-busy={busy || undefined} className={primary}>
                Send code
              </button>
            </form>
          ) : (
            <form onSubmit={verify} noValidate className="flex flex-col gap-[18px]">
              <div className="flex flex-col gap-1.5">
                <h1 className="m-0 text-[26px] tracking-tight">Enter your code</h1>
                <p className="m-0 text-[15px] text-ink-2">
                  If <strong className="text-ink">{formatPhone(e164, DIAL)}</strong> has a JobPrep account, a code is on its way by SMS. It works for{' '}
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
              <button type="submit" aria-disabled={state.locked || undefined} aria-busy={busy || undefined} className={cx(primary, state.locked && 'cursor-not-allowed opacity-45')}>
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
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
