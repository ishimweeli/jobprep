import { Navigate, Outlet } from 'react-router-dom';
import { SiteShell } from '../../components/layout/SiteLayout';
import { SkeletonList } from '../../components/states';
import { useSession } from '../auth/session';

/** Signed-in-only pages (outside `/:country`). Guests go to the sign-up screen (the only designed entry). */
export function AccountLayout() {
  const { user, isLoading } = useSession();
  if (isLoading) {
    return (
      <SiteShell>
        <div className="mx-auto w-full max-w-[640px] p-6">
          <SkeletonList count={2} label="Loading…" />
        </div>
      </SiteShell>
    );
  }
  if (!user) return <Navigate to="/sign-up" replace />;
  return (
    <SiteShell>
      <Outlet />
    </SiteShell>
  );
}
