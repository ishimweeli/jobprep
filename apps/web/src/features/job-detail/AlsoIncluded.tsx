import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { catalogKeys, listJobs } from '../../api/catalog';
import { plural } from '../../lib/format';
import { countryPath } from '../country/hooks';

const QUERY = { pageSize: 50 };

/** Job names to show as examples: the others first, without the one the person is already looking at. */
export function otherJobs(jobs: { jobSlug: string; jobName: string; mockTestCount: number }[], currentSlug: string | null, max = 5) {
  // The psychometric section is practice, not a job, so it does not count as one.
  const others = jobs.filter((j) => j.jobSlug !== currentSlug && !j.jobSlug.endsWith('-psychometric-test-preparation'));
  return { names: others.slice(0, max).map((j) => j.jobName), count: others.length, mockTests: others.reduce((n, j) => n + j.mockTestCount, 0) };
}

/** What else Full Access opens. Every number comes from the live catalog, so it can never overstate what is there. */
export function AlsoIncluded({ slug, currentJobSlug = null, title }: { slug: string; currentJobSlug?: string | null; title: string }) {
  const q = useQuery({ queryKey: catalogKeys.jobList(slug, QUERY), queryFn: () => listJobs(slug, QUERY), staleTime: 60_000, retry: false });
  if (!q.data) return null;
  const { names, count, mockTests } = otherJobs(q.data.results, currentJobSlug);
  if (count === 0) return null;
  return (
    <section aria-label={title} data-testid="also-included" className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3.5 md:p-4">
      <h2 className="m-0 text-[15px] font-bold text-heading">{title}</h2>
      <p className="m-0 text-sm leading-normal text-ink-2">
        {plural(mockTests, 'mock exam')} for {plural(count, currentJobSlug ? 'other job' : 'job')}, including {names.join(', ')}.
      </p>
      <Link to={countryPath(slug, 'tests')} className="link self-start text-sm font-semibold">
        See every job
      </Link>
    </section>
  );
}
