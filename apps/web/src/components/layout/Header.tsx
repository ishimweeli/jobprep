import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LICENSING_CATEGORY } from './navItems';
import { ArrowLeft, Menu } from 'lucide-react';
import { AccountMenu } from '../../features/account/AccountMenu';
import { GuestMenuSheet } from './GuestMenuSheet';
import { countryPath, useActiveCountrySlug } from '../../features/country/hooks';
import { useSession } from '../../features/auth/session';
import { Logo } from '../Logo';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';
import { initials } from '../../lib/format';
import { CountryChip } from './CountryChip';

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'border-b-2 py-3 text-[15px] no-underline hover:text-ink',
    isActive ? 'border-brand font-semibold text-ink' : 'border-transparent font-medium text-ink-2',
  );

/**
 * Desktop header (md and up): logo, nav, country chip and, for guests, "Sign in" + "Get started" (the owner asked
 * for one wording everywhere; it replaces "Create account" and the landing's "Try a free test"); for signed-in
 * users the avatar that opens the account menu (AccountMenu.dc). The landing's "Teaching exams" link is gone too.
 */
export function DesktopHeader() {
  const t = useT();
  const slug = useActiveCountrySlug();
  const { user, session, isLoading } = useSession();
  const { pathname, search } = useLocation();
  const licensing = pathname === countryPath(slug, 'tests') && new URLSearchParams(search).get('category') === LICENSING_CATEGORY;
  return (
    <header className="hidden border-b border-border bg-surface md:block">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3.5">
        <Logo to={countryPath(slug)} />
        <nav aria-label="Main" className="flex flex-1 flex-wrap gap-x-[22px] gap-y-1">
          <Link to={countryPath(slug, 'tests')} className={navLink({ isActive: pathname === countryPath(slug, 'tests') && !licensing })} aria-current={pathname === countryPath(slug, 'tests') && !licensing ? 'page' : undefined}>
            {t('nav.mockTests')}
          </Link>
          <Link to={`${countryPath(slug, 'tests')}?category=${LICENSING_CATEGORY}`} className={navLink({ isActive: licensing })} aria-current={licensing ? 'page' : undefined}>
            Licensing exams
          </Link>
          <NavLink to={countryPath(slug, 'pricing')} className={navLink}>
            {t('nav.pricing')}
          </NavLink>
          {user && (
            <NavLink to={countryPath(slug, 'progress')} className={navLink}>
              {t('nav.progress')}
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
                {t('nav.signIn')}
              </Link>
              <Link
                to="/sign-up"
                className="inline-flex min-h-[44px] items-center rounded-pill bg-brand px-[18px] text-[15px] font-semibold text-white no-underline hover:bg-brand-hover hover:text-white"
              >
                {t('nav.getStarted')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Phone brand header. Landing: logo, country chip, Sign in and the menu button (which opens the guest menu sheet,
 * NavPhone.dc). `minimal` is the dashboard's logo-only header (DashboardNewPhone.dc).
 */
export function PhoneBrandHeader({ menu = true, minimal }: { menu?: boolean; minimal?: boolean }) {
  const slug = useActiveCountrySlug();
  const { user, isLoading } = useSession();
  const [sheet, setSheet] = useState(false);
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface py-2 pl-4 pr-2 md:hidden">
      <Logo to={countryPath(slug)} size="md" />
      {!minimal && (
        <div className="flex items-center gap-0.5">
          <CountryChip />
          {isLoading ? null : user ? (
            <Link to="/account" aria-label={`${initials(user.name)} account: ${user.name}`} className="mx-1 inline-flex h-[38px] w-[38px] items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand no-underline hover:text-brand">
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
      <span className="text-[17px] font-semibold">{title}</span>
    </header>
  );
}
