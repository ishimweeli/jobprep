import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { attemptKeys, startTopicPractice, startWeakPractice } from '../../api/attempts';
import type { PracticeStartResponse } from '../../api/types';
import { authErrorMessage } from '../../lib/errorCopy';
import { addGuestToken } from '../../lib/guestTokens';
import { countryPath } from '../country/hooks';

/**
 * Start a practice set and open its runner (Practice.dc). From the results screen it is built from that attempt's
 * weak topics; from the dashboard it is one topic. A guest's token is kept so the set can be reopened.
 */
export function useStartPractice(slug: string) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: { fromAttempt: string } | { topicId: string }): Promise<PracticeStartResponse> =>
      'fromAttempt' in input ? startWeakPractice(input.fromAttempt) : startTopicPractice(slug, input.topicId),
    onSuccess: (r) => {
      if (r.guestToken) addGuestToken(r.guestToken);
      void qc.invalidateQueries({ queryKey: attemptKeys.inProgress });
      navigate(countryPath(slug, 'exam', r.attemptId));
    },
  });
  return {
    startFromAttempt: (fromAttempt: string) => mutation.mutate({ fromAttempt }),
    startTopic: (topicId: string) => mutation.mutate({ topicId }),
    pending: mutation.isPending,
    error: mutation.isError ? authErrorMessage(mutation.error) : null,
  };
}
