import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import type { MeResponse, SetupStep } from '../../api/types';
import { SkeletonList } from '../../components/states';
import { safeNext, setupPath, signInPath } from '../../lib/next';
import { AuthFrame } from '../auth/AuthShell';
import { useSession } from '../auth/session';
import { countryPath } from '../country/hooks';
import { getStoredCountry } from '../../lib/country';

/**
 * The setup screens and Change exam country need an account: a guest goes to sign-in and comes back here afterwards.
 * `children` gets the loaded session. A setup `step` whose earlier steps are not done yet (the API's `nextStep` comes first)
 * sends the person to that earlier step: the API refuses to finish setup without a country and a job category.
 */
const ORDER: SetupStep[] = ['country', 'category', 'goal'];

export function SetupGuard({ step, children }: { step?: SetupStep; children: (session: MeResponse) => ReactNode }) {
  const next = safeNext(useSearchParams()[0].get('next'));
  const { session, user, isLoading } = useSession();
  const { pathname, search } = useLocation();
  if (isLoading) {
    return (
      <AuthFrame homeTo={countryPath(getStoredCountry() ?? 'rw')}>
        <SkeletonList count={2} label="Loading…" />
      </AuthFrame>
    );
  }
  if (!user || !session) return <Navigate to={signInPath(`${pathname}${search}`)} replace />;
  const pending = session.user.onboarding.nextStep;
  if (step && pending && ORDER.indexOf(pending) < ORDER.indexOf(step)) return <Navigate to={setupPath(pending, next)} replace />;
  return <>{children(session)}</>;
}
