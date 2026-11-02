import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { attemptKeys, getAttempt, saveAnswers, submitAttempt } from '../../api/attempts';
import { ErrorState, SkeletonList } from '../../components/states';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { PracticeRunner } from '../practice/PracticeRunner';
import { ExamRunner } from './ExamRunner';
import { createQueueStore, mergeQueueOnto, type LocalAnswers } from './queue';
import { SaveEngine } from './saveEngine';

/**
 * Route `/:country/exam/:attemptId`. Always loads the SERVER state first (so a refresh or another device resumes
 * from what the server holds), then lays any unsent local queue on top by timestamp.
 */
export function ExamPage() {
  const slug = useActiveCountrySlug();
  const { attemptId = '' } = useParams();
  const state = useQuery({
    queryKey: attemptKeys.state(attemptId),
    queryFn: () => getAttempt(attemptId),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [boot, setBoot] = useState<null | { engine: SaveEngine; answers: LocalAnswers }>(null);

  const data = state.data;
  useEffect(() => {
    if (!data || data.finished || data.attempt.kind === 'PRACTICE') return;
    let cancelled = false;
    const engine = new SaveEngine({ attemptId, store: createQueueStore(), save: (id, changes) => saveAnswers(id, changes), saveKeepalive: (id, changes) => saveAnswers(id, changes, true), submit: submitAttempt });
    void engine.load().then((items) => {
      if (!cancelled) setBoot({ engine, answers: mergeQueueOnto(data.answers, items) });
    });
    return () => {
      cancelled = true;
      engine.destroy();
    };
  }, [data, attemptId]);

  if (state.isError) {
    return (
      <main id="main-content" className="mx-auto max-w-[640px] px-4 py-10">
        <ErrorState title="We could not load this exam" onRetry={() => void state.refetch()} retrying={state.isFetching} />
      </main>
    );
  }
  if (data?.finished) return <Navigate to={countryPath(slug, 'results', attemptId)} replace />;
  // A practice set has no clock, no autosave queue and its own screen (Practice.dc).
  if (data && !data.finished && data.attempt.kind === 'PRACTICE') return <PracticeRunner state={data} slug={slug} />;
  if (!data || !boot) {
    return (
      <main id="main-content" className="mx-auto max-w-[640px] px-4 py-10">
        <SkeletonList count={3} label="Loading your exam…" />
      </main>
    );
  }
  return <ExamRunner state={data} engine={boot.engine} initialAnswers={boot.answers} slug={slug} />;
}
