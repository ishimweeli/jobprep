import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { countriesKeys, getCountry } from '../../api/countries';
import { meKeys, patchOnboarding } from '../../api/me';
import type { CountrySummary, MeResponse } from '../../api/types';
import { Button } from '../../components/Button';
import { ErrorState, Loader } from '../../components/states';
import { setStoredCountry } from '../../lib/country';
import { authErrorMessage } from '../../lib/errorCopy';
import { formatDate } from '../../lib/format';
import { setupPath } from '../../lib/next';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AlertBox, AuthFrame, AuthHeading, authTextLink, BackLink } from '../auth/AuthShell';
import { dashboardPath } from '../auth/authModel';
import { countryPath, useCountries } from '../country/hooks';
import { ChoiceList, type Choice } from '../setup/ChoiceList';
import { SetupGuard } from '../setup/SetupGuard';
import { countryMeta, useTestCounts } from '../setup/useTestCounts';
import { changeCountryBullets, defaultNewCountry } from './changeCountryModel';

/**
 * Change exam country (ChangeCountry.dc, ChangeCountryPhone.dc), opened from the account menu's "Exam country" row and from
 * the "Switch my account to Kenya" link (`?to=KE` pre-selects it). "Switch to X" saves the country (the API clears the job
 * goal) and continues at setup step 2 for the new country; "Keep Rwanda" goes back.
 */
export function ChangeCountryPage() {
  useDocumentTitle('Change exam country');
  return <SetupGuard>{(session) => <ChangeCountry session={session} />}</SetupGuard>;
}

function ChangeCountry({ session }: { session: MeResponse }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const to = useSearchParams()[0].get('to');
  const countries = useCountries();
  const { user, country: own, access } = session;
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = countries.data ?? [];
  const counts = useTestCounts(list);
  const ownCode = own.code.toUpperCase();
  const currentCode = picked ?? defaultNewCountry(list, ownCode, to);
  const target: CountrySummary | undefined = list.find((c) => c.code === currentCode);
  const changing = !!target && target.code !== ownCode;

  const detail = useQuery({ queryKey: countriesKeys.detail(target?.code ?? ''), queryFn: () => getCountry(target!.code), enabled: changing, staleTime: 5 * 60_000 });
  const methods = detail.data?.paymentMethods.map((m) => m.label) ?? [];

  const rows: Choice[] = list.map((c) => {
    const live = c.status === 'LIVE' && c.selectable;
    if (c.code === ownCode) {
      return {
        id: c.code,
        code: c.code,
        name: c.name,
        meta: access.current ? `Current · Full Access until ${formatDate(access.current.endsAt, true)}` : 'Current',
        metaGood: true,
      };
    }
    return { id: c.code, code: c.code, name: c.name, meta: live ? countryMeta({ count: counts[c.code] }) : 'Coming soon', disabled: !live };
  });

  const bullets = target && changing ? changeCountryBullets({ from: own.name, to: target.name, currency: target.currencyCode, methods, accessDaysLeft: access.current?.daysLeft ?? null }) : [];

  const switchTo = async () => {
    if (!target || !changing) return;
    setError(null);
    setBusy(true);
    try {
      await patchOnboarding({ countryCode: target.code });
      setStoredCountry(target.slug);
      // Everything cached is country-scoped: drop it and reload the session.
      qc.removeQueries({ queryKey: ['catalog'] });
      await qc.invalidateQueries({ queryKey: meKeys.session });
      navigate(setupPath('category'));
    } catch (e) {
      setError(authErrorMessage(e instanceof ApiError ? e : new ApiError(0, 'network_error')));
    } finally {
      setBusy(false);
    }
  };

  const back = dashboardPath(user);

  return (
    <AuthFrame homeTo={countryPath(user.countryCode)}>
      <AuthHeading title="Change exam country" back={<BackLink to={back} />}>
        Everything you see will switch to the new country: mock tests, prices, payment methods and language.
      </AuthHeading>
      {countries.isError ? (
        <ErrorState title="We could not load the countries" onRetry={() => void countries.refetch()} />
      ) : countries.isLoading ? (
        <Loader label="Loading countries…" />
      ) : (
        <ChoiceList label="Exam country" items={rows} value={currentCode} onChange={setPicked} />
      )}
      {changing && target && (
        <div className="flex flex-col gap-2 rounded-control border border-brand-soft bg-brand-softer px-4 py-3.5 text-[15px] leading-normal">
          <strong className="text-brand-hover">If you switch to {target.name}</strong>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px]">
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <AlertBox title={error} />}
      {changing && target ? (
        <Button variant="primary" size="lg" block loading={busy} onClick={() => void switchTo()}>
          Switch to {target.name}
        </Button>
      ) : (
        <Button variant="primary" size="lg" block disabled>
          Choose a different country
        </Button>
      )}
      <div className="flex justify-center">
        <Link to={back} className={authTextLink}>
          Keep {own.name}
        </Link>
      </div>
    </AuthFrame>
  );
}
