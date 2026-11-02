import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { requestOtp, signUp } from '../../api/auth';
import { ApiError } from '../../api/client';
import { countriesKeys, listCategories } from '../../api/countries';
import { meKeys, patchMe } from '../../api/me';
import type { CountrySummary } from '../../api/types';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { ErrorState, SkeletonList } from '../../components/states';
import { getStoredCountry, setStoredCountry } from '../../lib/country';
import { authErrorMessage } from '../../lib/errorCopy';
import { cx } from '../../lib/cx';
import { readGuestTokens } from '../../lib/guestTokens';
import { formatPhone, isValidNational, toE164 } from '../../lib/phone';
import { plural } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { CountryPickerBody } from '../country/CountryPicker';
import { countryPath, useCountries, useCountryDetail } from '../country/hooks';
import { useSession } from './session';
import { AuthShell, StepBar } from './AuthShell';
import { OtpStep } from './OtpStep';
import { PhoneField } from './PhoneField';

type Step = 1 | 2 | 3 | 4;

/** Sign-up wizard: country -> name + phone -> 6-digit code -> job goal (SignUp.dc / SignUpPhone.dc). */
export function SignUpPage() {
  useDocumentTitle('Create your account');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isLoading: sessionLoading } = useSession();
  const countries = useCountries();
  const [step, setStep] = useState<Step>(1);
  const [country, setCountry] = useState<CountrySummary | null>(null);
  const [name, setName] = useState('');
  const [national, setNational] = useState('');
  const [cooldown, setCooldown] = useState(45);
  const [registered, setRegistered] = useState(false);
  const home = countryPath(getStoredCountry() ?? 'rw');

  // Already signed in (and not in the middle of this wizard): nothing to do here.
  if (user && !registered) return <Navigate to={countryPath(user.countryCode.toLowerCase())} replace />;
  if (sessionLoading) return null;

  const phoneE164 = country ? toE164(national, country.dialCode) : '';

  return (
    <AuthShell homeTo={home}>
      <StepBar step={step} total={4} onBack={step === 2 ? () => setStep(1) : step === 3 ? () => setStep(2) : undefined} />

      {step === 1 && (
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-2xl font-bold tracking-tight md:text-[26px]">Which country is your exam in?</h1>
            <p className="m-0 text-[15px] text-ink-2">Everything you see — mock tests, prices, payments and language — will be for this country.</p>
          </div>
          {countries.isError ? (
            <ErrorState title="We could not load the countries" onRetry={() => void countries.refetch()} />
          ) : (
            <CountryPickerBody
              currentSlug={getStoredCountry() ?? 'rw'}
              continueLabel={(n) => `Continue with ${n}`}
              onContinue={(c) => {
                setCountry(c);
                setStoredCountry(c.slug);
                setStep(2);
              }}
            />
          )}
        </div>
      )}

      {step === 2 && country && (
        <DetailsStep
          country={country}
          name={name}
          setName={setName}
          national={national}
          setNational={setNational}
          onSent={(seconds) => {
            setCooldown(seconds);
            setStep(3);
          }}
        />
      )}

      {step === 3 && country && (
        <OtpStep
          phoneLabel={formatPhone(phoneE164, country.dialCode)}
          initialCooldown={cooldown}
          onResend={() => requestOtp({ purpose: 'sign_up', phone: phoneE164, countryCode: country.code })}
          onSubmit={async (code) => {
            await signUp({ countryCode: country.code, phone: phoneE164, name: name.trim(), code, guestTokens: readGuestTokens() });
            // Keep the session cache untouched until the wizard ends, so this page is not redirected away mid-way.
            setRegistered(true);
            setStep(4);
          }}
        />
      )}

      {step === 4 && country && (
        <GoalStep
          country={country}
          onFinish={async (categorySlug) => {
            await qc.invalidateQueries({ queryKey: meKeys.session });
            navigate(`${countryPath(country.slug, 'tests')}${categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : ''}`);
          }}
        />
      )}
    </AuthShell>
  );
}

function DetailsStep({
  country,
  name,
  setName,
  national,
  setNational,
  onSent,
}: {
  country: CountrySummary;
  name: string;
  setName: (v: string) => void;
  national: string;
  setNational: (v: string) => void;
  onSent: (cooldownSeconds: number) => void;
}) {
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<ApiError | null>(null);

  const send = useMutation({
    mutationFn: () => requestOtp({ purpose: 'sign_up', phone: toE164(national, country.dialCode), countryCode: country.code }),
    onSuccess: (r) => onSent(r.cooldownSeconds),
    onError: (e) => setFormError(e instanceof ApiError ? e : new ApiError(0, 'network_error')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const nOk = name.trim().length >= 2;
    const pOk = isValidNational(national);
    setNameError(nOk ? null : 'Enter your full name (at least 2 letters).');
    setPhoneError(pOk ? null : authErrorMessage(new ApiError(400, 'invalid_phone')));
    if (nOk && pOk) send.mutate();
  };

  const methods = useCountryDetail(country.slug).data?.paymentMethods.map((m) => m.label) ?? [];
  const pay = methods.length > 0 ? methods.join(' or ') : 'Mobile Money';
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-2xl font-bold tracking-tight md:text-[26px]">Your phone number</h1>
        <p className="m-0 text-[15px] text-ink-2">We’ll text you a 6-digit code. Use the number you pay with by {pay}.</p>
      </div>
      <Field
        label="Full name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        maxLength={80}
      />
      <PhoneField country={country} national={national} onChange={setNational} error={phoneError} />
      {formError && (
        <div role="alert" className="flex flex-col gap-2 rounded-control border border-red-300 bg-red-50 p-3.5 text-sm font-semibold text-red-900">
          <span>{authErrorMessage(formError)}</span>
        </div>
      )}
      <Button type="submit" variant="primary" size="lg" loading={send.isPending}>
        Send code
      </Button>
      <p className="m-0 text-[13px] text-muted">
        Already have an account?{' '}
        {/* The sign-in screen is not designed; the link is drawn as in the artboard and is inert. */}
        <span aria-disabled="true" className="link cursor-default">
          Sign in
        </span>
      </p>
    </form>
  );
}

function GoalStep({ country, onFinish }: { country: CountrySummary; onFinish: (categorySlug: string | null) => Promise<void> }) {
  const cats = useQuery({ queryKey: countriesKeys.categories(country.code), queryFn: () => listCategories(country.code) });
  const [goal, setGoal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = useMutation({
    mutationFn: async () => {
      if (goal) await patchMe({ goalCategoryId: goal });
    },
    onSuccess: () => onFinish(cats.data?.find((c) => c.id === goal)?.slug ?? null),
    onError: (e) => setError(authErrorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-2xl font-bold tracking-tight md:text-[26px]">What are you preparing for?</h1>
        <p className="m-0 text-[15px] text-ink-2">Job categories in {country.name}. You can change this anytime.</p>
      </div>
      {cats.isLoading && <SkeletonList count={3} label="Loading job categories…" />}
      {cats.isError && <ErrorState title="We could not load the job categories" onRetry={() => void cats.refetch()} />}
      {cats.data && (
        <fieldset className="m-0 grid grid-cols-2 gap-2 border-0 p-0">
          <legend className="sr-only">Job category</legend>
          {cats.data.map((c) => {
            const on = goal === c.id;
            return (
              <label key={c.id} className="block">
                <input type="radio" name="goal" value={c.id} checked={on} onChange={() => setGoal(c.id)} className="peer sr-only" />
                <span
                  className={cx(
                    'flex min-h-[72px] cursor-pointer flex-col gap-0.5 rounded-xl border p-3 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-ring',
                    on ? 'border-2 border-brand bg-brand-softer p-[11px]' : 'border-zinc-300 bg-surface',
                  )}
                >
                  <span className="text-[15px] font-bold">{c.name}</span>
                  <span className="text-xs text-muted">{plural(c.mockTestCount, 'test')}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-incorrect">
          {error}
        </p>
      )}
      <Button variant="primary" size="lg" loading={finish.isPending} onClick={() => finish.mutate()}>
        Finish and see my {country.name} tests
      </Button>
    </div>
  );
}
