import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { claimAttempts, meKeys } from '../../api/me';
import type { MeResponse } from '../../api/types';
import { getStoredCountry } from '../../lib/country';
import { readGuestTokens } from '../../lib/guestTokens';
import { safeNext, signInPathFor } from '../../lib/next';
import { setNotice } from '../../lib/notice';
import { clearSessionHint, setSessionHint } from '../../lib/sessionHint';
import { setSystemState } from '../../lib/systemState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';
import { AuthFrame } from './AuthShell';
import { postAuthPath } from './authModel';

/**
 * Signing you in (AuthCallback.dc, AuthCallbackPhone.dc): where Google sends the browser back to (`/auth/callback?next=`).
 * The session cookie is already set; this loads the user, then goes to the setup step the API says is next, else to
 * `next`, else to the dashboard. No session means Google did not sign the person in: back to sign-in with the failure.
 */
export function AuthCallbackPage() {
  useDocumentTitle('Signing you in');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const accountExists = params.get('notice') === 'account_exists';
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      setSessionHint();
      try {
        // Not getSession(): a 401 here is "Google did not sign you in", not "your session expired".
        const session = await api<MeResponse>('/me');
        // Google's redirect cannot carry guest tokens: move this device's guest attempts onto the account now ("Save my result").
        const tokens = readGuestTokens();
        if (tokens.length > 0) await claimAttempts(tokens).catch(() => undefined);
        setSystemState(null);
        qc.removeQueries({ queryKey: ['admin'] });
        qc.setQueryData(meKeys.session, session);
        if (accountExists) setNotice('account_exists');
        navigate(postAuthPath(session.user, next), { replace: true });
      } catch {
        clearSessionHint();
        navigate(signInPathFor(next, { error: 'google_failed' }), { replace: true });
      }
    })();
  }, [accountExists, navigate, next, qc]);

  return (
    <AuthFrame homeTo={countryPath(getStoredCountry() ?? 'rw')}>
      <div className="mt-[60px] flex flex-col items-center gap-4 text-center">
        <span aria-hidden="true" className="inline-block h-11 w-11 animate-spin rounded-full border-4 border-border border-t-brand motion-reduce:animate-none" />
        <h1 role="status" className="m-0 text-[26px] font-bold">
          Signing you in
        </h1>
        <p className="m-0 text-base text-muted">This takes a few seconds.</p>
      </div>
    </AuthFrame>
  );
}
