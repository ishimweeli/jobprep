import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { resendVerification, signIn } from '../../api/auth';
import { ApiError } from '../../api/client';
import { meKeys } from '../../api/me';
import { Button } from '../../components/Button';
import { getStoredCountry } from '../../lib/country';
import { INVALID_EMAIL_MESSAGE, isValidEmail, normalizeEmail } from '../../lib/email';
import { readGuestTokens } from '../../lib/guestTokens';
import { ADMIN_STALE_NOTICE, ADMIN_STALE_REASON, safeNext, signUpPathFor, verifyEmailPath } from '../../lib/next';
import { setSystemState } from '../../lib/systemState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';
import { AlertBox, AuthCard, AuthField, AuthFrame, AuthHeading, ErrorBoxView, GoogleButton, GoogleNotice, OrDivider } from './AuthShell';
import { GOOGLE_FAILED, postAuthPath, signInError, type SignInError } from './authModel';
import { codeErrorBox } from './codeErrorModel';
import { useGoogleButton } from './hooks';
import { useSession } from './session';

const linkClass = 'link text-sm no-underline';

/**
 * Sign in (SignIn.dc, SignInPhone.dc): Google, email + password, "Forgot password?", "Remember me", "Resend verification".
 * Three error boxes as drawn: wrong email or password, email not verified, too many tries. After success the person
 * goes to the setup step the API says is next, else to a same-site `?next=`, else to their dashboard.
 * `?reason=admin_stale` keeps the screen open although a session exists ("Please sign in again to use the admin area").
 */
export function SignInPage() {
  useDocumentTitle('Sign in', 'Sign in to JobPrep to continue your recruitment exam practice and see your progress.');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const adminStale = params.get('reason') === ADMIN_STALE_REASON;
  const googleFailed = params.get('error') === 'google_failed';
  const { user, isLoading } = useSession();
  const google = useGoogleButton(next);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<SignInError | null>(null);
  const [resendError, setResendError] = useState<ReturnType<typeof codeErrorBox> | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  if (user && !adminStale) return <Navigate to={postAuthPath(user, next)} replace />;
  if (isLoading) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setResendError(null);
    const eOk = isValidEmail(email);
    setEmailError(eOk ? null : INVALID_EMAIL_MESSAGE);
    setPasswordError(password ? null : 'Enter your password.');
    if (!eOk || !password) return;
    setBusy(true);
    try {
      const r = await signIn({ email: normalizeEmail(email), password, remember, guestTokens: readGuestTokens() });
      setSystemState(null);
      qc.removeQueries({ queryKey: ['admin'] });
      await qc.invalidateQueries({ queryKey: meKeys.session });
      navigate(postAuthPath(r.user, next), { replace: true });
    } catch (err) {
      setError(signInError(err));
    } finally {
      setBusy(false);
    }
  };

  /** "Resend verification": a new code goes to the address typed above, then the "Check your email" screen opens for it. */
  const resend = async () => {
    setError(null);
    setResendError(null);
    if (!isValidEmail(email)) {
      setEmailError(INVALID_EMAIL_MESSAGE);
      return;
    }
    setEmailError(null);
    setResending(true);
    try {
      const r = await resendVerification(normalizeEmail(email));
      navigate(verifyEmailPath(normalizeEmail(email), next), { state: { cooldownSeconds: r.cooldownSeconds, expiresInSeconds: r.expiresInSeconds } });
    } catch (err) {
      // A code was sent a moment ago (at sign-up or by an earlier tap): that code still works, so open its screen with the wait.
      if (err instanceof ApiError && err.code === 'otp_cooldown') {
        navigate(verifyEmailPath(normalizeEmail(email), next), { state: { cooldownSeconds: err.retryAfterSeconds ?? 0, expiresInSeconds: 600 } });
        return;
      }
      setResendError(codeErrorBox(err, 600));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthFrame homeTo={countryPath(getStoredCountry() ?? 'rw')} backHome>
      <AuthHeading title="Sign in">Welcome back. Your practice is waiting.</AuthHeading>
      <AuthCard onSubmit={(e) => void submit(e)}>
        {adminStale && (
          <p role="status" className="m-0 rounded-control border border-flagged/30 bg-flagged-bg px-3.5 py-3 text-[15px] font-semibold text-flagged-ink">
            {ADMIN_STALE_NOTICE}
          </p>
        )}
        <GoogleButton onClick={google.onClick} />
        {google.notice && <GoogleNotice>{google.notice}</GoogleNotice>}
        <OrDivider>or sign in with email</OrDivider>
        {googleFailed && <AlertBox title={GOOGLE_FAILED.title} body={GOOGLE_FAILED.body} />}
        {error && <AlertBox title={error.title} body={error.body} />}
        {resendError && <ErrorBoxView box={resendError} />}
        <AuthField
          id="si-email"
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
        <AuthField
          id="si-password"
          label="Password"
          labelAside={
            <Link to="/forgot-password" className={linkClass}>
              Forgot password?
            </Link>
          }
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
        />
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="m-0 h-[18px] w-[18px] accent-brand" />
            Remember me
          </label>
          <button type="button" onClick={() => void resend()} disabled={resending} className={`${linkClass} cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:text-muted`}>
            Resend verification
          </button>
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Sign in
        </Button>
      </AuthCard>
      <p className="m-0 text-center text-[15px] text-muted">
        New to JobPrep?{' '}
        <Link to={signUpPathFor(next)} className="link font-semibold no-underline">
          Create an account
        </Link>
      </p>
    </AuthFrame>
  );
}
