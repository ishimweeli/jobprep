import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { attemptKeys, getReview } from '../../api/attempts';
import { isApiError } from '../../api/client';
import type { ReviewFilter, ReviewItem, ReviewResponse } from '../../api/types';
import { QueryError, SkeletonList } from '../../components/states';
import { cx } from '../../lib/cx';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import {
  BADGE, chooseCount, defaultFilter, filterItems, GRID_STYLE, gridAria, gridKind, gridMark, marksOfLabel, multiOptionNote, optionKind, positionLabel, tabsFor,
} from './reviewModel';
import { StartPracticeLink } from '../practice/StartPracticeLink';

/**
 * Answer review (Review.dc desktop: jump grid + every question in the filter; ReviewPhone.dc: one question at a
 * time with Previous / Next). One markup: on phones only the current question is displayed.
 * The review is fetched once with every question; the four filters are applied here with the API's own rules.
 */
export function ReviewPage() {
  const slug = useActiveCountrySlug();
  const { attemptId = '' } = useParams();
  const q = useQuery({ queryKey: attemptKeys.review(attemptId, 'all'), queryFn: () => getReview(attemptId, 'all'), retry: false, staleTime: 30_000 });
  useDocumentTitle('Answer review');

  if (q.isError && isApiError(q.error) && q.error.code === 'attempt_in_progress') return <Navigate to={countryPath(slug, 'exam', attemptId)} replace />;
  if (q.isError) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
        <QueryError error={q.error} what="the answer review" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </main>
    );
  }
  if (!q.data) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
        <SkeletonList count={3} label="Loading your answers…" />
      </main>
    );
  }
  return <ReviewView data={q.data} slug={slug} attemptId={attemptId} />;
}

function ReviewView({ data, slug, attemptId }: { data: ReviewResponse; slug: string; attemptId: string }) {
  const [params] = useSearchParams();
  const jump = Number(params.get('q'));
  const resultsTo = countryPath(slug, 'results', attemptId);

  const [filter, setFilter] = useState<ReviewFilter>(() => {
    const base = defaultFilter(data.counts);
    if (Number.isInteger(jump) && jump > 0) {
      const target = data.items.find((i) => i.number === jump);
      if (target && !filterItems([target], base).length) return 'all';
    }
    return base;
  });
  const list = useMemo(() => filterItems(data.items, filter), [data.items, filter]);
  const [pos, setPos] = useState(() => {
    if (Number.isInteger(jump) && jump > 0) {
      const f = filterItems(data.items, defaultFilter(data.counts));
      const i = f.findIndex((x) => x.number === jump);
      if (i >= 0) return i;
      const j = data.items.findIndex((x) => x.number === jump);
      return Math.max(0, j);
    }
    return 0;
  });
  const [scrollTo, setScrollTo] = useState<number | null>(Number.isInteger(jump) && jump > 0 ? jump : null);
  const phoneIndex = Math.min(pos, Math.max(0, list.length - 1));
  const tabs = tabsFor(data.counts);
  const correctCount = data.counts.all - data.counts.incorrect - data.counts.unanswered;
  const partlyCount = data.grid.filter((g) => g.status === 'partial').length;

  useEffect(() => {
    if (scrollTo === null) return;
    document.getElementById(`rq${scrollTo}`)?.scrollIntoView?.({ block: 'start' });
    setScrollTo(null);
  }, [scrollTo, list]);

  const pickTab = (f: ReviewFilter) => {
    setFilter(f);
    setPos(0);
  };
  const jumpTo = (number: number) => {
    let l = list;
    if (!l.some((i) => i.number === number)) {
      l = filterItems(data.items, 'all'); // the question is hidden by the current filter: show everything
      setFilter('all');
    }
    setPos(Math.max(0, l.findIndex((i) => i.number === number)));
    setScrollTo(number);
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-page text-ink md:block md:h-auto md:min-h-screen md:overflow-visible">
      {/* Desktop header */}
      <header className="hidden border-b border-border bg-surface md:block">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-5 gap-y-3 px-6 py-3.5">
          <Link to={resultsTo} className="inline-flex items-center gap-1.5 py-2.5 text-[15px] font-semibold no-underline">
            ← Back to results
          </Link>
          <span className="flex-1 text-base font-bold">Answer review · {data.mockTest.title}</span>
          <StartPracticeLink attemptId={attemptId} slug={slug} className="!min-h-0 px-4 py-[11px] font-semibold" />
        </div>
      </header>
      {/* Phone header */}
      <header className="flex shrink-0 flex-col gap-2 border-b border-border bg-surface px-4 pb-3 pt-2 md:hidden">
        <div className="flex items-center gap-1">
          <Link to={resultsTo} aria-label="Back to results" className="-ml-3 inline-flex h-11 w-11 items-center justify-center text-xl text-ink no-underline hover:text-ink">
            <span aria-hidden="true">←</span>
          </Link>
          <h1 className="m-0 text-lg">Answer review</h1>
        </div>
        <Tabs tabs={tabs} filter={filter} onPick={pickTab} className="-mx-4 overflow-x-auto px-4 pb-0.5 scrollbar-none" phone />
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col md:flex-row md:flex-wrap md:items-start md:gap-6 md:p-6">
        <aside aria-label="Jump to a question" className="hidden min-w-0 flex-[1_1_280px] flex-col gap-3.5 rounded-card-lg border border-border bg-surface p-5 md:flex">
          <h2 className="m-0 text-[17px]">All {data.counts.all} questions</h2>
          <div className="grid grid-cols-7 gap-1.5">
            {data.grid.map((g) => (
              <a
                key={g.questionId}
                href={`#rq${g.number}`}
                aria-label={gridAria(g.number, g.status)}
                onClick={(e) => {
                  e.preventDefault();
                  jumpTo(g.number);
                }}
                className={cx('flex h-[38px] items-center justify-center rounded-[9px] text-[13px] font-bold no-underline hover:text-inherit', GRID_STYLE[gridKind(g.status)])}
              >
                {gridMark(g.number, g.status)}
              </a>
            ))}
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px] text-ink-2">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-4 w-4 rounded-[5px] border border-correct bg-correct-bg" />
              Correct ({correctCount})
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-4 w-4 rounded-[5px] border border-incorrect bg-incorrect-bg" />
              Incorrect, marked ✕ ({data.counts.incorrect - partlyCount})
            </li>
            {partlyCount > 0 && (
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-4 w-4 rounded-[5px] border border-[#9A3412] bg-[#FFEDD5]" />
                Partly correct, marked ◐ ({partlyCount})
              </li>
            )}
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-4 w-4 rounded-[5px] border border-dashed border-muted bg-surface" />
              Unanswered, marked – ({data.counts.unanswered})
            </li>
          </ul>
        </aside>

        <main id="main-content" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 outline-none md:flex-[999_1_600px] md:gap-4 md:overflow-visible md:p-0">
          <Tabs tabs={tabs} filter={filter} onPick={pickTab} className="hidden flex-wrap md:flex" />
          {list.map((item, i) => (
            <QuestionCard key={item.id} item={item} shownOnPhone={i === phoneIndex} />
          ))}
        </main>
      </div>

      <nav aria-label="Review navigation" className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-3 pb-3.5 pt-2.5 md:hidden">
        <button
          type="button"
          aria-label="Previous"
          disabled={phoneIndex === 0}
          onClick={() => setPos(Math.max(0, phoneIndex - 1))}
          className="h-[52px] w-[52px] cursor-pointer rounded-control border border-input-border bg-surface text-xl text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true">←</span>
        </button>
        <span className="flex-1 text-center text-sm font-semibold text-ink-2" aria-live="polite">
          {list.length > 0 ? positionLabel(phoneIndex, list.length, filter) : ''}
        </span>
        <button
          type="button"
          aria-label="Next"
          disabled={phoneIndex >= list.length - 1}
          onClick={() => setPos(Math.min(list.length - 1, phoneIndex + 1))}
          className="h-[52px] w-[84px] cursor-pointer rounded-control border-0 bg-brand text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </nav>
    </div>
  );
}

function Tabs({ tabs, filter, onPick, className, phone }: { tabs: ReturnType<typeof tabsFor>; filter: ReviewFilter; onPick: (f: ReviewFilter) => void; className?: string; phone?: boolean }) {
  return (
    <div role="group" aria-label="Show" className={cx('flex gap-2', className)}>
      {tabs.map((t) => {
        const on = t.filter === filter;
        return (
          <button
            key={t.filter}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(t.filter)}
            className={cx(
              'shrink-0 cursor-pointer rounded-pill font-semibold',
              phone ? 'min-h-[40px] px-3.5 text-sm' : 'min-h-[44px] px-4 text-[15px]',
              on ? 'border border-ink bg-ink text-white' : 'border border-zinc-300 bg-surface text-ink',
            )}
          >
            {phone ? t.short : t.label}
          </button>
        );
      })}
    </div>
  );
}

function PartlyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </svg>
  );
}

function CheckBox({ on, small }: { on: boolean; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md border-2 text-white',
        small ? 'h-[22px] w-[22px]' : 'h-[22px] w-[22px]',
        on ? 'border-ink bg-ink' : 'border-zinc-400 bg-surface',
      )}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: on ? 1 : 0 }}>
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function QuestionCard({ item, shownOnPhone }: { item: ReviewItem; shownOnPhone: boolean }) {
  const kind = gridKind(item.status);
  const badge = BADGE[kind];
  const multi = item.multiple;
  const choose = chooseCount(item);
  return (
    <article
      id={`rq${item.number}`}
      className={cx(
        'scroll-mt-4 flex-col gap-3 md:flex md:gap-3.5 md:rounded-card-lg md:border md:border-border md:bg-surface md:p-6',
        shownOnPhone ? 'flex' : 'hidden',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
        <h2 className="m-0 text-base font-extrabold">Question {item.number}</h2>
        <span className={cx('inline-flex items-center gap-1.5 rounded-pill px-[9px] py-[3px] text-xs font-bold md:px-2.5 md:text-[13px]', badge.cls)}>
          {kind === 'partial' && <PartlyIcon />}
          {badge.label}
        </span>
        {multi && <span className="text-[13px] font-semibold text-muted">{marksOfLabel(item.marksAwarded, item.marks)}</span>}
        {item.flagged && <span className="rounded-pill bg-flagged-bg px-[9px] py-[3px] text-xs font-bold text-flagged-ink md:px-2.5 md:text-[13px]">Flagged</span>}
        {!multi && <span className="hidden text-sm text-muted md:ml-auto md:inline">{item.topic}</span>}
      </div>
      <span className={cx('text-[13px] font-semibold text-muted', !multi && 'md:hidden')}>
        {item.topic}
        {multi && choose > 0 && ` · Choose ${choose}`}
      </span>
      <p className="m-0 text-lg font-semibold leading-normal md:text-[19px]">
        {item.stem}
        {multi && choose > 0 && ` Choose ${choose}.`}
      </p>
      {multi ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {item.options.map((o) => {
            const k = optionKind(o);
            const note = multiOptionNote(o);
            return (
              <li
                key={o.key}
                className={cx(
                  'flex flex-col gap-1 rounded-[12px] px-3.5 py-3',
                  o.isCorrect ? 'border-2 border-correct bg-[#ECFDF5]' : k === 'wrongPick' ? 'border-2 border-incorrect bg-[#FEF2F2]' : 'border border-border bg-surface',
                )}
              >
                <span className="flex items-center gap-3">
                  <CheckBox on={o.isYourPick} />
                  <span className="w-[18px] font-bold text-ink-2">{o.key}</span>
                  <span className="text-base">{o.text}</span>
                </span>
                {note && <span className={cx('pl-[52px] text-[13px] font-bold', o.isCorrect ? 'text-free' : 'text-red-800')}>{note}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {item.options.map((o) => {
            const k = optionKind(o);
            return (
              <li
                key={o.key}
                className={cx(
                  'flex flex-col gap-1 rounded-[12px] p-3 md:flex-row md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2 md:px-3.5',
                  k === 'right' && 'border-2 border-correct bg-[#ECFDF5]',
                  k === 'wrongPick' && 'border-2 border-incorrect bg-[#FEF2F2]',
                  k === 'plain' && 'border border-border bg-surface',
                )}
              >
                <span className="flex items-center gap-2.5 md:contents">
                  <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-soft text-[13px] font-bold text-ink-2 md:h-7 md:w-7">{o.key}</span>
                  <span className="text-base md:flex-[1_1_200px]">{o.text}</span>
                </span>
                {k === 'right' && (
                  <span className="pl-9 text-[13px] font-bold text-free md:pl-0">
                    ✓ Correct answer
                    {o.isYourPick && <span className="md:hidden"> · your answer</span>}
                  </span>
                )}
                {k === 'wrongPick' && <span className="pl-9 text-[13px] font-bold text-red-800 md:pl-0">✕ Your answer</span>}
                {k === 'right' && o.isYourPick && <span className="hidden text-[13px] font-bold text-free md:inline">· Your answer</span>}
              </li>
            );
          })}
        </ul>
      )}
      {item.explanation && (
        <div className="flex flex-col gap-1 rounded-[12px] bg-brand-softer p-3.5 md:px-4">
          <span className="text-[13px] font-bold text-brand-hover md:text-sm">Explanation</span>
          <p className="m-0 text-[15px] leading-[1.6] text-[#27272A] md:text-base">{item.explanation}</p>
        </div>
      )}
    </article>
  );
}
