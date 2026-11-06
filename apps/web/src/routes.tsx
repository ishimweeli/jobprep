import { lazy, Suspense } from 'react';
import { Outlet, type RouteObject } from 'react-router-dom';
import { SignedOutNotice } from './components/layout/SignedOutNotice';
import { CountryLayout } from './components/layout/SiteLayout';
import { SkeletonList } from './components/states';
import { AccountLayout } from './features/account/AccountLayout';
import { RootRedirect } from './features/country/RootRedirect';
import { MaintenanceWatcher } from './features/system/MaintenanceWatcher';
import { NotFoundPage, RouteErrorPage, SystemGate, SystemPageBody } from './features/system/SystemPage';
import { countryPath, useActiveCountrySlug } from './features/country/hooks';
import { PhoneBrandHeader } from './components/layout/Header';
import { useSystemState } from './lib/systemState';
import type { LegalSlug } from './api/types';

/** Root: the system pages (maintenance, session expired) replace everything; the signed-out notice floats above. */
function RootLayout() {
  const system = useSystemState();
  return (
    <>
      <MaintenanceWatcher />
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

/** A legal page route: `/terms`, `/privacy`, `/refund`, `/cookies`. */
function legalRoute(path: string, slug: LegalSlug): RouteObject {
  return {
    path,
    lazy: async () => {
      const { LegalPage } = await import('./features/legal/LegalPage');
      return { Component: () => <LegalPage slug={slug} /> };
    },
  };
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
      // SignUp.dc, VerifyEmail.dc, SignIn.dc, ForgotPassword.dc, ResetPassword.dc, AuthCallback.dc (each with its Phone twin)
      { path: '/sign-up', lazy: async () => ({ Component: (await import('./features/auth/SignUpPage')).SignUpPage }) },
      { path: '/verify-email', lazy: async () => ({ Component: (await import('./features/auth/VerifyEmailPage')).VerifyEmailPage }) },
      { path: '/sign-in', lazy: async () => ({ Component: (await import('./features/auth/SignInPage')).SignInPage }) },
      { path: '/forgot-password', lazy: async () => ({ Component: (await import('./features/auth/ForgotPasswordPage')).ForgotPasswordPage }) },
      { path: '/reset-password', lazy: async () => ({ Component: (await import('./features/auth/ResetPasswordPage')).ResetPasswordPage }) },
      { path: '/auth/callback', lazy: async () => ({ Component: (await import('./features/auth/AuthCallbackPage')).AuthCallbackPage }) },
      // OnboardCountry.dc / OnboardCategory.dc / OnboardGoal.dc (setup 1/3, 2/3, 3/3)
      { path: '/setup/country', lazy: async () => ({ Component: (await import('./features/setup/SetupPages')).SetupCountryPage }) },
      { path: '/setup/category', lazy: async () => ({ Component: (await import('./features/setup/SetupPages')).SetupCategoryPage }) },
      { path: '/setup/goal', lazy: async () => ({ Component: (await import('./features/setup/SetupPages')).SetupGoalPage }) },
      // ChangeCountry.dc / ChangeCountryPhone.dc (the account menu's "Exam country" row)
      { path: '/account/country', lazy: async () => ({ Component: (await import('./features/account/ChangeCountryPage')).ChangeCountryPage }) },
      // Change goal / Choose your goal (C15, built without a design; same frame as Change exam country)
      { path: '/account/goal', lazy: async () => ({ Component: (await import('./features/account/ChangeGoalPage')).ChangeGoalPage }) },
      // Terms, Privacy, Refund, Cookies and Help (C25 / C36, built without a design; text and contact come from the API)
      legalRoute('/terms', 'terms'),
      legalRoute('/privacy', 'privacy'),
      legalRoute('/refund', 'refund'),
      legalRoute('/cookies', 'cookies'),
      { path: '/help', lazy: async () => ({ Component: (await import('./features/legal/HelpPage')).HelpPage }) },
      // The admin screens (apps/web/src/admin): signed-in people who hold a role. No candidate chrome here.
      { path: '/admin/*', element: <Suspense fallback={<RootFallback />}><AdminApp /></Suspense> },
      {
        element: <AccountLayout />,
        children: [
          // NavPhone.dc "Account" tab (also the desktop /account)
          { path: '/account', handle: { tabs: true, title: 'Account' }, lazy: async () => ({ Component: (await import('./features/account/AccountTabPage')).AccountTabPage }) },
          // ChangeCountryPhone.dc: name, email, exam country
          { path: '/account/settings', lazy: async () => ({ Component: (await import('./features/account/AccountPage')).AccountPage }) },
          // Payment history and receipt (C21, built without a design)
          { path: '/account/payments', lazy: async () => ({ Component: (await import('./features/account/PaymentHistoryPage')).PaymentHistoryPage }) },
          { path: '/account/payments/:paymentId', lazy: async () => ({ Component: (await import('./features/account/PaymentReceiptPage')).PaymentReceiptPage }) },
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
          { path: 'tests', handle: { tabs: true, title: 'Mock tests' }, lazy: async () => ({ Component: (await import('./features/catalog/CatalogPage')).CatalogPage }) },
          { path: 'tests/:slug', handle: { tabs: true, title: 'Mock test', backTo: 'tests' }, lazy: async () => ({ Component: (await import('./features/exam-detail/ExamDetailPage')).ExamDetailPage }) },
          { path: 'tests/:slug/start', lazy: async () => ({ Component: (await import('./features/exam/StartPage')).StartPage }) },
          { path: 'tests/jobs/:jobSlug', handle: { tabs: true, title: 'Job' }, lazy: async () => ({ Component: (await import('./features/job-detail/JobDetailPage')).JobDetailPage }) },
          { path: 'results/:attemptId', lazy: async () => ({ Component: (await import('./features/results/ResultsPage')).ResultsPage }) },
          { path: 'progress', handle: { tabs: true, title: 'Dashboard' }, lazy: async () => ({ Component: (await import('./features/dashboard/DashboardPage')).DashboardPage }) },
          { path: 'checkout', lazy: async () => ({ Component: (await import('./features/checkout/CheckoutPage')).CheckoutPage }) },
          { path: 'pricing', handle: { tabs: true, title: 'Pricing' }, lazy: async () => ({ Component: (await import('./features/pricing/PricingPage')).PricingPage }) },
          { path: '*', element: <CountryNotFound /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
