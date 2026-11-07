import { Link } from 'react-router-dom';
import type { JobMockTestCard } from '../../api/types';
import { Badge } from '../../components/Badge';
import { buttonClasses } from '../../components/Button';
import { difficultyLabel, languageList, plural } from '../../lib/format';
import { countryPath } from '../country/hooks';

const STATE_LABEL: Record<JobMockTestCard['access']['state'], string> = { FREE: 'Free', GRANTED: 'Full Access', LOCKED: 'Locked' };
const STATE_TONE: Record<JobMockTestCard['access']['state'], 'free' | 'active' | 'fullAccess'> = { FREE: 'free', GRANTED: 'active', LOCKED: 'fullAccess' };

/** "65% · 2 attempts": this person's best score and how many times they took it. Nothing when they have not. */
export function attemptsBadge(mine: JobMockTestCard['myAttempts']): string | null {
  if (!mine || mine.count < 1) return null;
  const times = plural(mine.count, 'attempt');
  return mine.bestPercent === null ? times : `${Math.round(mine.bestPercent)}% · ${times}`;
}

/** One mock test under a job's page: title, facts, its own access state, and a link to its own detail page (unchanged). */
export function JobMockTestRow({ slug, test }: { slug: string; test: JobMockTestCard }) {
  const attempts = attemptsBadge(test.myAttempts);
  return (
    <article className="relative flex flex-col gap-2 rounded-card border border-border-strong bg-surface p-3.5 md:flex-row md:flex-wrap md:items-center md:gap-x-6 md:gap-y-3 md:p-5">
      <div className="flex min-w-0 flex-col gap-1.5 md:flex-[1_1_360px]">
        <div className="flex items-center gap-1.5">
          <Badge tone={STATE_TONE[test.access.state]}>{STATE_LABEL[test.access.state]}</Badge>
          {attempts && <Badge tone="brand">{attempts}</Badge>}
        </div>
        <h3 className="m-0 text-base font-semibold leading-snug md:text-[17px]">{test.title}</h3>
        <ul className="m-0 flex list-none flex-wrap gap-x-[18px] gap-y-1 p-0 text-[13px] text-ink-2 md:text-sm">
          <li>{plural(test.questionCount, 'question')}</li>
          <li>{test.durationMinutes} minutes</li>
          <li>{languageList(test.languages)}</li>
          <li className="hidden md:list-item">{difficultyLabel(test.difficulty)}</li>
        </ul>
      </div>
      <Link
        to={countryPath(slug, 'tests', test.slug)}
        aria-label={`View test: ${test.title}`}
        className={buttonClasses({ variant: 'primary', size: 'md', className: 'after:absolute after:inset-0 after:rounded-[inherit] after:content-[\'\'] max-md:absolute max-md:inset-0 max-md:min-h-0 max-md:rounded-card max-md:bg-transparent max-md:px-0 max-md:text-[0] max-md:hover:bg-transparent md:flex-none' })}
      >
        View test
      </Link>
    </article>
  );
}
