import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useMatches, useParams } from 'react-router-dom';
import { useSession } from '../../features/auth/session';
import { setStoredCountry } from '../../lib/country';
import { countryPath, useCountries, useActiveCountrySlug } from '../../features/country/hooks';
import { useLanding } from '../../features/landing/queries';
import { FreeTestCta } from '../../features/landing/FreeTestCta';
import { Footer } from './Footer';
import { DesktopHeader } from './Header';

/** Route `handle` flags. */
export interface RouteHandle {
  /** Landing-only shell parts drawn in Main.dc: country chip, "Teaching exams", "Try a free test", footer. */
  landing?: boolean;
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
    </div>
  );
}

/**
 * Layout route for `/:country/*`. Validates the slug against the API's country list, remembers the choice,
 * and sends a signed-in user to their own country when the URL points elsewhere (API: 403 country_mismatch).
 * Unknown or not-yet-live countries go to the country picker; there is no designed 404 page.
 */
export function CountryLayout() {
  const { country } = useParams();
  const slug = (country ?? '').toLowerCase();
  const location = useLocation();
  const matches = useMatches();
  const landing = matches.some((m) => (m.handle as RouteHandle | undefined)?.landing);
  const countries = useCountries();
  const { user } = useSession();
  const known = countries.data?.find((c) => c.slug === slug);

  useEffect(() => {
    if (known?.status === 'LIVE') setStoredCountry(slug);
  }, [known, slug]);

  if (!/^[a-z]{2}$/.test(slug)) return <Navigate to="/" replace />;

  // Signed-in users are locked to their country: swap the first URL segment, keep the rest.
  if (user && user.countryCode.toLowerCase() !== slug) {
    const rest = location.pathname.split('/').slice(2).join('/');
    return <Navigate to={`${countryPath(user.countryCode.toLowerCase(), ...(rest ? [rest] : []))}${location.search}`} replace />;
  }
  if (countries.data && !known) return <Navigate to="/" replace />;
  if (known && known.status !== 'LIVE') return <Navigate to="/choose-country" replace />;

  return (
    <SiteShell landing={landing}>
      <Outlet />
    </SiteShell>
  );
}
