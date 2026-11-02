import { Navigate, type RouteObject } from 'react-router-dom';
import { RequireAdmin, RequirePermission, useAdmin } from './features/auth/session';
import { firstAllowedPath } from './lib/permissions';

/** An unknown path goes to the first page the role may use (there is no 404 design for the admin yet). */
function Fallback() {
  const admin = useAdmin();
  return <Navigate to={firstAllowedPath(admin.permissions) ?? '/sign-in'} replace />;
}

const page = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) => ({
  lazy: async () => ({ Component: (await load())[name] }),
});

const HydrateFallback = () => null;

export const routes: RouteObject[] = [
  { path: '/sign-in', HydrateFallback, ...page(() => import('./features/auth/SignInPage'), 'SignInPage') },
  {
    element: <RequireAdmin />,
    HydrateFallback,
    children: [
      { element: <RequirePermission permission="overview:read" />, children: [{ path: '/', ...page(() => import('./features/overview/OverviewPage'), 'OverviewPage') }] },
      {
        element: <RequirePermission permission="users:read" />,
        children: [
          { path: '/users', ...page(() => import('./features/users/UsersPage'), 'UsersPage') },
          { path: '/users/:id', ...page(() => import('./features/users/UsersPage'), 'UsersPage') },
        ],
      },
      {
        element: <RequirePermission permission="exams:read" />,
        children: [
          { path: '/exams', ...page(() => import('./features/exams/ExamsPage'), 'ExamsPage') },
          { path: '/exams/:testId', ...page(() => import('./features/exams/ExamsPage'), 'ExamsPage') },
          { path: '/exams/:testId/q/:questionId', ...page(() => import('./features/exams/ExamsPage'), 'ExamsPage') },
        ],
      },
      { element: <RequirePermission permission="payments:read" />, children: [{ path: '/payments', ...page(() => import('./features/payments/PaymentsPage'), 'PaymentsPage') }] },
      { element: <RequirePermission permission="countries:read" />, children: [{ path: '/countries', ...page(() => import('./features/countries/CountriesPage'), 'CountriesPage') }] },
      {
        element: <RequirePermission permission="settings:write" />,
        children: [
          { path: '/settings', ...page(() => import('./features/settings/SettingsPage'), 'SettingsPage') },
          { path: '/settings/audit', ...page(() => import('./features/settings/AuditPage'), 'AuditPage') },
        ],
      },
      { path: '*', element: <Fallback /> },
    ],
  },
];
