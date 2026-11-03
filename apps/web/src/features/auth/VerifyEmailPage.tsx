import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { resendVerification, verifyEmail } from '../../api/auth';
import { meKeys } from '../../api/me';
import { cx } from '../../lib/cx';
import { getStoredCountry } from '../../lib/country';
import { normalizeEmail } from '../../lib/email';
import { readGuestTokens } from '../../lib/guestTokens';
import { safeNext, signUpPathFor } from '../../lib/next';
import { setSystemState } from '../../lib/systemState';
import { useCountdown } from '../../lib/useCountdown';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';
import { AuthFrame, AuthHeading, BackLink, ErrorBoxView } from './AuthShell';
import { postAuthPath } from './authModel';
import { codeErrorBox, expiresMinutes, minutesLabel, resendLabel, type ErrorBox } from './codeErrorModel';
import { OTP_LENGTH, OtpInput } from './OtpInput';

/** What the sign-up (or "Resend verification") answered: the wait before another code and how long this one works. */
interface Sent {
  cooldownSeconds?: number;
  expiresInSeconds?: number;
}

const DEFAULT_EXPIRES_SECONDS = 600;

/**
 * Check your email (VerifyEmail.dc, VerifyEmailPhone.dc): the 6-digit code emailed at sign-up. Verify signs the person in
 * and continues to setup (or `?next=`). "Send a new code" waits out the API's cooldown; "Use a different email" goes back
 * to sign-up. Wrong code: tries left from the API; expired / too many tries: the box asks for a new code.
 */
export function VerifyEmailPage() {
  useDocumentTitle('Check your email');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const email = normalizeEmail(params.get('email') ?? '');
  const sent = (useLocation().state ?? {}) as Sent;
  const [expiresInSeconds, setExpiresInSeconds] = useState(sent.expiresInSeconds ?? DEFAULT_EXPIRES_SECONDS);
  const cooldown = useCountdown(sent.cooldownSeconds ?? 0);
  const [code, setCode] = useState('');
  const [box, setBox] = useState<ErrorBox | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  if (!email) return <Navigate to={signUpPathFor(next)} replace />;

  const verify = async (e?: FormEvent) => {
    e?.preventDefault();
    if (locked || busy) return;
    setNotice(null);
    if (code.length !== OTP_LENGTH) {
      setHint(`Enter all ${OTP_LENGTH} digits of the code.`);
      return;
    }
    setHint(null);
    setBusy(true);
    try {
      const r = await verifyEmail({ email, code, guestTokens: readGuestTokens() });
      setSystemState(null);
      qc.removeQueries({ queryKey: ['admin'] });
      await qc.invalidateQueries({ queryKey: meKeys.session });
      navigate(postAuthPath(r.user, next), { replace: true });
    } catch (err) {
      const b = codeErrorBox(err, expiresInSeconds);
      if (b.clearCode) setCode('');
      setBox(b);
      setLocked(b.locksVerify);
      setNeedsNewCode(b.needsNewCode);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setHint(null);
    setNotice(null);
    try {
      const r = await resendVerification(email);
      setCode('');
      setBox(null);
      setLocked(false);
      setNeedsNewCode(false);
      setExpiresInSeconds(r.expiresInSeconds);
      cooldown.start(r.cooldownSeconds);
      setNotice('We sent you a new code.');
    } catch (err) {
      const b = codeErrorBox(err, expiresInSeconds);
      if (b.waitSeconds) cooldown.start(b.waitSeconds);
      setBox(b);
    } finally {
      setResending(false);
    }
  };

  const minutes = minutesLabel(expiresMinutes(expiresInSeconds));

  return (
    <AuthFrame homeTo={countryPath(getStoredCountry() ?? 'rw')} backHome>
      <AuthHeading
        title="Check your email"
        back={<BackLink to={signUpPathFor(next)} />}
      >
        We sent a 6-digit code to <strong className="break-all text-ink">{email}</strong>.
      </AuthHeading>
      <form onSubmit={(e) => void verify(e)} noValidate className="flex flex-col gap-5 md:gap-[22px]">
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            setHint(null);
            // Typing after a wrong code takes the red state away; a dead code stays dead.
            if (!locked && !needsNewCode) setBox(null);
          }}
          disabled={busy}
          invalid={!!box?.invalidBoxes}
          describedBy={box ? 've-error' : undefined}
        />
        {box && <ErrorBoxView box={box} id="ve-error" />}
        {hint && (
          <p role="alert" className="m-0 text-sm font-semibold text-incorrect">
            {hint}
          </p>
        )}
        {notice && (
          <p role="status" className="m-0 text-sm font-semibold text-free">
            {notice}
          </p>
        )}
        <button
          type="submit"
          aria-disabled={locked || undefined}
          aria-busy={busy || undefined}
          className={cx(
            'inline-flex h-[50px] w-full cursor-pointer items-center justify-center rounded-control border-0 bg-brand px-3.5 text-base font-semibold text-white hover:bg-brand-hover',
            locked && 'cursor-not-allowed opacity-45 hover:bg-brand',
          )}
        >
          Verify
        </button>
        <div className="flex flex-wrap justify-center gap-5">
          <button
            type="button"
            onClick={() => void resend()}
            disabled={!cooldown.done || resending}
            className="h-11 cursor-pointer rounded-[10px] border-0 bg-transparent px-3.5 text-sm font-semibold text-brand hover:text-brand-hover disabled:cursor-not-allowed disabled:text-muted"
          >
            {resendLabel(cooldown.remaining)}
          </button>
          <Link to={signUpPathFor(next)} className="inline-flex h-11 items-center rounded-[10px] px-3.5 text-sm font-semibold text-brand no-underline hover:text-brand-hover">
            Use a different email
          </Link>
        </div>
      </form>
      <p className="m-0 text-center text-sm text-muted">The code works for {minutes}. Check your spam folder if you don’t see it.</p>
    </AuthFrame>
  );
}
