import { Navigate } from 'react-router-dom';
import { ErrorState, Loader } from '../../components/states';
import { resolveInitialCountry } from '../../lib/country';
import { useSession } from '../auth/session';
import { countryPath, useCountries } from './hooks';

/** `/` -> the signed-in user's country, else last-used / browser region / first live country. */
export function RootRedirect() {
  const { user, isLoading: sessionLoading } = useSession();
  const countries = useCountries();

  if (user) return <Navigate to={countryPath(user.countryCode.toLowerCase())} replace />;
  if (sessionLoading || countries.isLoading) {
    return (
      <div className="mx-auto max-w-[640px] p-6">
        <Loader label="Loading…" />
      </div>
    );
  }
  if (countries.isError || !countries.data) {
    return (
      <div className="mx-auto max-w-[640px] p-6">
        <ErrorState title="We could not load JobPrep" onRetry={() => void countries.refetch()} />
      </div>
    );
  }
  const slug = resolveInitialCountry(countries.data);
  return <Navigate to={slug ? countryPath(slug) : '/choose-country'} replace />;
}
