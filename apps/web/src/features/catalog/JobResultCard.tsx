import { Link } from 'react-router-dom';
import type { JobCard } from '../../api/types';
import { Badge } from '../../components/Badge';
import { jobAccessSummary, jobDeadlineLabel } from '../../lib/format';
import { countryPath } from '../country/hooks';

/** A row has no room for the word "Application"; the badge keeps the part that matters ("Closes in 5 days"). */
const shortDeadline = (text: string) => text.replace(/^Application c/, 'C');

/**
 * One catalog result: a job, with only what helps pick it (title, deadline, free or Full Access). Question counts,
 * minutes and languages are the same on most cards, so they live on the job's page. The whole card links there.
 */
export function JobResultCard({ slug, job }: { slug: string; job: JobCard }) {
  const deadlineLabel = jobDeadlineLabel(job.jobDeadlineAt);
  return (
    <article className="relative flex flex-col gap-2 rounded-card border border-border-strong bg-surface px-4 py-3.5 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 flex-col gap-2 md:flex-1">
        <h2 className="m-0 text-base font-semibold leading-snug md:font-bold">{job.jobName}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {deadlineLabel && <Badge tone={deadlineLabel.closed ? 'neutral' : 'brand'}>{shortDeadline(deadlineLabel.text)}</Badge>}
          <Badge tone={job.freeCount > 0 ? 'free' : 'fullAccess'}>{jobAccessSummary(job.freeCount, job.mockTestCount)}</Badge>
        </div>
      </div>
      <Link
        to={countryPath(slug, 'tests', 'jobs', job.jobSlug)}
        aria-label={`View exams: ${job.jobName}`}
        className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-control bg-brand px-[22px] text-[15px] font-semibold text-white no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:bg-brand-hover hover:text-white max-md:absolute max-md:inset-0 max-md:min-h-0 max-md:rounded-card max-md:bg-transparent max-md:px-0 max-md:text-[0] max-md:hover:bg-transparent md:min-h-9 md:flex-none md:px-4 md:text-sm"
      >
        View exams
      </Link>
    </article>
  );
}
