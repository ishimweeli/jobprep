import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { signUp } from '../../api/auth';
import { ApiError } from '../../api/client';
import { Button } from '../../components/Button';
import { authErrorMessage } from '../../lib/errorCopy';
import { getStoredCountry } from '../../lib/country';
import { INVALID_EMAIL_MESSAGE, isValidEmail, normalizeEmail } from '../../lib/email';
import { readGuestTokens } from '../../lib/guestTokens';
import { safeNext, signInPathFor, verifyEmailPath } from '../../lib/next';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';
import { AlertBox, AuthCard, AuthField, AuthFrame, AuthHeading, GoogleButton, GoogleNotice, OrDivider, PaidNote } from './AuthShell';
import { GOOGLE_NO_ACCOUNT, PASSWORD_HINT, PASSWORD_MIN_LENGTH, postAuthPath, signUpPaidText } from './authModel';
import { useGoogleButton, usePaidTestTitle } from './hooks';
import { LEGAL_URL, NEW_TAB } from '../legal/legalModel';
import { useSession } from './session';

/**
 * Create your account (SignUp.dc, SignUpPhone.dc): Google (only when the API says it is set up), name, email, password.
 * The account is not signed in yet: the next screen asks for the 6-digit code emailed to the address (VerifyEmail.dc).
 * `?next=` is kept all the way; when it leads to payment for a test, the blue note names the test (`fromPaid`).
 */
export function SignUpPage() {
  useDocumentTitle('Create your account', 'Create a free JobPrep account to practise MIFOTRA and Rwanda public-service recruitment exams and track your scores.');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const googleNoAccount = params.get('notice') === 'google_no_account';
  const { user, isLoading } = useSession();
  const google = useGoogleButton(next, 'sign_up');
  const paidTitle = usePaidTestTitle(next);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const country = getStoredCountry();
      return signUp({
        name: name.trim(),
        email: normalizeEmail(email),
        password,
        ...(country ? { countryCode: country.toUpperCase() } : {}),
        guestTokens: readGuestTokens(),
      });
    },
    onSuccess: (r) =>
      navigate(verifyEmailPath(r.email ?? normalizeEmail(email), next), { state: { cooldownSeconds: r.cooldownSeconds, expiresInSeconds: r.expiresInSeconds } }),
    onError: (e) => setFormError(authErrorMessage(e instanceof ApiError ? e : new ApiError(0, 'network_error'))),
  });

  if (user) return <Navigate to={postAuthPath(user, next)} replace />;
  if (isLoading) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const found = {
      name: name.trim().length >= 2 ? undefined : 'Enter your name (at least 2 letters).',
      email: isValidEmail(email) ? undefined : INVALID_EMAIL_MESSAGE,
      password: password.length >= PASSWORD_MIN_LENGTH ? undefined : PASSWORD_HINT,
    };
    setErrors(found);
    if (!found.name && !found.email && !found.password) create.mutate();
  };

  return (
    <AuthFrame homeTo={countryPath(getStoredCountry() ?? 'rw')} backHome>
      <AuthHeading title="Create your account">Free to start. Free sample tests need no account at all.</AuthHeading>
      {paidTitle && <PaidNote>{signUpPaidText(paidTitle)}</PaidNote>}
      <AuthCard onSubmit={submit}>
        {googleNoAccount && <AlertBox title={GOOGLE_NO_ACCOUNT.title} body={GOOGLE_NO_ACCOUNT.body} />}
        <GoogleButton onClick={google.onClick} />
        {google.notice && <GoogleNotice>{google.notice}</GoogleNotice>}
        <OrDivider />
        <AuthField id="su-name" label="Your name" type="text" autoComplete="name" maxLength={80} placeholder="e.g. Aline Uwase" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <AuthField
          id="su-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <AuthField
          id="su-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={errors.password ? undefined : PASSWORD_HINT}
          error={errors.password}
        />
        {formError && <AlertBox title={formError} />}
        <Button type="submit" variant="primary" size="lg" block loading={create.isPending}>
          Create account
        </Button>
      </AuthCard>
      <p className="m-0 text-center text-[15px] text-muted">
        Already have an account?{' '}
        <Link to={signInPathFor(next)} className="link font-semibold no-underline">
          Sign in
        </Link>
      </p>
      <p className="m-0 text-center text-[13px] text-muted">
        By continuing you agree to the{' '}
        <a href={LEGAL_URL.terms} {...NEW_TAB} aria-label="Terms (opens in a new tab)" className="link">
          Terms
        </a>{' '}
        and{' '}
        <a href={LEGAL_URL.privacy} {...NEW_TAB} aria-label="Privacy policy (opens in a new tab)" className="link">
          Privacy policy
        </a>
        .
      </p>
    </AuthFrame>
  );
}
