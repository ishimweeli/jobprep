import { useQuery } from '@tanstack/react-query';
import { getSession, meKeys } from '../../api/me';

/** The signed-in session (null = guest). One shared query; invalidate `meKeys.session` after sign-in/out. */
export function useSession() {
  const q = useQuery({ queryKey: meKeys.session, queryFn: getSession, staleTime: 60_000, retry: false });
  return {
    session: q.data ?? null,
    user: q.data?.user ?? null,
    preferredJob: q.data?.preferredJob ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
