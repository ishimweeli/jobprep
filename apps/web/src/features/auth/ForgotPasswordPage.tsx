import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../../api/auth';
import { ApiError } from '../../api/client';
import { Button } from '../../components/Button';
import { authErrorMessage } from '../../lib/errorCopy';
import { getStoredCountry } from '../../lib/country';
import { INVALID_EMAIL_MESSAGE, isValidEmail, normalizeEmail } from '../../lib/email';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';
import { AlertBox, AuthCard, AuthField, AuthFrame, AuthHeading, BackLink, authTextLink, SuccessBox } from './AuthShell';

/**
 * Reset your password (ForgotPassword.dc, ForgotPasswordPhone.dc): email, then the "Check your email" box.
 * The API answers 200 for every address, so the sent state never says whether an account exists.
 */
export function ForgotPasswordPage() {
  useDocumentTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: () => forgotPassword(normalizeEmail(email)),
    onSuccess: () => setSent(true),
    onError: (e) => setFormError(authErrorMessage(e instanceof ApiError ? e : new ApiError(0, 'network_error'))),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const ok = isValidEmail(email);
    setEmailError(ok ? null : INVALID_EMAIL_MESSAGE);
    if (ok) send.mutate();
  };

  return (
    <AuthFrame homeTo={countryPath(getStoredCountry() ?? 'rw')} backHome>
      <AuthHeading title="Reset your password" back={<BackLink to="/sign-in" />}>
        Enter your email and we’ll send you a link.
      </AuthHeading>
      {!sent ? (
        <AuthCard onSubmit={submit}>
          <AuthField
            id="fp-email"
            label="Email"
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
          {formError && <AlertBox title={formError} />}
          <Button type="submit" variant="primary" size="lg" block loading={send.isPending}>
            Send reset link
          </Button>
        </AuthCard>
      ) : (
        <>
          <SuccessBox title="Check your email">If an account exists for that address, a reset link is on its way. It works for 1 hour.</SuccessBox>
          <div className="flex justify-center">
            <Link to="/sign-in" className={authTextLink}>
              Back to sign in
            </Link>
          </div>
        </>
      )}
    </AuthFrame>
  );
}
