import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { checkResetToken, resetPassword } from '../../api/auth';
import { ApiError } from '../../api/client';
import { Button, LinkButton } from '../../components/Button';
import { ErrorState, Loader } from '../../components/states';
import { cx } from '../../lib/cx';
import { authErrorMessage } from '../../lib/errorCopy';
import { getStoredCountry } from '../../lib/country';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';
import { AlertBox, AuthCard, AuthField, AuthFrame, AuthHeading } from './AuthShell';
import { PASSWORD_MIN_LENGTH, passwordAcceptable, passwordRules } from './authModel';

/**
 * Choose a new password (ResetPassword.dc, ResetPasswordPhone.dc): "For <email>" from the link's token, new password +
 * confirm, the two live rules. Saving does not sign in: it goes to the sign-in screen. A dead link has no artboard:
 * it shows the app's error state with a way to ask for a new link (MISSING_DESIGNS E4).
 */
export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const navigate = useNavigate();
  const token = useSearchParams()[0].get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const check = useQuery({ queryKey: ['auth', 'reset-token', token], queryFn: () => checkResetToken(token), enabled: !!token, retry: false, staleTime: Infinity });
  const save = useMutation({
    mutationFn: () => resetPassword({ token, password }),
    onSuccess: () => navigate('/sign-in', { replace: true }),
    onError: (e) => {
      const err = e instanceof ApiError ? e : new ApiError(0, 'network_error');
      setFormError(err.code === 'invalid_or_expired_token' ? 'This link is no longer valid. Ask for a new one.' : authErrorMessage(err));
    },
  });

  const home = countryPath(getStoredCountry() ?? 'rw');
  const dead = !token || (check.isError && check.error instanceof ApiError && check.error.status === 400);

  if (dead) {
    return (
      <AuthFrame homeTo={home} backHome>
        <AuthHeading title="Choose a new password" />
        <ErrorState title="This reset link is not valid" message="It may have expired or already been used. Ask for a new link.">
          <LinkButton to="/forgot-password" variant="final" size="sm" className="self-start font-bold">
            Send a new reset link
          </LinkButton>
        </ErrorState>
      </AuthFrame>
    );
  }
  if (check.isError) {
    return (
      <AuthFrame homeTo={home} backHome>
        <AuthHeading title="Choose a new password" />
        <ErrorState title="We could not check this link" onRetry={() => void check.refetch()} retrying={check.isFetching} />
      </AuthFrame>
    );
  }
  if (!check.data) {
    return (
      <AuthFrame homeTo={home} backHome>
        <AuthHeading title="Choose a new password" />
        <Loader label="Checking your link…" />
      </AuthFrame>
    );
  }

  const rules = passwordRules(password, confirm);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setTouched(true);
    if (passwordAcceptable(password, confirm)) save.mutate();
  };

  return (
    <AuthFrame homeTo={home} backHome>
      <AuthHeading title="Choose a new password">For {check.data.email}</AuthHeading>
      <AuthCard onSubmit={submit}>
        <AuthField
          id="rp-new"
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthField id="rp-confirm" label="Confirm new password" type="password" autoComplete="new-password" placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ul aria-label="Password rules" className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
          {rules.map((r) => (
            <li key={r.id} className={cx('flex items-center gap-2', r.ok ? 'text-free' : touched ? 'text-incorrect' : 'text-muted')}>
              <span aria-hidden="true" className="w-4 text-center font-bold">
                {r.ok ? '✓' : '○'}
              </span>
              <span>
                {r.label}
                <span className="sr-only">{r.ok ? ' (done)' : ' (not yet)'}</span>
              </span>
            </li>
          ))}
        </ul>
        {formError && <AlertBox title={formError} />}
        <Button type="submit" variant="primary" size="lg" block loading={save.isPending}>
          Save new password
        </Button>
      </AuthCard>
    </AuthFrame>
  );
}
