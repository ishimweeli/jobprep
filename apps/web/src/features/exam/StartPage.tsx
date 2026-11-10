import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { attemptKeys, startAttempt } from '../../api/attempts';
import { ApiError } from '../../api/client';
import { ErrorState, Loader } from '../../components/states';
import { addGuestToken } from '../../lib/guestTokens';
import { signUpPath } from '../../lib/next';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountrySlug } from '../country/hooks';

/**
 * Route `/:country/tests/:slug/start`. Starts the test (or resumes the running attempt), keeps a guest's secret
 * token on this device, then opens `/:country/exam/:attemptId`. Every exam needs an account: a guest is sent to sign up
 * and brought straight back here to start.
 */
export function StartPage() {
  useDocumentTitle('Starting your test');
  const slug = useActiveCountrySlug();
  const { slug: testSlug = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const started = useRef(false);
  const alive = useRef(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startAttempt(slug, testSlug).then(
      (res) => {
        if (res.guestToken) addGuestToken(res.guestToken);
        void qc.invalidateQueries({ queryKey: attemptKeys.inProgress });
        if (alive.current) navigate(countryPath(slug, 'exam', res.attemptId), { replace: true });
      },
      (e: unknown) => {
        if (!alive.current) return;
        const err = e instanceof ApiError ? e : new ApiError(0, 'network_error');
        if (err.code === 'account_required') {
          navigate(signUpPath(countryPath(slug, 'tests', testSlug, 'start')), { replace: true });
          return;
        }
        // A guest tapping a paid test sees "This test is part of Full Access" (GuestPaid.dc) on its details page.
        if (err.code === 'sign_in_required') {
          navigate(`${countryPath(slug, 'tests', testSlug)}?gate=paid`, { replace: true });
          return;
        }
        // Signed in without Full Access: continue at checkout.
        if (err.code === 'full_access_required') {
          navigate(`${countryPath(slug, 'checkout')}?test=${encodeURIComponent(testSlug)}`, { replace: true });
          return;
        }
        setError(err);
      },
    );
  }, [slug, testSlug, navigate, qc, attempt]);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[640px] px-4 py-10">
      {error ? (
        <ErrorState
          title="We could not start this test"
          message={error.isNetwork ? undefined : 'Please try again in a moment.'}
          onRetry={() => {
            started.current = false;
            setError(null);
            setAttempt((n) => n + 1);
          }}
        />
      ) : (
        <Loader label="Starting your test…" />
      )}
    </main>
  );
}
