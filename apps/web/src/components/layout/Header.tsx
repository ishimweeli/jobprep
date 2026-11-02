import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowLeft, Menu } from 'lucide-react';
import { countryPath, useActiveCountrySlug } from '../../features/country/hooks';
import { useSession } from '../../features/auth/session';
import { Logo } from '../Logo';
import { cx } from '../../lib/cx';
import { initials } from '../../lib/format';
import { ROUTES_READY } from '../../lib/routesReady';
import { CountryChip } from './CountryChip';

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'border-b-2 py-3 text-[15px] no-underline hover:text-ink',
    isActive ? 'border-brand font-bold text-ink' : 'border-transparent font-medium text-ink-2',
  );

/** "My progress" is in every header; the dashboard is a later phase, so until then it is drawn but inert. */
function ProgressNav({ slug }: { slug: string }) {
  if (ROUTES_READY.progress) {
    return (
      <NavLink to={countryPath(slug, 'progress')} className={navLink}>
        My progress
      </NavLink>
    );
  }
  return (
    <button type="button" aria-disabled="true" className="cursor-default border-b-2 border-transparent bg-transparent py-3 text-[15px] font-medium text-ink-2">
      My progress
    </button>
  );
}

/**
 * Desktop header (md and up). Per the artboards the landing header also carries the country chip,
 * "Teaching exams" and the "Try a free test" button; the other screens show logo, nav and Sign in only.
 */
export function DesktopHeader({ landing, teachingTo, cta }: { landing?: boolean; teachingTo?: string; cta?: ReactNode }) {
  const slug = useActiveCountrySlug();
  const { user, isLoading } = useSession();
  return (
    <header className="hidden border-b border-border bg-surface md:block">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3.5">
        <Logo to={countryPath(slug)} />
        <nav aria-label="Main" className="flex flex-1 flex-wrap gap-x-[22px] gap-y-1">
          <NavLink to={countryPath(slug, 'tests')} end className={navLink}>
            Mock tests
          </NavLink>
          {landing && teachingTo && (
            <Link to={teachingTo} className="border-b-2 border-transparent py-3 text-[15px] font-medium text-ink-2 no-underline hover:text-ink">
              Teaching exams
            </Link>
          )}
          <NavLink to={countryPath(slug, 'pricing')} className={navLink}>
            Pricing
          </NavLink>
          <ProgressNav slug={slug} />
        </nav>
        <div className="flex items-center gap-2.5">
          {landing && <CountryChip />}
          {isLoading ? (
            <span aria-hidden="true" className="inline-block h-11 w-20" />
          ) : user ? (
            <span
              role="img"
              aria-label={`Account: ${user.name}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft font-extrabold text-brand-hover"
            >
              {initials(user.name)}
            </span>
          ) : (
            <Link to="/sign-up" className="inline-flex min-h-[44px] items-center px-3.5 text-[15px] font-semibold text-ink no-underline hover:text-ink">
              Sign in
            </Link>
          )}
          {cta}
        </div>
      </div>
    </header>
  );
}

/** Phone landing header: logo, country chip, Sign in, menu button. */
export function PhoneBrandHeader({ menu = true, nameOnly }: { menu?: boolean; nameOnly?: boolean }) {
  const slug = useActiveCountrySlug();
  const { user, isLoading } = useSession();
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface py-2 pl-4 pr-2 md:hidden">
      <Logo to={countryPath(slug)} size="md" />
      <div className="flex items-center gap-0.5">
        <CountryChip compact nameOnly={nameOnly} />
        {isLoading ? null : user ? (
          <span
            role="img"
            aria-label={`Account: ${user.name}`}
            className="mx-1 inline-flex h-[38px] w-[38px] items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand-hover"
          >
            {initials(user.name)}
          </span>
        ) : (
          <Link to="/sign-up" className="inline-flex min-h-[44px] items-center px-3 text-[15px] font-semibold text-ink no-underline hover:text-ink">
            Sign in
          </Link>
        )}
        {/* The menu's contents are not designed yet: the button is drawn as in the artboard and is inert. */}
        {menu && (
          <button type="button" aria-label="Open menu" aria-disabled="true" className="inline-flex h-11 w-11 cursor-default items-center justify-center bg-transparent text-ink">
            <Menu size={22} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}

/** Phone sub-page header: back arrow + title. */
export function PhoneBackHeader({ to, title, label = 'Back' }: { to: string; title: ReactNode; label?: string }) {
  return (
    <header className="flex items-center gap-1 border-b border-border bg-surface p-2 md:hidden">
      <Link to={to} aria-label={label} className="inline-flex h-11 w-11 items-center justify-center text-ink no-underline hover:text-ink">
        <ArrowLeft size={22} aria-hidden="true" />
      </Link>
      <span className="text-[17px] font-bold">{title}</span>
    </header>
  );
}
