import { Link } from 'react-router-dom';
import { countryPath, useActiveCountry } from '../../features/country/hooks';
import { Dialog } from '../Dialog';
import { buttonClasses } from '../Button';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { LICENSING_CATEGORY } from './navItems';

const row = 'flex min-h-[48px] items-center justify-between border-b border-soft px-1 text-base font-semibold text-ink no-underline hover:text-ink';

/**
 * The guest menu sheet behind the phone hamburger (NavPhone.dc, "Guest: menu open"): Mock tests, Pricing, Country,
 * Language, Sign in, Create a free account. The language switch is live (C22): it lists only the country's languages.
 */
export function GuestMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { slug, country } = useActiveCountry();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Menu"
      variant="sheet"
      titleClassName="m-0 text-[17px] font-bold"
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
      <Link to={`${countryPath(slug, 'tests')}?category=${LICENSING_CATEGORY}`} onClick={onClose} className={row}>
        Licensing exams
      </Link>
      <Link to={countryPath(slug, 'pricing')} onClick={onClose} className={row}>
        Pricing
      </Link>
      <Link to="/choose-country" onClick={onClose} className={row}>
        <span>Country</span>
        <span className="font-medium text-muted">
          {country ? country.name : slug.toUpperCase()} ›
        </span>
      </Link>
      <div className="flex min-h-[48px] items-center justify-between gap-3 border-b border-soft px-1">
        <span className="text-base font-semibold">Language</span>
        <LanguageSwitcher variant="segmented" />
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
