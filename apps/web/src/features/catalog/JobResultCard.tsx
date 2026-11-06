import { Link } from 'react-router-dom';
import type { JobCard } from '../../api/types';
import { Badge } from '../../components/Badge';
import { jobAccessSummary, jobDeadlineLabel, jobDifficultyLabel, jobFactsLine, languageList, languageListShort, plural } from '../../lib/format';
import { countryPath } from '../country/hooks';

/** A row has no room for the word "Application"; the badge keeps the part that matters ("Closes in 5 days"). */
const shortDeadline = (text: string) => text.replace(/^Application c/, 'C');

/**
 * One catalog result: a job, its mock tests aggregated. The whole card links to that job's page (`JobDetailPage`).
 * On desktop it is one list row with the button at the end, sized so a page of 7 fits on a screen; on phone it stacks.
 */
export function JobResultCard({ slug, job }: { slug: string; job: JobCard }) {
  const deadlineLabel = jobDeadlineLabel(job.jobDeadlineAt);
  return (
    <article className="relative flex flex-col gap-1.5 rounded-card border border-border-strong bg-surface px-3.5 py-3 md:flex-row md:items-center md:gap-4 md:px-4">
      <div className="flex min-w-0 flex-col gap-1.5 md:flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="m-0 text-[15px] font-semibold leading-snug md:text-base md:font-bold">{job.jobName}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {deadlineLabel && <Badge tone={deadlineLabel.closed ? 'neutral' : 'brand'}>{shortDeadline(deadlineLabel.text)}</Badge>}
            <Badge tone={job.freeCount > 0 ? 'free' : 'fullAccess'}>{jobAccessSummary(job.freeCount, job.mockTestCount)}</Badge>
          </div>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-0.5 p-0 text-[13px] text-ink-2 md:block md:truncate md:[&>li:not(:last-child)]:after:content-['_·_'] md:[&>li]:inline">
          <li>{plural(job.mockTestCount, 'mock exam')}</li>
          <li>{jobFactsLine(job)}</li>
          <li>
            <span className="md:hidden">{languageListShort(job.languages)}</span>
            <span className="hidden md:inline">{languageList(job.languages)}</span>
          </li>
          <li className="hidden md:inline">{jobDifficultyLabel(job.difficulties)}</li>
          <li className="hidden md:inline">{job.category.name}</li>
        </ul>
      </div>
      <Link
        to={countryPath(slug, 'tests', 'jobs', job.jobSlug)}
        aria-label={`View ${plural(job.mockTestCount, 'exam')}: ${job.jobName}`}
        className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-control bg-brand px-[22px] text-[15px] font-semibold text-white no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:bg-brand-hover hover:text-white max-md:absolute max-md:inset-0 max-md:min-h-0 max-md:rounded-card max-md:bg-transparent max-md:px-0 max-md:text-[0] max-md:hover:bg-transparent md:min-h-9 md:flex-none md:px-4 md:text-sm"
      >
        View {plural(job.mockTestCount, 'exam')}
      </Link>
    </article>
  );
}
