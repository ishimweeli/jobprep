import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useMatches, useParams } from 'react-router-dom';
import { useSession } from '../../features/auth/session';
import { setStoredCountry } from '../../lib/country';
import { cx } from '../../lib/cx';
import { countryPath, useCountries } from '../../features/country/hooks';
import { CountryNotOpen, WrongCountry } from '../../features/country/CountryGate';
import { NotFoundPage } from '../../features/system/SystemPage';
import { Loader } from '../states';
import { Footer } from './Footer';
import { DesktopHeader } from './Header';
import { PhoneTopBar } from './PhoneTopBar';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** Route `handle` flags. */
export interface RouteHandle {
  /** Landing-only shell part drawn in Main.dc: the footer. */
  landing?: boolean;
  /** Signed-in users get the candidate app chrome (sidebar + top bar on desktop, hamburger header on phone) on this page. */
  tabs?: boolean;
  /** Static page title shown in the top bar (desktop) and the phone header. */
  title?: string;
  /** Exam-detail-only: the desktop top bar shows a back arrow to this (country-relative) path + `title` instead of a plain title. */
  backTo?: string;
  /** Accessible name of that back arrow (default "Back to mock tests"). */
  backLabel?: string;
  /** The page sets its own small desktop sizes, so the site-wide `ui-scaled` step must not shrink it a second time. */
  dense?: boolean;
}

/**
 * Shell shared by pages: skip link, chrome, page, and (landing only, as designed) the footer.
 * Signed-in users on a `tabs` route get the November redesign's candidate chrome: a 232px sidebar + top bar on
 * desktop, a hamburger header + slide-out drawer on phone (replacing the desktop header / bottom tab bar).
 * Guests, and any signed-in page outside that set (checkout, account/settings, …), keep the original header.
 */
export function SiteShell({ children, landing }: { children: React.ReactNode; landing?: boolean }) {
  const matches = useMatches();
  const { user } = useSession();
  const chrome = !!user && matches.some((m) => (m.handle as RouteHandle | undefined)?.tabs);
  const pageClass = cx('flex flex-1 flex-col', !matches.some((m) => (m.handle as RouteHandle | undefined)?.dense) && 'ui-scaled');

  const skipLink = (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-ink focus:px-4 focus:py-3 focus:font-semibold focus:text-white"
    >
      Skip to content
    </a>
  );

  if (chrome) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row dark:bg-night-page dark:text-night-ink">
        {skipLink}
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col dark:bg-night-page">
          <PhoneTopBar />
          <div className="hidden md:block">
            <TopBar />
          </div>
          <div className={pageClass}>{children}</div>
          {landing && <Footer />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {skipLink}
      <DesktopHeader />
      <div className={pageClass}>{children}</div>
      {landing && <Footer />}
    </div>
  );
}

/**
 * Layout route for `/:country/*`. Validates the slug against the API's country list and remembers the choice.
 * - a country that is not live shows "JobPrep isn’t open in X yet" with the waiting list (CountryGate.dc);
 * - a signed-in user who opens a test link of another live country sees "This test is for X" (API: 403
 *   `country_mismatch`); any other page of another country goes to their own country;
 * - an unknown country is a 404 page.
 */
export function CountryLayout() {
  const { country } = useParams();
  const slug = (country ?? '').toLowerCase();
  const location = useLocation();
  const matches = useMatches();
  const landing = matches.some((m) => (m.handle as RouteHandle | undefined)?.landing);
  const countries = useCountries();
  const { user, session, isLoading: sessionLoading } = useSession();
  const known = countries.data?.find((c) => c.slug === slug);

  useEffect(() => {
    if (known?.status === 'LIVE') setStoredCountry(slug);
  }, [known, slug]);

  if (!/^[a-z]{2}$/.test(slug)) return <NotFoundPage />;

  // Wait for the country list and the session before asking the API for a country's data (a country that is not live
  // answers 404, and a signed-in user opening another country's link answers 403).
  if (countries.isLoading || sessionLoading) {
    return (
      <SiteShell>
        <div className="mx-auto w-full max-w-[640px] p-6">
          <Loader label="Loading…" />
        </div>
      </SiteShell>
    );
  }
  // Signed-in users are locked to their country.
  if (user && session && user.countryCode.toLowerCase() !== slug) {
    const isTestLink = /^\/[a-z]{2}\/tests\/[^/]+/.test(location.pathname);
    if (isTestLink && known?.status === 'LIVE') {
      return (
        <SiteShell>
          <WrongCountry linkCountry={{ code: known.code, name: known.name }} session={session} />
        </SiteShell>
      );
    }
    const rest = location.pathname.split('/').slice(2).join('/');
    return <Navigate to={`${countryPath(user.countryCode.toLowerCase(), ...(rest ? [rest] : []))}${location.search}`} replace />;
  }
  if (countries.data && !known) return <NotFoundPage />;
  if (known && known.status !== 'LIVE') {
    return (
      <SiteShell>
        <CountryNotOpen country={known} />
      </SiteShell>
    );
  }
  // Signed in: the marketing landing page is only useful before an account exists, so go straight to the mock tests.
  if (landing && user) return <Navigate to={countryPath(slug, 'tests')} replace />;

  return (
    <SiteShell landing={landing}>
      <Outlet />
    </SiteShell>
  );
}
