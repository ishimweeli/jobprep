import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowLeft, Menu } from 'lucide-react';
import { AccountMenu } from '../../features/account/AccountMenu';
import { GuestMenuSheet } from './GuestMenuSheet';
import { countryPath, useActiveCountrySlug } from '../../features/country/hooks';
import { useSession } from '../../features/auth/session';
import { Logo } from '../Logo';
import { cx } from '../../lib/cx';
import { initials } from '../../lib/format';
import { CountryChip } from './CountryChip';

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'border-b-2 py-3 text-[15px] no-underline hover:text-ink',
    isActive ? 'border-brand font-bold text-ink' : 'border-transparent font-medium text-ink-2',
  );

/**
 * Desktop header (md and up): logo, nav, country chip and, for guests, "Sign in" + "Create account"
 * (SignIn.dc, GuestPaid.dc, SystemPages.dc); for signed-in users the avatar that opens the account menu
 * (AccountMenu.dc). The landing header keeps its own extras ("Teaching exams", "Try a free test").
 */
export function DesktopHeader({ landing, teachingTo, cta }: { landing?: boolean; teachingTo?: string; cta?: ReactNode }) {
  const slug = useActiveCountrySlug();
  const { user, session, isLoading } = useSession();
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
          {user && (
            <NavLink to={countryPath(slug, 'progress')} className={navLink}>
              My progress
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-2.5">
          <CountryChip />
          {isLoading ? (
            <span aria-hidden="true" className="inline-block h-11 w-20" />
          ) : user && session ? (
            <AccountMenu session={session} slug={slug} />
          ) : (
            <>
              <Link to="/sign-in" className="inline-flex min-h-[44px] items-center px-3.5 text-[15px] font-semibold text-ink no-underline hover:text-ink">
                Sign in
              </Link>
              {!landing && (
                <Link
                  to="/sign-up"
                  className="inline-flex min-h-[44px] items-center rounded-pill bg-brand px-[18px] text-[15px] font-semibold text-white no-underline hover:bg-brand-hover hover:text-white"
                >
                  Create account
                </Link>
              )}
            </>
          )}
          {cta}
        </div>
      </div>
    </header>
  );
}

/**
 * Phone brand header. Landing: logo, country chip, Sign in and the menu button (which opens the guest menu sheet,
 * NavPhone.dc). `minimal` is the dashboard's logo-only header (DashboardNewPhone.dc).
 */
export function PhoneBrandHeader({ menu = true, nameOnly, minimal }: { menu?: boolean; nameOnly?: boolean; minimal?: boolean }) {
  const slug = useActiveCountrySlug();
  const { user, isLoading } = useSession();
  const [sheet, setSheet] = useState(false);
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface py-2 pl-4 pr-2 md:hidden">
      <Logo to={countryPath(slug)} size="md" />
      {!minimal && (
        <div className="flex items-center gap-0.5">
          <CountryChip compact nameOnly={nameOnly} />
          {isLoading ? null : user ? (
            <Link to="/account" aria-label={`${initials(user.name)} account: ${user.name}`} className="mx-1 inline-flex h-[38px] w-[38px] items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand-hover no-underline hover:text-brand-hover">
              {initials(user.name)}
            </Link>
          ) : (
            <Link to="/sign-in" className="inline-flex min-h-[44px] items-center px-3 text-[15px] font-semibold text-ink no-underline hover:text-ink">
              Sign in
            </Link>
          )}
          {menu && !user && !isLoading && (
            <>
              <button
                type="button"
                aria-label="Open menu"
                aria-haspopup="dialog"
                aria-expanded={sheet}
                onClick={() => setSheet(true)}
                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent text-ink"
              >
                <Menu size={22} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <GuestMenuSheet open={sheet} onClose={() => setSheet(false)} />
            </>
          )}
        </div>
      )}
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
