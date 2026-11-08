import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader } from '../../components/states';
import { signInPath } from '../../lib/next';
import { useSession } from '../auth/session';
import { countryPath, useActiveCountrySlug } from '../country/hooks';

/** Interview Preparation needs an account, and exists only while the feature is switched on. */
export function InterviewGate({ children }: { children: ReactNode }) {
  const { session, user, isLoading } = useSession();
  const slug = useActiveCountrySlug();
  const { pathname, search } = useLocation();
  if (isLoading) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[960px] px-4 py-8">
        <Loader label="Loading…" />
      </main>
    );
  }
  if (!user) return <Navigate to={signInPath(`${pathname}${search}`)} replace />;
  if (!session?.features?.interviewPrep) return <Navigate to={countryPath(slug, 'tests')} replace />;
  return <>{children}</>;
}

/** The common page column of the interview screens. */
export function InterviewPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main id="main-content" tabIndex={-1} className={`mx-auto flex w-full flex-col gap-4 px-4 py-5 outline-none md:gap-5 md:px-6 md:py-7 ${wide ? 'max-w-[1100px]' : 'max-w-[860px]'}`}>
      {children}
    </main>
  );
}

export const card = 'min-w-0 rounded-card border border-border bg-surface p-4 md:rounded-card-lg md:p-5 dark:border-night-border dark:bg-night-surface';
export const muted = 'text-muted dark:text-night-muted';
export const heading = 'text-heading dark:text-night-heading';
