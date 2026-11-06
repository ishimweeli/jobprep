import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { attemptKeys } from '../../api/attempts';
import { ApiError } from '../../api/client';
import { countriesKeys, listCategories } from '../../api/countries';
import { meKeys, patchMe } from '../../api/me';
import type { MeResponse } from '../../api/types';
import { Button } from '../../components/Button';
import { ErrorState, Loader } from '../../components/states';
import { authErrorMessage } from '../../lib/errorCopy';
import { plural } from '../../lib/format';
import { safeNext } from '../../lib/next';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AlertBox, AuthFrame, AuthHeading, authTextLink, BackLink } from '../auth/AuthShell';
import { categoryCode, dashboardPath } from '../auth/authModel';
import { countryPath } from '../country/hooks';
import { ChoiceList, type Choice } from '../setup/ChoiceList';
import { SetupGuard } from '../setup/SetupGuard';
import { goalScreenCopy } from './changeGoalModel';

/**
 * Change goal (C15; not drawn, built from the setup "job category" step OnboardCategory.dc): the country's job categories
 * as the same radio rows, the current goal marked, "Save goal". With no goal (the person switched country, or skipped setup)
 * the same screen is the "Choose your goal" prompt. Saves with `PATCH /me { goalCategoryId }`.
 */
export function ChangeGoalPage() {
  useDocumentTitle('Change goal');
  return <SetupGuard>{(session) => <ChangeGoal session={session} />}</SetupGuard>;
}

function ChangeGoal({ session }: { session: MeResponse }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const next = safeNext(useSearchParams()[0].get('next'));
  const { user, country } = session;
  const cats = useQuery({ queryKey: countriesKeys.categories(user.countryCode), queryFn: () => listCategories(user.countryCode) });
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = cats.data ?? [];
  const copy = goalScreenCopy({ hasGoal: !!user.goalCategoryId, countryName: country.name });
  const current = picked ?? (list.some((c) => c.id === user.goalCategoryId) ? user.goalCategoryId : null);
  const rows: Choice[] = list.map((c) => ({
    id: c.id,
    code: categoryCode(c.name),
    name: c.name,
    meta: c.id === user.goalCategoryId ? `Current goal · ${plural(c.mockTestCount, 'mock test')}` : [c.description, plural(c.mockTestCount, 'mock test')].filter(Boolean).join(' · '),
    metaGood: c.id === user.goalCategoryId,
  }));
  const back = next ?? '/account/settings';
  const unchanged = !current || current === user.goalCategoryId;

  const save = async () => {
    if (!current || unchanged) return;
    setError(null);
    setBusy(true);
    try {
      await patchMe({ goalCategoryId: current });
      // The dashboard's recommendations and the catalog's "for your goal" order depend on the goal.
      qc.removeQueries({ queryKey: ['catalog'] });
      qc.removeQueries({ queryKey: attemptKeys.dashboard });
      await qc.invalidateQueries({ queryKey: meKeys.session });
      navigate(next ?? dashboardPath(user), { replace: true });
    } catch (e) {
      setError(authErrorMessage(e instanceof ApiError ? e : new ApiError(0, 'network_error')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame homeTo={countryPath(user.countryCode)}>
      <AuthHeading title={copy.title} back={<BackLink to={back} />}>
        {copy.lead}
      </AuthHeading>
      {cats.isError ? (
        <ErrorState title="We could not load the job categories" onRetry={() => void cats.refetch()} />
      ) : cats.isLoading ? (
        <Loader label="Loading job categories…" />
      ) : (
        <ChoiceList label="Job category" items={rows} value={current} onChange={setPicked} />
      )}
      {error && <AlertBox title={error} />}
      <Button variant="primary" size="lg" block loading={busy} disabled={unchanged} onClick={() => void save()}>
        {copy.button}
      </Button>
      <div className="flex justify-center">
        <Link to={back} className={authTextLink}>
          {copy.keep}
        </Link>
      </div>
    </AuthFrame>
  );
}
