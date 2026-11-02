import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SiteShell } from '../../components/layout/SiteLayout';
import { SkeletonList } from '../../components/states';
import { signInPath } from '../../lib/next';
import { useSession } from '../auth/session';

/** Signed-in-only pages (outside `/:country`). Guests go to the sign-in screen and come back. */
export function AccountLayout() {
  const { user, isLoading } = useSession();
  const { pathname, search } = useLocation();
  if (isLoading) {
    return (
      <SiteShell>
        <div className="mx-auto w-full max-w-[640px] p-6">
          <SkeletonList count={2} label="Loading…" />
        </div>
      </SiteShell>
    );
  }
  if (!user) return <Navigate to={signInPath(`${pathname}${search}`)} replace />;
  return (
    <SiteShell>
      <Outlet />
    </SiteShell>
  );
}
