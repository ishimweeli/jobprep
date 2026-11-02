import { Link } from 'react-router-dom';
import { countryPath, useActiveCountry } from '../../features/country/hooks';
import { cx } from '../../lib/cx';
import { Dialog } from '../Dialog';
import { buttonClasses } from '../Button';

const row = 'flex min-h-[52px] items-center justify-between border-b border-soft px-1 text-base font-semibold text-ink no-underline hover:text-ink';

const LANGUAGE_BUTTON_NAME: Record<string, string> = { en: 'English', rw: 'Ikinyarwanda', sw: 'Kiswahili' };

/**
 * The guest menu sheet behind the phone hamburger (NavPhone.dc, "Guest: menu open"): Mock tests, Pricing, Country,
 * Language, Sign in, Create a free account. The language switch is drawn but inert: there is no language picker
 * design yet (C22) and the UI catalogues are not translated.
 */
export function GuestMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { slug, country } = useActiveCountry();
  const languages = country?.languages ?? ['en'];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Menu"
      variant="sheet"
      titleClassName="m-0 text-lg font-bold"
      panelClassName="flex flex-col gap-1.5 !pb-[22px] !pt-3.5"
      headerAction={
        <button type="button" onClick={onClose} className="min-h-[44px] cursor-pointer border-0 bg-transparent px-2 text-[15px] font-semibold text-brand">
          Close
        </button>
      }
    >
      <Link to={countryPath(slug, 'tests')} onClick={onClose} className={row}>
        Mock tests
      </Link>
      <Link to={countryPath(slug, 'pricing')} onClick={onClose} className={row}>
        Pricing
      </Link>
      <Link to="/choose-country" onClick={onClose} className={row}>
        <span>Country</span>
        <span className="font-medium text-muted">
          {country ? `${country.name} · ${country.currencyCode}` : slug.toUpperCase()} ›
        </span>
      </Link>
      <div className="flex min-h-[52px] items-center justify-between border-b border-soft px-1">
        <span className="text-base font-semibold">Language</span>
        <span role="group" aria-label="Language" className="inline-flex rounded-[10px] bg-soft p-[3px]">
          {languages.map((code, i) => (
            <button
              key={code}
              type="button"
              aria-pressed={i === 0}
              aria-disabled="true"
              className={cx(
                'min-h-[36px] cursor-default rounded-lg border-0 px-2.5 text-sm',
                i === 0 ? 'bg-surface font-bold text-ink' : 'bg-transparent font-semibold text-ink-2',
              )}
            >
              {LANGUAGE_BUTTON_NAME[code] ?? code.toUpperCase()}
            </button>
          ))}
        </span>
      </div>
      <Link to="/sign-in" onClick={onClose} className={buttonClasses({ variant: 'neutral', size: 'sm', block: true, className: 'mt-2.5 min-h-[48px] !font-semibold' })}>
        Sign in
      </Link>
      <Link to="/sign-up" onClick={onClose} className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>
        Create a free account
      </Link>
    </Dialog>
  );
}
