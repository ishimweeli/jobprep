import { Link } from 'react-router-dom';
import type { TestCard } from '../../api/types';
import { AccessBadge, Badge } from '../../components/Badge';
import { difficultyLabel, jobDeadlineLabel, languageList, languageListShort, plural } from '../../lib/format';
import { countryPath } from '../country/hooks';

/**
 * One catalog result. The single "View test" link is stretched over the whole card (so a phone card is
 * fully tappable, as in the design); its label is visible from md up and read by screen readers on phone.
 */
export function ResultCard({ slug, test }: { slug: string; test: TestCard }) {
  const deadlineLabel = jobDeadlineLabel(test.jobDeadlineAt);
  return (
    <article className="relative flex flex-col gap-2 rounded-card border border-border-strong bg-surface p-3.5 md:flex-row md:flex-wrap md:items-center md:gap-x-6 md:gap-y-4 md:p-5">
      <div className="flex min-w-0 flex-col gap-2 md:flex-[1_1_360px]">
        <div className="flex flex-wrap items-center justify-between gap-2 md:justify-start">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-heading md:text-[12px]">{test.category.name}</span>
          <div className="flex items-center gap-1.5">
            {deadlineLabel && <Badge tone="brand">{deadlineLabel}</Badge>}
            <AccessBadge isFree={test.isFree} />
          </div>
        </div>
        <h2 className="m-0 text-base font-semibold leading-snug md:text-[17px] md:font-bold md:leading-[1.3]">{test.title}</h2>
        <ul className="m-0 flex list-none flex-wrap gap-x-[18px] gap-y-1.5 p-0 text-[13px] text-ink-2 md:text-sm">
          <li>{plural(test.questionCount, 'question')}</li>
          <li>{test.durationMinutes} min<span className="hidden md:inline">utes</span></li>
          <li>
            <span className="md:hidden">{languageListShort(test.languages)}</span>
            <span className="hidden md:inline">{languageList(test.languages)}</span>
          </li>
          <li>{difficultyLabel(test.difficulty)}</li>
          <li className="hidden md:list-item">{test.attempts === 'UNLIMITED' ? 'Unlimited attempts' : test.attempts}</li>
        </ul>
      </div>
      <Link
        to={countryPath(slug, 'tests', test.slug)}
        aria-label={`View test: ${test.title}`}
        className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-brand px-[22px] text-[15px] font-semibold text-white no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:bg-brand-hover hover:text-white max-md:absolute max-md:inset-0 max-md:min-h-0 max-md:rounded-card max-md:bg-transparent max-md:px-0 max-md:text-[0] max-md:hover:bg-transparent md:flex-none"
      >
        View test
      </Link>
    </article>
  );
}
