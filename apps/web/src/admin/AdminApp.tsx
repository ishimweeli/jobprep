import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { onSignInRequired } from './api/client';
import { Loader } from './components/states';
import { ToastProvider } from './components/Toast';
import { goToSignIn, RequireAdmin, RequirePermission, useAdmin } from './features/auth/session';
import { firstAllowedPath } from './lib/permissions';
import './styles/admin.css';

/**
 * The admin area, mounted by the web app at `/admin/*` (apps/web/src/routes.tsx) and loaded on demand, so candidates
 * never download it. It has no sign-in of its own: `RequireAdmin` sends a signed-out visitor to the normal sign-in and
 * back here, a person without a role gets the no-access page, and every page checks its permission from `/api/admin/me`.
 */
const page = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  lazy(async () => ({ default: (await load())[name] }));

const OverviewPage = page(() => import('./features/overview/OverviewPage'), 'OverviewPage');
const UsersPage = page(() => import('./features/users/UsersPage'), 'UsersPage');
const ExamsPage = page(() => import('./features/exams/ExamsPage'), 'ExamsPage');
const PaymentsPage = page(() => import('./features/payments/PaymentsPage'), 'PaymentsPage');
const CountriesPage = page(() => import('./features/countries/CountriesPage'), 'CountriesPage');
const SettingsPage = page(() => import('./features/settings/SettingsPage'), 'SettingsPage');
const AuditPage = page(() => import('./features/settings/AuditPage'), 'AuditPage');
const CandidateViewPage = page(() => import('./features/users/CandidateViewPage'), 'CandidateViewPage');
const PaymentDetailPage = page(() => import('./features/payments/PaymentDetailPage'), 'PaymentDetailPage');
const MockTestFormPage = page(() => import('./features/exams/MockTestFormPage'), 'MockTestFormPage');
const ImportPage = page(() => import('./features/exams/ImportPage'), 'ImportPage');
const CatalogPage = page(() => import('./features/exams/CatalogPage'), 'CatalogPage');
const CasePage = page(() => import('./features/exams/CasePage'), 'CasePage');
const ReportsPage = page(() => import('./features/exams/ReportsPage'), 'ReportsPage');
const FeedbackPage = page(() => import('./features/exams/FeedbackPage'), 'FeedbackPage');
const RequestsPage = page(() => import('./features/exams/RequestsPage'), 'RequestsPage');
const WaitingListPage = page(() => import('./features/countries/WaitingListPage'), 'WaitingListPage');

/** An unknown path goes to the first page the role may use (there is no 404 design for the admin yet). */
function Fallback() {
  const admin = useAdmin();
  return <Navigate to={firstAllowedPath(admin.permissions) ?? '/admin'} replace />;
}

const Loading = () => (
  <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
    <Loader className="w-full" />
  </div>
);

/** Admin-only document state: the base-style overrides of admin.css and "do not index". Undone when leaving /admin. */
function useAdminDocument() {
  useEffect(() => {
    document.documentElement.classList.add('admin-area');
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.documentElement.classList.remove('admin-area');
      meta.remove();
    };
  }, []);
}

/** A 401 on any admin call means the session ended or is more than 12 hours old: back to the normal sign-in. */
function useSignInAgain() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(
    () =>
      onSignInRequired((reason) => {
        if (window.location.pathname.startsWith('/sign-in')) return;
        goToSignIn(qc, navigate, reason, `${window.location.pathname}${window.location.search}`);
      }),
    [qc, navigate],
  );
}

export default function AdminApp() {
  useAdminDocument();
  useSignInAgain();
  return (
    <ToastProvider>
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<RequireAdmin />}>
          <Route element={<RequirePermission permission="overview:read" />}>
            <Route index element={<OverviewPage />} />
          </Route>
          <Route element={<RequirePermission permission="users:read" />}>
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<UsersPage />} />
            <Route path="users/:id/view" element={<CandidateViewPage />} />
          </Route>
          <Route element={<RequirePermission permission="exams:read" />}>
            <Route path="exams" element={<ExamsPage />} />
            {/* Static segments first: React Router ranks them above `exams/:testId`. Writes need exams:write (each screen shows what a read-only role may not do). */}
            <Route path="exams/new" element={<MockTestFormPage />} />
            <Route path="exams/import" element={<ImportPage />} />
            <Route path="exams/catalog" element={<CatalogPage />} />
            <Route path="exams/reports" element={<ReportsPage />} />
            <Route path="exams/feedback" element={<FeedbackPage />} />
            <Route path="exams/requests" element={<RequestsPage />} />
            <Route path="exams/:testId" element={<ExamsPage />} />
            <Route path="exams/:testId/edit" element={<MockTestFormPage />} />
            <Route path="exams/:testId/import" element={<ImportPage />} />
            <Route path="exams/:testId/cases" element={<CasePage />} />
            <Route path="exams/:testId/cases/:caseId" element={<CasePage />} />
            <Route path="exams/:testId/q/new" element={<ExamsPage />} />
            <Route path="exams/:testId/q/:questionId" element={<ExamsPage />} />
          </Route>
          <Route element={<RequirePermission permission="payments:read" />}>
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="payments/:id" element={<PaymentDetailPage />} />
          </Route>
          <Route element={<RequirePermission permission="countries:read" />}>
            <Route path="countries" element={<CountriesPage />} />
            <Route path="countries/waiting-list" element={<WaitingListPage />} />
          </Route>
          <Route element={<RequirePermission permission="settings:write" />}>
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          {/* The audit log is for whoever holds audit:read (the System admin), whether or not they can open Settings. */}
          <Route element={<RequirePermission permission="audit:read" />}>
            <Route path="settings/audit" element={<AuditPage />} />
          </Route>
          <Route path="*" element={<Fallback />} />
        </Route>
      </Routes>
    </Suspense>
    </ToastProvider>
  );
}
