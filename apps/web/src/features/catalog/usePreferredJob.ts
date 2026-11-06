import { useMutation, useQueryClient } from '@tanstack/react-query';
import { meKeys, patchMe } from '../../api/me';
import type { MeResponse } from '../../api/types';
import { clearStoredPreferredJob, getStoredPreferredJob, setStoredPreferredJob } from '../../lib/preferredJob';
import { useActiveCountrySlug } from '../country/hooks';
import { useSession } from '../auth/session';

/** Writes the resolved `preferredJob` straight into the session's cached query, so the very next render sees it. */
function writePreferredJobToCache(qc: ReturnType<typeof useQueryClient>, preferredJob: MeResponse['preferredJob']) {
  qc.setQueryData<MeResponse | null>(meKeys.session, (prev) => (prev ? { ...prev, preferredJob } : prev));
}

/** The job to auto-open on `/tests`: a signed-in user's saved job, or a guest's locally-remembered one. */
export function usePreferredJobSlug(): { slug: string | null; isLoading: boolean } {
  const countrySlug = useActiveCountrySlug();
  const { user, preferredJob, isLoading } = useSession();
  if (user) return { slug: preferredJob?.slug ?? null, isLoading };
  return { slug: getStoredPreferredJob(countrySlug), isLoading: false };
}

/** Call when a job's detail page loads: that's "picking" it, whether arrived at via a card, a link, or search. */
export function useSetPreferredJob(): (job: { examId: string; slug: string }) => void {
  const { user, preferredJob } = useSession();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (job: { examId: string }) => patchMe({ preferredExamId: job.examId }),
    onSuccess: (res) => writePreferredJobToCache(qc, res.preferredJob),
  });
  return (job) => {
    if (!user) {
      setStoredPreferredJob(job.slug);
    } else if (preferredJob?.examId !== job.examId) {
      mutation.mutate(job);
    }
  };
}

/** "Change job": clears the saved preference so `/tests` shows the full catalog again. */
export function useClearPreferredJob(): () => Promise<void> {
  const { user } = useSession();
  const qc = useQueryClient();
  return async () => {
    if (!user) {
      clearStoredPreferredJob();
      return;
    }
    const res = await patchMe({ preferredExamId: null });
    writePreferredJobToCache(qc, res.preferredJob);
  };
}
