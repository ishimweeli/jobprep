import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { adminMe, keys } from '../../api/admin';
import { isApiError } from '../../api/client';
import type { AdminMe, Permission } from '../../api/types';
import { ErrorBox, Skeleton } from '../../components/states';
import { firstAllowedPath } from '../../lib/permissions';

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

/** A same-site path only (never an absolute URL), so ?next= cannot send anyone elsewhere. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/sign-in')) return null;
  return next;
}

/** Everything but /sign-in needs an admin session. 401 from `/auth/me` means "not signed in". */
export function RequireAdmin() {
  const loc = useLocation();
  const me = useQuery({ queryKey: keys.me, queryFn: adminMe, staleTime: 60_000, retry: (n, e) => !(isApiError(e) && e.status < 500) && n < 1 });

  if (me.isPending) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <Skeleton className="w-full" />
      </div>
    );
  }
  if (me.isError) {
    if (isApiError(me.error) && me.error.status === 401) {
      const next = `${loc.pathname}${loc.search}`;
      return <Navigate to={next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`} replace />;
    }
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

/** A page the role cannot use goes to the first page it can (the "no access" screen is not designed yet, A17). */
export function RequirePermission({ permission }: { permission: Permission }) {
  const admin = useAdmin();
  if (admin.permissions.includes(permission)) return <Outlet />;
  return <Navigate to={firstAllowedPath(admin.permissions) ?? '/sign-in'} replace />;
}
