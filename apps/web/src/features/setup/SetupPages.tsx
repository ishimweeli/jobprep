import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { countriesKeys, listCategories } from '../../api/countries';
import { meKeys, patchOnboarding, type OnboardingInput } from '../../api/me';
import type { MeResponse } from '../../api/types';
import { Button } from '../../components/Button';
import { ErrorState, SkeletonList } from '../../components/states';
import { cx } from '../../lib/cx';
import { getStoredCountry, resolveInitialCountry, setStoredCountry } from '../../lib/country';
import { authErrorMessage } from '../../lib/errorCopy';
import { plural } from '../../lib/format';
import { paidTestFromNext, safeNext, setupPath } from '../../lib/next';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useCountries } from '../country/hooks';
import { AlertBox, AuthCard, AuthFrame, AuthHeading, authTextLink, BackLink, PaidNote, StepDots } from '../auth/AuthShell';
import {
  afterSetupPath, categoryCode, dashboardPath, FINISH_LABEL, FINISH_PAID_LABEL, formatExamDate, LEVELS, parseExamDate, setupPaidText, SUBJECTS,
} from '../auth/authModel';
import { usePaidTestTitle } from '../auth/hooks';
import { ChoiceList, type Choice } from './ChoiceList';
import { SetupGuard } from './SetupGuard';
import { countryMeta, useTestCounts } from './useTestCounts';

/** Saves one setup step, refreshes the session (the API says what is next) and returns. Errors become a message. */
function useStepSaver() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (input: OnboardingInput, then: () => void): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await patchOnboarding(input);
      // The country, the catalogue and the dashboard all depend on what was just saved.
      qc.removeQueries({ queryKey: ['catalog'] });
      await qc.invalidateQueries({ queryKey: meKeys.session });
      then();
    } catch (e) {
      setError(authErrorMessage(e instanceof ApiError ? e : new ApiError(0, 'network_error')));
    } finally {
      setBusy(false);
    }
  };
  return { save, error, busy };
}

const home = () => countryPath(getStoredCountry() ?? 'rw');

// ───────────────────────── 1 of 3: country (OnboardCountry.dc, OnboardCountryPhone.dc)

export function SetupCountryPage() {
  useDocumentTitle('Where are you sitting your exam?');
  return <SetupGuard>{(session) => <CountryStep session={session} />}</SetupGuard>;
}

function CountryStep({ session }: { session: MeResponse }) {
  const navigate = useNavigate();
  const next = safeNext(useSearchParams()[0].get('next'));
  const countries = useCountries();
  const { save, error, busy } = useStepSaver();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const list = countries.data ?? [];
  const counts = useTestCounts(list);
  // The country the person was browsing (or the one the account was created with) is the suggestion.
  const suggested = resolveInitialCountry(list, getStoredCountry() ?? session.user.countryCode.toLowerCase());
  // A person who already confirmed a country (came back with "Back") keeps it; a new one gets the suggestion.
  const confirmed = session.user.onboarding.nextStep !== 'country' ? session.user.countryCode.toLowerCase() : null;
  const current = picked ?? confirmed ?? suggested;

  const q = query.trim().toLowerCase();
  const rows: Choice[] = list
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q)
    .map((c) => {
      const live = c.status === 'LIVE' && c.selectable;
      return {
        id: c.slug,
        code: c.code,
        name: c.name,
        meta: live ? countryMeta({ suggested: c.slug === suggested, count: counts[c.code] }) : 'Coming soon',
        metaGood: live && c.slug === suggested,
        disabled: !live,
      };
    });
  const chosen = list.find((c) => c.slug === current);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    void save({ countryCode: chosen.code }, () => {
      setStoredCountry(chosen.slug);
      navigate(setupPath('category', next));
    });
  };

  return (
    <AuthFrame homeTo={home()}>
      <StepDots step={1} />
      <AuthHeading title="Where are you sitting your exam?">
        We’ll show your country’s mock tests, prices and payment methods. Everything you see will be for this country.
      </AuthHeading>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5 md:gap-[22px]">
        <div className="relative w-full">
          <label htmlFor="oc-search" className="sr-only">
            Search countries
          </label>
          <Search size={16} aria-hidden="true" className="absolute left-3 top-4 text-muted" />
          <input
            id="oc-search"
            type="search"
            placeholder="Search countries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="box-border h-12 w-full rounded-[10px] border border-input-border bg-surface pl-9 pr-3 text-[15px] text-ink placeholder:text-muted"
          />
        </div>
        {countries.isError ? (
          <ErrorState title="We could not load the countries" onRetry={() => void countries.refetch()} />
        ) : countries.isLoading ? (
          <SkeletonList count={3} label="Loading countries…" />
        ) : (
          <ChoiceList label="Country" items={rows} value={chosen && rows.some((r) => r.id === chosen.slug) ? chosen.slug : null} onChange={setPicked} />
        )}
        {error && <AlertBox title={error} />}
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!chosen}>
          Continue
        </Button>
      </form>
      <p className="m-0 text-center text-sm text-muted">
        Not listed?{' '}
        {/* No follow-up screen is designed for this link (MISSING_DESIGNS E4): drawn, inert. */}
        <span role="link" aria-disabled="true" className="text-brand">
          Tell us your country
        </span>
        .
      </p>
    </AuthFrame>
  );
}

// ───────────────────────── 2 of 3: job category (OnboardCategory.dc, OnboardCategoryPhone.dc)

export function SetupCategoryPage() {
  useDocumentTitle('What job are you preparing for?');
  return <SetupGuard step="category">{(session) => <CategoryStep session={session} />}</SetupGuard>;
}

function CategoryStep({ session }: { session: MeResponse }) {
  const navigate = useNavigate();
  const next = safeNext(useSearchParams()[0].get('next'));
  const { user, country } = session;
  const cats = useQuery({ queryKey: countriesKeys.categories(user.countryCode), queryFn: () => listCategories(user.countryCode) });
  const { save, error, busy } = useStepSaver();
  const [picked, setPicked] = useState<string | null>(null);
  const list = cats.data ?? [];
  const current = picked ?? (list.some((c) => c.id === user.goalCategoryId) ? user.goalCategoryId : (list[0]?.id ?? null));
  const rows: Choice[] = list.map((c) => ({
    id: c.id,
    code: categoryCode(c.name),
    name: c.name,
    meta: [c.description, plural(c.mockTestCount, 'mock test')].filter(Boolean).join(' · '),
  }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (current) void save({ goalCategoryId: current }, () => navigate(setupPath('goal', next)));
  };

  return (
    <AuthFrame homeTo={home()}>
      <StepDots step={2} />
      <AuthHeading title="What job are you preparing for?" back={<BackLink to={setupPath('country', next)} />}>
        Job categories in {country.name}. We’ll show these mock tests first — you can change this anytime.
      </AuthHeading>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5 md:gap-[22px]">
        {cats.isError ? (
          <ErrorState title="We could not load the job categories" onRetry={() => void cats.refetch()} />
        ) : cats.isLoading ? (
          <SkeletonList count={3} label="Loading job categories…" />
        ) : (
          <ChoiceList label="Job category" items={rows} value={current} onChange={setPicked} />
        )}
        {error && <AlertBox title={error} />}
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!current}>
          Continue
        </Button>
      </form>
    </AuthFrame>
  );
}

// ───────────────────────── 3 of 3: level, subject, exam date (OnboardGoal.dc, OnboardGoalPhone.dc)

export function SetupGoalPage() {
  useDocumentTitle('Which position?');
  return <SetupGuard step="goal">{(session) => <GoalStep session={session} />}</SetupGuard>;
}

function Chips({ legend, options, value, onPick }: { legend: string; options: readonly string[]; value: string | null; onPick: (v: string | null) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
      <legend className="mb-2.5 p-0 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : o)}
              className={cx(
                'min-h-[44px] cursor-pointer rounded-pill border px-4 text-sm font-semibold',
                on ? 'border-brand bg-brand-softer text-brand-hover' : 'border-border bg-surface text-ink',
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function GoalStep({ session }: { session: MeResponse }) {
  const navigate = useNavigate();
  const next = safeNext(useSearchParams()[0].get('next'));
  const { user } = session;
  const paidTitle = usePaidTestTitle(next);
  const fromPaid = !!paidTestFromNext(next);
  const { save, error, busy } = useStepSaver();
  const [level, setLevel] = useState<string | null>(user.level);
  const [subject, setSubject] = useState<string | null>(user.subject);
  const [date, setDate] = useState(formatExamDate(user.examDate));
  const [dateError, setDateError] = useState<string | null>(null);

  const finish = (e: FormEvent) => {
    e.preventDefault();
    const examDate = parseExamDate(date);
    if (examDate === 'invalid') {
      setDateError('Enter the date like 14 Dec 2026.');
      return;
    }
    setDateError(null);
    void save(
      { ...(level ? { level } : {}), ...(subject ? { subject } : {}), examDate, finish: true },
      () => navigate(afterSetupPath(user, next), { replace: true }),
    );
  };
  const skip = () => void save({ skip: true }, () => navigate(dashboardPath(user), { replace: true }));

  return (
    <AuthFrame homeTo={home()}>
      <StepDots step={3} />
      <AuthHeading title="Which position?" back={<BackLink to={setupPath('category', next)} />}>
        We’ll recommend your first mock test.
      </AuthHeading>
      <form onSubmit={finish} noValidate className="flex flex-col gap-5 md:gap-[22px]">
        <AuthCard>
          <Chips legend="Level" options={LEVELS} value={level} onPick={setLevel} />
          <Chips legend="Subject" options={SUBJECTS} value={subject} onPick={setSubject} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="od" className="text-sm font-semibold">
              Exam date (optional)
            </label>
            <input
              id="od"
              type="text"
              placeholder="e.g. 14 Dec 2026"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? 'od-error' : undefined}
              className={cx('box-border h-12 w-full min-w-0 rounded-control border bg-surface px-3.5 text-base text-ink placeholder:text-muted', dateError ? 'border-incorrect' : 'border-input-border')}
            />
            {dateError && (
              <p id="od-error" role="alert" className="m-0 text-sm font-semibold text-incorrect">
                {dateError}
              </p>
            )}
          </div>
        </AuthCard>
        {fromPaid && paidTitle && <PaidNote>{setupPaidText(paidTitle)}</PaidNote>}
        {error && <AlertBox title={error} />}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {fromPaid ? FINISH_PAID_LABEL : FINISH_LABEL}
        </Button>
      </form>
      <div className="flex justify-center">
        <button type="button" onClick={skip} disabled={busy} className={cx(authTextLink, 'cursor-pointer border-0 bg-transparent disabled:cursor-not-allowed disabled:text-muted')}>
          Skip for now
        </button>
      </div>
    </AuthFrame>
  );
}
