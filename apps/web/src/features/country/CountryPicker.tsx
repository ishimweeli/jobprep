import { useQueries } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { countriesKeys, getCountry } from '../../api/countries';
import type { CountrySummary } from '../../api/types';
import { Button } from '../../components/Button';
import { Loader, ErrorState } from '../../components/states';
import { LANGUAGE_KEY } from '../../lib/country';
import { languageName } from '../../lib/format';
import { plural } from '../../lib/format';
import { writeStorage } from '../../lib/storage';
import { useTestCounts } from '../setup/useTestCounts';
import { useCountries } from './hooks';

interface BodyProps {
  currentSlug: string;
  onContinue: (country: CountrySummary) => void;
  /** Primary button text for a live country (default "Continue to X"). */
  continueLabel?: (name: string) => string;
  /** The desktop picker draws a Language select; the phone page and sign-up do not. */
  showLanguage?: boolean;
  /**
   * Desktop artboard (CountryPicker.dc): rows read "90 mock tests · MTN MoMo, Airtel Money" and, for a country that is not live,
   * "Join the waiting list" with a "Coming soon" tag. The phone page (CountryPickerPhone.dc) shows only the payment methods / "Coming soon".
   * No currency is shown beside a country: choosing a country and money are separate.
   */
  desktop?: boolean;
  footnote?: ReactNode;
}

/**
 * Country radio list + (optional) language + primary action (CountryPicker.dc / CountryPickerPhone.dc / sign-up step 1).
 * A country that is not live shows "Notify me when X opens", which opens that country's page (CountryGate.dc) with the waiting-list form.
 */
export function CountryPickerBody({ currentSlug, onContinue, continueLabel, showLanguage, desktop, footnote }: BodyProps) {
  const countries = useCountries();
  const list = countries.data ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const selected = list.find((c) => c.slug === (picked ?? currentSlug)) ?? list.find((c) => c.status === 'LIVE') ?? list[0];
  const [language, setLanguage] = useState('');

  const details = useQueries({
    queries: list.map((c) => ({
      queryKey: countriesKeys.detail(c.code),
      queryFn: () => getCountry(c.code),
      staleTime: 5 * 60_000,
    })),
  });
  const methodsFor = (i: number) => details[i]?.data?.paymentMethods.map((m) => m.label).join(', ');
  const testCounts = useTestCounts(desktop ? list : []);

  if (countries.isLoading) return <Loader label="Loading…" />;
  if (countries.isError || !selected) return <ErrorState title="We could not load the countries" onRetry={() => void countries.refetch()} />;

  const live = selected.status === 'LIVE';
  const activeLanguage = selected.languages.includes(language) ? language : selected.languages[0] ?? 'en';

  const proceed = () => {
    writeStorage(LANGUAGE_KEY, activeLanguage);
    onContinue(selected);
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="sr-only">Country</legend>
        {list.map((c, i) => {
          const soon = c.status !== 'LIVE';
          const count = testCounts[c.code];
          const meta = soon
            ? desktop
              ? 'Join the waiting list'
              : 'Coming soon'
            : [desktop && count !== undefined && plural(count, 'mock test'), methodsFor(i)].filter(Boolean).join(' · ');
          return (
            <label key={c.code} className="block cursor-pointer">
              <input
                type="radio"
                name="country"
                value={c.slug}
                checked={selected.slug === c.slug}
                onChange={() => setPicked(c.slug)}
                className="peer sr-only"
              />
              <span className="flex min-h-[68px] items-center gap-3.5 rounded-[14px] border border-border-strong bg-surface px-3.5 py-3 text-left peer-checked:border-2 peer-checked:border-brand peer-checked:bg-brand-softer peer-checked:px-[13px] peer-checked:py-[11px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-ring md:px-4">
                <span className="inline-flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] border border-border bg-page text-[13px] font-semibold text-muted md:h-[42px] md:w-[42px] md:text-sm">
                  {c.code}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold md:text-[17px]">{c.name}</span>
                    {soon && desktop && <span className="rounded-pill bg-soft px-[7px] py-0.5 text-[11px] font-semibold text-ink-2">Coming soon</span>}
                  </span>
                  <span className="text-[13px] text-muted md:text-sm">{meta}</span>
                </span>
                <span aria-hidden="true" className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-2 border-muted">
                  <span className={`h-2.5 w-2.5 rounded-full ${selected.slug === c.slug ? 'bg-brand' : 'bg-transparent'}`} />
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {showLanguage && selected.languages.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Language
          <select
            value={activeLanguage}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-12 rounded-control border border-input-border bg-surface px-3 text-base font-normal text-ink md:h-11"
          >
            {selected.languages.map((l) => (
              <option key={l} value={l}>
                {languageName(l)}
              </option>
            ))}
          </select>
        </label>
      )}

      {live ? (
        <Button variant="primary" size="lg" block className="text-[17px] md:text-base" onClick={proceed}>
          {continueLabel?.(selected.name) ?? `Continue to ${selected.name}`}
        </Button>
      ) : (
        <Link
          to={`/${selected.slug}`}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[14px] border border-brand bg-surface text-[17px] font-semibold text-brand no-underline hover:text-brand md:min-h-[44px] md:rounded-control md:text-base"
        >
          Notify me when {selected.name} opens
        </Link>
      )}

      {footnote && <p className="m-0 text-[13px] text-muted">{footnote}</p>}
    </div>
  );
}
