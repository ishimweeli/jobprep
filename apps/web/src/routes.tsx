import { lazy, Suspense } from 'react';
import { Outlet, type RouteObject } from 'react-router-dom';
import { SignedOutNotice } from './components/layout/SignedOutNotice';
import { CountryLayout } from './components/layout/SiteLayout';
import { SkeletonList } from './components/states';
import { AccountLayout } from './features/account/AccountLayout';
import { RootRedirect } from './features/country/RootRedirect';
import { NotFoundPage, RouteErrorPage, SystemGate, SystemPageBody } from './features/system/SystemPage';
import { countryPath, useActiveCountrySlug } from './features/country/hooks';
import { PhoneBrandHeader } from './components/layout/Header';
import { useSystemState } from './lib/systemState';

/** Root: the system pages (maintenance, session expired) replace everything; the signed-out notice floats above. */
function RootLayout() {
  const system = useSystemState();
  return (
    <>
      <SystemGate />
      {!system && <Outlet />}
      <SignedOutNotice />
    </>
  );
}

/** Shown while a lazily loaded first screen is fetched on a hard load (replaces React Router's missing-fallback warning). */
function RootFallback() {
  return (
    <div className="mx-auto max-w-[640px] p-6">
      <SkeletonList count={2} label="Loading…" />
    </div>
  );
}

/** The admin area: its own code-split subtree (candidates never download it); it brings its own chrome, sign-in guard and routes. */
const AdminApp = lazy(() => import('./admin/AdminApp'));

/** 404 inside a country (`/rw/nothing`): the page body only, the country layout supplies the header. */
function CountryNotFound() {
  const slug = useActiveCountrySlug();
  return (
    <>
      <PhoneBrandHeader minimal />
      <SystemPageBody kind="not_found" cta={{ to: countryPath(slug, 'tests') }} alt={{ to: countryPath(slug) }} />
    </>
  );
}

/**
 * The single route table. Only screens that have an artboard in docs/design/source are routed.
 * The exam and the answer review are distraction-free screens (own header, no site chrome), so they sit outside
 * the country layout. Pages are code-split with `lazy`; the landing chunk stays small for 3G phones.
 * `/admin/*` is the lazily loaded admin area (static segments outrank `/:country`).
 * Unknown paths show the 404 page (SystemPages.dc) instead of redirecting.
 */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: RootFallback,
    children: [
      { path: '/', element: <RootRedirect /> },
      { path: '/choose-country', lazy: async () => ({ Component: (await import('./features/country/ChooseCountryPage')).ChooseCountryPage }) },
      // SignUp.dc / SignUpPhone.dc and SignIn.dc / SignInPhone.dc
      { path: '/sign-up', lazy: async () => ({ Component: (await import('./features/auth/SignUpPage')).SignUpPage }) },
      { path: '/sign-in', lazy: async () => ({ Component: (await import('./features/auth/SignInPage')).SignInPage }) },
      // The admin screens (apps/web/src/admin): signed-in people who hold a role. No candidate chrome here.
      { path: '/admin/*', element: <Suspense fallback={<RootFallback />}><AdminApp /></Suspense> },
      {
        element: <AccountLayout />,
        children: [
          // NavPhone.dc "Account" tab (also the desktop /account)
          { path: '/account', handle: { tabs: true }, lazy: async () => ({ Component: (await import('./features/account/AccountTabPage')).AccountTabPage }) },
          // ChangeCountryPhone.dc: name, email, exam country
          { path: '/account/settings', lazy: async () => ({ Component: (await import('./features/account/AccountPage')).AccountPage }) },
        ],
      },
      // Exam.dc / ExamMobile.dc / CaseExam*.dc / TimeUp*.dc / Practice*.dc
      { path: '/:country/exam/:attemptId', lazy: async () => ({ Component: (await import('./features/exam/ExamPage')).ExamPage }) },
      // Review.dc / ReviewPhone.dc
      { path: '/:country/review/:attemptId', lazy: async () => ({ Component: (await import('./features/review/ReviewPage')).ReviewPage }) },
      {
        path: '/:country',
        element: <CountryLayout />,
        children: [
          { index: true, handle: { landing: true, tabs: true }, lazy: async () => ({ Component: (await import('./features/landing/LandingPage')).LandingPage }) },
          { path: 'tests', handle: { tabs: true }, lazy: async () => ({ Component: (await import('./features/catalog/CatalogPage')).CatalogPage }) },
          { path: 'tests/:slug', handle: { tabs: true }, lazy: async () => ({ Component: (await import('./features/exam-detail/ExamDetailPage')).ExamDetailPage }) },
          { path: 'tests/:slug/start', lazy: async () => ({ Component: (await import('./features/exam/StartPage')).StartPage }) },
          { path: 'results/:attemptId', lazy: async () => ({ Component: (await import('./features/results/ResultsPage')).ResultsPage }) },
          { path: 'progress', handle: { tabs: true }, lazy: async () => ({ Component: (await import('./features/dashboard/DashboardPage')).DashboardPage }) },
          { path: 'checkout', lazy: async () => ({ Component: (await import('./features/checkout/CheckoutPage')).CheckoutPage }) },
          { path: 'pricing', handle: { tabs: true }, lazy: async () => ({ Component: (await import('./features/pricing/PricingPage')).PricingPage }) },
          { path: '*', element: <CountryNotFound /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
