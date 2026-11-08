import { ChevronRight, Mic } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession } from '../auth/session';
import { countryPath } from '../country/hooks';

/**
 * "Practise the interview for this job": from a job page into Interview Preparation, with the job already chosen.
 * Shown to signed-in people while interview prep is switched on.
 */
export function InterviewCta({ slug, jobSlug, jobName }: { slug: string; jobSlug: string; jobName: string }) {
  const { session } = useSession();
  if (!session?.features?.interviewPrep) return null;
  return (
    <Link
      to={`${countryPath(slug, 'interview', 'new')}?job=${encodeURIComponent(jobSlug)}`}
      data-testid="interview-cta"
      className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5 text-ink no-underline hover:text-ink md:px-4 dark:border-night-border dark:bg-night-surface dark:text-night-ink"
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control bg-brand text-white">
        <Mic size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-bold text-heading dark:text-night-heading">Practise the interview for this job</span>
        <span className="text-[13px] leading-snug text-ink-2 dark:text-night-muted">
          Talk with an AI interviewer about the {jobName} role and get feedback on every answer.
        </span>
      </span>
      <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" className="flex-none text-muted" />
    </Link>
  );
}
