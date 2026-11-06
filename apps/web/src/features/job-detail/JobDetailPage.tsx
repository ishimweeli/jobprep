import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { catalogKeys, getJob } from '../../api/catalog';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { QueryError, SkeletonBar, SkeletonList } from '../../components/states';
import { jobDeadlineLabel, plural } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useClearPreferredJob, useSetPreferredJob } from '../catalog/usePreferredJob';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { JobMockTestRow } from './JobMockTestRow';

/**
 * One job's page (`/:country/tests/jobs/:jobSlug`): every mock test under it. Landing here is what *picks* this
 * job as the "preferred" one (see `usePreferredJob.ts`), so there is no plain "back to Mock tests" link — a bare
 * one would just get redirected straight back here. "Change job" clears the preference and leaves.
 */
export function JobDetailPage() {
  const slug = useActiveCountrySlug();
  const navigate = useNavigate();
  const { jobSlug = '' } = useParams();
  const q = useQuery({ queryKey: catalogKeys.jobDetail(slug, jobSlug), queryFn: () => getJob(slug, jobSlug), staleTime: 30_000 });
  const job = q.data;
  useDocumentTitle(job?.exam.name);

  const setPreferred = useSetPreferredJob();
  useEffect(() => {
    if (job) setPreferred({ examId: job.exam.id, slug: job.exam.slug });
    // Only re-run when the loaded job itself changes, not on every render of a stable setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.exam.id]);

  const clearPreferred = useClearPreferredJob();
  const changeJob = async () => {
    await clearPreferred();
    navigate(countryPath(slug, 'tests'), { replace: true });
  };

  if (q.isError) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
        <QueryError error={q.error} what="this job" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </main>
    );
  }

  if (!job) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-7">
        <div className="mb-5 flex flex-col gap-3" aria-hidden="true">
          <SkeletonBar className="h-6 w-1/3" />
          <SkeletonBar className="h-9 w-4/5 bg-border" />
        </div>
        <SkeletonList count={3} label="Loading job…" />
      </main>
    );
  }

  const deadlineLabel = jobDeadlineLabel(job.jobDeadlineAt);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-surface p-2 md:hidden">
        <span className="pl-2 text-[17px] font-semibold">{job.category.name}</span>
        <Button variant="neutral" size="sm" onClick={() => void changeJob()}>
          Change job
        </Button>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 pb-6 pt-[18px] md:gap-[22px] md:px-6 md:pb-16 md:pt-7">
        <nav aria-label="Breadcrumb" className="hidden items-center justify-between gap-3 text-sm text-muted md:flex dark:text-night-muted">
          <span>
            <Link to={countryPath(slug)} className="text-muted underline hover:text-ink dark:text-night-muted">
              Home
            </Link>{' '}
            › {job.category.name} › {job.exam.name}
          </span>
          <Button variant="neutral" size="sm" onClick={() => void changeJob()}>
            Change job
          </Button>
        </nav>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{job.category.name}</Badge>
            {deadlineLabel && <Badge tone={deadlineLabel.closed ? 'neutral' : 'brand'}>{deadlineLabel.text}</Badge>}
          </div>
          <h1 className="m-0 text-[22px] font-bold leading-[1.2] tracking-[-0.02em] text-heading md:text-2xl dark:text-night-heading">{job.exam.name}</h1>
          <p className="m-0 max-w-[44em] text-base leading-[1.55] text-ink-2 md:text-[17px]">
            Prepare for your recruitment exam with {plural(job.totalMockTests, 'practice test')} for this position.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:gap-3.5">
          {job.mockTests.map((t) => (
            <JobMockTestRow key={t.id} slug={slug} test={t} />
          ))}
        </div>
      </main>
    </div>
  );
}
