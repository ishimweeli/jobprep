import { Navigate, type RouteObject } from 'react-router-dom';
import { CountryLayout } from './components/layout/SiteLayout';
import { RootRedirect } from './features/country/RootRedirect';
import { AccountLayout } from './features/account/AccountLayout';

/**
 * The single route table. Only screens that have an artboard in docs/design/source are routed.
 * The exam and the answer review are distraction-free screens (own header, no site chrome), so they sit outside
 * the country layout. Pages are code-split with `lazy`; the landing chunk stays small for 3G phones.
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
  // Exam.dc / ExamMobile.dc / CaseExam*.dc / TimeUp.dc
  { path: '/:country/exam/:attemptId', lazy: async () => ({ Component: (await import('./features/exam/ExamPage')).ExamPage }) },
  // Review.dc / ReviewPhone.dc
  { path: '/:country/review/:attemptId', lazy: async () => ({ Component: (await import('./features/review/ReviewPage')).ReviewPage }) },
  {
    path: '/:country',
    element: <CountryLayout />,
    children: [
      { index: true, handle: { landing: true }, lazy: async () => ({ Component: (await import('./features/landing/LandingPage')).LandingPage }) },
      { path: 'tests', lazy: async () => ({ Component: (await import('./features/catalog/CatalogPage')).CatalogPage }) },
      { path: 'tests/:slug', lazy: async () => ({ Component: (await import('./features/exam-detail/ExamDetailPage')).ExamDetailPage }) },
      { path: 'tests/:slug/start', lazy: async () => ({ Component: (await import('./features/exam/StartPage')).StartPage }) },
      { path: 'results/:attemptId', lazy: async () => ({ Component: (await import('./features/results/ResultsPage')).ResultsPage }) },
      { path: 'progress', lazy: async () => ({ Component: (await import('./features/dashboard/DashboardPage')).DashboardPage }) },
      { path: 'checkout', lazy: async () => ({ Component: (await import('./features/checkout/CheckoutPage')).CheckoutPage }) },
      { path: 'pricing', lazy: async () => ({ Component: (await import('./features/pricing/PricingPage')).PricingPage }) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
