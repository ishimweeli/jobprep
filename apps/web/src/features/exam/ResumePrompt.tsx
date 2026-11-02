import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { attemptKeys, listInProgress, submitAttempt } from '../../api/attempts';
import type { InProgressAttempt } from '../../api/types';
import { ActionLink, Button } from '../../components/Button';
import { ROUTES_READY } from '../../lib/routesReady';
import { countryPath } from '../country/hooks';
import { createQueueStore, pendingItems, toWire } from './queue';
import { formatClock } from './timer';
import { useRemaining } from './useRemaining';

/** The in-progress attempts for this browser (signed in: all; guest: the ones this device holds a token for). */
export function useInProgress() {
  return useQuery({ queryKey: attemptKeys.inProgress, queryFn: listInProgress, staleTime: 0, retry: false });
}

/**
 * "You have a test in progress" (States.dc RESUME): Resume, or Submit as it is. Shown on the details page of the
 * test that has a running attempt. `Submit as it is` first sends anything this device had not saved yet.
 */
export function ResumePrompt({ attempt, slug }: { attempt: InProgressAttempt; slug: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const left = useRemaining(attempt.remainingSeconds);
  const submit = useMutation({
    mutationFn: async () => {
      const store = createQueueStore();
      const queued = pendingItems(await store.load(attempt.id).catch(() => []));
      const out = await submitAttempt(attempt.id, toWire(queued).slice(0, 100));
      await store.clear(attempt.id).catch(() => undefined);
      return out;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: attemptKeys.inProgress });
      navigate(countryPath(slug, 'results', attempt.id));
    },
  });

  return (
    <section aria-labelledby="resume-t" className="flex flex-col gap-2.5 rounded-[14px] border border-[#DDD6FE] bg-brand-softer p-[18px]">
      <h2 id="resume-t" className="m-0 text-base font-bold">
        You have a test in progress
      </h2>
      <p className="m-0 text-[15px] text-ink-2">
        {attempt.mockTest.title} · {attempt.answered} of {attempt.total} answered · {formatClock(left)} left
      </p>
      <div className="flex flex-wrap gap-2">
        <ActionLink
          ready={ROUTES_READY.resume}
          to={countryPath(slug, 'exam', attempt.id)}
          variant="primary"
          size="sm"
          className="rounded-control px-[18px] py-3 !text-[15px] font-bold"
        >
          Resume
        </ActionLink>
        <Button variant="neutral" size="sm" className="px-3.5 font-semibold" loading={submit.isPending} onClick={() => submit.mutate()}>
          Submit as it is
        </Button>
      </div>
      {submit.isError && (
        <p role="alert" className="m-0 text-sm font-semibold text-red-900">
          We could not submit this test. Check your internet connection and try again.
        </p>
      )}
    </section>
  );
}
