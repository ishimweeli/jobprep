import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { adminMe, keys } from '../../api/admin';
import { isApiError, signInReasonOf, type SignInReason } from '../../api/client';
import type { AdminMe, Permission } from '../../api/types';
import { meKeys } from '../../../api/me';
import { clearSessionHint } from '../../../lib/sessionHint';
import { signInAgainPath, signInPath } from '../../../lib/next';
import { ErrorBox, Skeleton } from '../../components/states';
import { AccessDenied } from '../../components/AccessDenied';
import { firstAllowedPath } from '../../lib/permissions';
import { NoAccess } from './NoAccess';

const AdminContext = createContext<AdminMe | null>(null);

export function AdminProvider({ admin, children }: { admin: AdminMe; children: ReactNode }) {
  return <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>;
}

/** The signed-in admin (only inside the guarded routes). */
export function useAdmin(): AdminMe {
  const a = useContext(AdminContext);
  if (!a) throw new Error('useAdmin outside <RequireAdmin>');
  return a;
}

export const useCan = () => {
  const { permissions } = useAdmin();
  return (p: Permission) => permissions.includes(p);
};

/**
 * Sends the person to the normal sign-in, with a return to `here`. No session (`required`): the browser's "signed in"
 * hint and the cached candidate session are dropped first so the sign-in screen does not bounce back. A session that is
 * more than 12 hours old (`stale`): the screen stays open for a new sign-in and says why. Cached admin data is cleared
 * either way, because the next person to sign in may be somebody else.
 */
export function goToSignIn(qc: ReturnType<typeof useQueryClient>, navigate: NavigateFunction, reason: SignInReason, here: string): void {
  qc.removeQueries({ queryKey: ['admin'] });
  if (reason === 'required') {
    clearSessionHint();
    qc.setQueryData(meKeys.session, null);
  }
  navigate(reason === 'stale' ? signInAgainPath(here) : signInPath(here), { replace: true });
}

/**
 * Every admin page needs a normal session AND an admin role, both decided by `GET /api/admin/me`: 401 sends the person
 * to the normal sign-in (and back here afterwards), 403 means signed in without a role (the no-access page).
 */
export function RequireAdmin() {
  const loc = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: keys.me, queryFn: adminMe, staleTime: 60_000, retry: (n, e) => !(isApiError(e) && e.status < 500) && n < 1 });

  const reason = me.isError ? signInReasonOf(me.error) : null;
  const here = `${loc.pathname}${loc.search}`;
  useEffect(() => {
    if (reason) goToSignIn(qc, navigate, reason, here);
  }, [reason, qc, navigate, here]);

  if (me.isPending || reason) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <Skeleton className="w-full" />
      </div>
    );
  }
  if (me.isError) {
    if (isApiError(me.error) && me.error.status === 403) return <NoAccess />;
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <ErrorBox error={me.error} onRetry={() => void me.refetch()} className="w-full" />
      </div>
    );
  }
  return (
    <AdminProvider admin={me.data}>
      <Outlet />
    </AdminProvider>
  );
}

/**
 * A page the role cannot use, reached by its address: say so ("You do not have access to this", A17) instead of moving
 * the person elsewhere. A role that opens no page at all gets the plain no-access page.
 */
export function RequirePermission({ permission }: { permission: Permission }) {
  const admin = useAdmin();
  if (admin.permissions.includes(permission)) return <Outlet />;
  return firstAllowedPath(admin.permissions) ? <AccessDenied /> : <NoAccess />;
}
