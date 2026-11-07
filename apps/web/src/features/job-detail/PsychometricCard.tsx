import { Brain, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { plural } from '../../lib/format';
import { countryPath } from '../country/hooks';

export interface PsychometricPrep {
  jobSlug: string;
  mockTestCount: number;
  freeCount: number;
}

/** The way into the psychometric section. It only appears once the section has published exams. */
export function PsychometricCard({ slug, prep, compact }: { slug: string; prep: PsychometricPrep; compact?: boolean }) {
  const counts = `${plural(prep.mockTestCount, 'practice exam')}${prep.freeCount > 0 ? `, ${prep.freeCount} free` : ''}`;
  if (compact) {
    // The catalog keeps every job and the page buttons on one screen, so here the card is a single line on desktop.
    return (
      <Link
        to={countryPath(slug, 'tests', 'jobs', prep.jobSlug)}
        data-testid="psychometric-card"
        className="flex items-center gap-2.5 rounded-card border border-brand/30 bg-brand-soft px-3 py-2 text-ink no-underline hover:text-ink md:py-1.5"
      >
        <Brain size={16} strokeWidth={2} aria-hidden="true" className="flex-none text-brand" />
        <span className="min-w-0 flex-1 text-[13px] leading-snug">
          <strong className="font-bold text-heading">Psychometric test practice</strong>: numerical, verbal and logical reasoning, plus public service judgment. {counts}.
        </span>
        <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" className="flex-none text-muted" />
      </Link>
    );
  }
  return (
    <Link
      to={countryPath(slug, 'tests', 'jobs', prep.jobSlug)}
      data-testid="psychometric-card"
      className="flex items-center gap-3 rounded-card border border-brand/30 bg-brand-soft px-3.5 py-2.5 text-ink no-underline hover:text-ink md:px-4"
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control bg-brand text-white">
        <Brain size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-bold text-heading">Psychometric test practice</span>
        <span className="text-[13px] leading-snug text-ink-2">
          Recruitment can include a psychometric test before the written exam. Numerical, verbal and logical reasoning, plus public service judgment: {counts}.
        </span>
      </span>
      <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" className="flex-none text-muted" />
    </Link>
  );
}
