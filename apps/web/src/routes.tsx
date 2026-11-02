import { Navigate, type RouteObject } from 'react-router-dom';
import { CountryLayout } from './components/layout/SiteLayout';
import { RootRedirect } from './features/country/RootRedirect';
import { AccountLayout } from './features/account/AccountLayout';

/**
 * The single route table. Only screens that have an artboard in docs/design/source are routed.
 * Later phases add theirs here and flip the matching flag in lib/routesReady.ts:
 *   /:country/tests/:slug/start   exam engine   (Exam.dc, ExamMobile.dc)
 *   /:country/checkout            payments      (Checkout.dc phone)
 *   /:country/progress            dashboard     (Dashboard.dc)
 * Pages are code-split with `lazy`; the landing chunk stays small for 3G phones.
 */
export const routes: RouteObject[] = [
  { path: '/', element: <RootRedirect /> },
  { path: '/choose-country', lazy: async () => ({ Component: (await import('./features/country/ChooseCountryPage')).ChooseCountryPage }) },
  // SignUp.dc / SignUpPhone.dc. "Sign in" in the header leads here: no separate sign-in screen is drawn.
  { path: '/sign-up', lazy: async () => ({ Component: (await import('./features/auth/SignUpPage')).SignUpPage }) },
  {
    element: <AccountLayout />,
    children: [{ path: '/account', lazy: async () => ({ Component: (await import('./features/account/AccountPage')).AccountPage }) }],
  },
  {
    path: '/:country',
    element: <CountryLayout />,
    children: [
      { index: true, handle: { landing: true }, lazy: async () => ({ Component: (await import('./features/landing/LandingPage')).LandingPage }) },
      { path: 'tests', lazy: async () => ({ Component: (await import('./features/catalog/CatalogPage')).CatalogPage }) },
      { path: 'tests/:slug', lazy: async () => ({ Component: (await import('./features/exam-detail/ExamDetailPage')).ExamDetailPage }) },
      { path: 'pricing', lazy: async () => ({ Component: (await import('./features/pricing/PricingPage')).PricingPage }) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
