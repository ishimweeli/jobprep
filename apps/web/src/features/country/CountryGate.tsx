import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { joinWaitingList } from '../../api/countries';
import { ApiError } from '../../api/client';
import type { CountrySummary, MeResponse } from '../../api/types';
import { Button, buttonClasses } from '../../components/Button';
import { Field } from '../../components/Field';
import { PhoneBrandHeader } from '../../components/layout/Header';
import { authErrorMessage } from '../../lib/errorCopy';
import { INVALID_EMAIL_MESSAGE, isValidEmail, normalizeEmail } from '../../lib/email';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

/** Country badge pill: "[UG] Uganda". */
function CountryPill({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 self-start rounded-pill border border-border-strong px-3 py-1.5 text-sm font-semibold">
      <span className="rounded border border-border bg-page px-[5px] py-px text-[11px] text-muted">{code}</span>
      {children}
    </span>
  );
}

/** Card on the page: bordered on desktop, flat on phone (CountryGate.dc, CountryGatePhone.dc). */
function GateFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PhoneBrandHeader minimal />
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-start justify-center bg-surface px-4 py-6 outline-none md:bg-page md:py-14">
        <div className="flex w-full max-w-[520px] flex-col gap-4 md:rounded-[20px] md:border md:border-border md:bg-surface md:p-[30px]">{children}</div>
      </main>
    </>
  );
}

/** "JobPrep isn’t open in Uganda yet": waiting-list form, then "You’re on the list". */
export function CountryNotOpen({ country }: { country: CountrySummary }) {
  useDocumentTitle(`JobPrep isn’t open in ${country.name} yet`);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [interest, setInterest] = useState('');
  const [joined, setJoined] = useState<{ email: string; already: boolean } | null>(null);
  const join = useMutation({
    mutationFn: (address: string) => joinWaitingList(country.code, { email: address, ...(interest.trim() ? { interest: interest.trim() } : {}) }),
    onSuccess: (r, address) => setJoined({ email: address, already: r.alreadyOnList }),
    onError: (e) => setError(authErrorMessage(e instanceof ApiError ? e : new ApiError(0, 'network_error'))),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError(INVALID_EMAIL_MESSAGE);
      return;
    }
    join.mutate(normalizeEmail(email));
  };

  if (joined) {
    return (
      <GateFrame>
        <span className="inline-flex h-16 w-16 items-center justify-center self-start rounded-full bg-free-bg text-free">
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1 role="status" className="m-0 text-2xl tracking-tight md:text-[28px]">
          {joined.already ? 'You’re already on the list' : 'You’re on the list'}
        </h1>
        <p className="m-0 text-base leading-[1.55] text-ink-2">
          We’ll send one email to <strong className="break-all text-ink">{joined.email}</strong> when {country.name} opens. You can ask us to remove your address at any time.
        </p>
        <Link to="/choose-country" className={buttonClasses({ variant: 'neutral', size: 'sm', className: '!min-h-[48px] !px-[18px] !font-semibold md:!min-h-[44px]' })}>
          Choose a different country
        </Link>
      </GateFrame>
    );
  }

  return (
    <GateFrame>
      <CountryPill code={country.code}>{country.name}</CountryPill>
      <h1 className="m-0 text-2xl leading-[1.2] tracking-tight md:text-[28px]">JobPrep isn’t open in {country.name} yet</h1>
      <p className="m-0 text-base leading-[1.55] text-ink-2">
        We’re preparing mock tests for recruitment exams in {country.name}. Leave your email address and we’ll send one email when they’re ready — nothing else.
      </p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field
          id="wl-email"
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
        />
        <Field
          id="wl-interest"
          label="What are you preparing for? (optional)"
          autoComplete="off"
          maxLength={120}
          placeholder="e.g. Teacher recruitment exam"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          hint="Helps us choose which tests to prepare first."
        />
        <Button type="submit" variant="primary" size="lg" className="px-5" loading={join.isPending}>
          Notify me
        </Button>
      </form>
      <Link to="/choose-country" className="link p-2.5 text-center text-[15px] font-semibold">
        Choose a different country
      </Link>
    </GateFrame>
  );
}

/**
 * "This test is for Kenya": the link opened belongs to another country than the account's.
 * The API's 403 `country_mismatch` now names the test (`test.title`); the layout decides this page without calling the API
 * (a call would log a console 403 on every visit), so `testTitle` is shown only when a caller has it. See docs/missing-built-candidate.md.
 */
export function WrongCountry({ linkCountry, session, testTitle }: { linkCountry: { code: string; name: string }; session: MeResponse; testTitle?: string | null }) {
  useDocumentTitle(`This test is for ${linkCountry.name}`);
  const own = session.country;
  const hasAccess = !!session.access.current;
  return (
    <GateFrame>
      <CountryPill code={linkCountry.code}>{linkCountry.name} mock test</CountryPill>
      <h1 className="m-0 text-2xl leading-[1.2] tracking-tight md:text-[28px]">This test is for {linkCountry.name}</h1>
      <p className="m-0 text-base leading-[1.55] text-ink-2">
        {testTitle ? <strong className="text-ink">{testTitle}</strong> : 'The link you opened'} is for {linkCountry.name}. Your account is set to <strong className="text-ink">{own.name}</strong>
        {hasAccess ? <>, so your {own.name} Full Access does not cover it.</> : '.'}
      </p>
      <Link to={`/${own.code.toLowerCase()}/tests`} className={buttonClasses({ variant: 'primary', size: 'lg' })}>
        See similar tests in {own.name}
      </Link>
      <Link
        to={`/account/country?to=${linkCountry.code}`}
        className={buttonClasses({ variant: 'neutral', size: 'sm', className: '!min-h-[48px] !px-[18px] !font-semibold md:!min-h-[44px]' })}
      >
        Switch my account to {linkCountry.name}
      </Link>
      <p className="m-0 text-[13px] text-muted">
        Switching keeps your {own.name} results.{hasAccess ? ` Your ${own.name} Full Access stays with ${own.name}.` : ''}
      </p>
    </GateFrame>
  );
}

/** The test named by a 403 `country_mismatch` body (`test: { slug, title } | null`), if any. */
export function mismatchTestTitle(details: Record<string, unknown> | undefined): string | null {
  const t = details?.test as { title?: unknown } | null | undefined;
  return t && typeof t.title === 'string' && t.title ? t.title : null;
}
