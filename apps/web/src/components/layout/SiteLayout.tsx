import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useMatches, useParams } from 'react-router-dom';
import { useSession } from '../../features/auth/session';
import { setStoredCountry } from '../../lib/country';
import { countryPath, useCountries, useActiveCountrySlug } from '../../features/country/hooks';
import { useLanding } from '../../features/landing/queries';
import { FreeTestCta } from '../../features/landing/FreeTestCta';
import { CountryNotOpen, WrongCountry } from '../../features/country/CountryGate';
import { NotFoundPage } from '../../features/system/SystemPage';
import { SkeletonList } from '../states';
import { Footer } from './Footer';
import { DesktopHeader } from './Header';
import { PhoneTabBar } from './PhoneTabBar';

/** Route `handle` flags. */
export interface RouteHandle {
  /** Landing-only shell parts drawn in Main.dc: country chip, "Teaching exams", "Try a free test", footer. */
  landing?: boolean;
  /** Signed-in phone users get the bottom tabs (NavPhone.dc) on this page. */
  tabs?: boolean;
}

function LandingHeader() {
  const slug = useActiveCountrySlug();
  const cat = useLanding(slug).data?.featuredCategory;
  return (
    <DesktopHeader
      landing
      teachingTo={cat ? `${countryPath(slug, 'tests')}?category=${encodeURIComponent(cat.slug)}` : undefined}
      cta={<FreeTestCta />}
    />
  );
}

/** Shell shared by pages: skip link, desktop header, page, and (landing only, as designed) the footer. */
export function SiteShell({ children, landing }: { children: React.ReactNode; landing?: boolean }) {
  const matches = useMatches();
  const { user } = useSession();
  const tabs = !!user && matches.some((m) => (m.handle as RouteHandle | undefined)?.tabs);
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-ink focus:px-4 focus:py-3 focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      {landing ? <LandingHeader /> : <DesktopHeader />}
      <div className="flex flex-1 flex-col">{children}</div>
      {landing && <Footer />}
      {tabs && <PhoneTabBar />}
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
          <SkeletonList count={2} label="Loading…" />
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

  return (
    <SiteShell landing={landing}>
      <Outlet />
    </SiteShell>
  );
}
