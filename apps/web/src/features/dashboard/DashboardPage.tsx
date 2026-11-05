import { useQuery } from '@tanstack/react-query';
import { BarChart3, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { attemptKeys, getDashboard } from '../../api/attempts';
import type { DashboardResponse } from '../../api/types';
import { ActionLink, buttonClasses } from '../../components/Button';
import { QueryError, SkeletonBar, SkeletonList } from '../../components/states';
import { cx } from '../../lib/cx';
import { formatDate } from '../../lib/format';
import { signInPath } from '../../lib/next';
import { ROUTES_READY } from '../../lib/routesReady';
import { CHOOSE_GOAL_PROMPT } from '../account/changeGoalModel';
import { Categories } from '../landing/LandingPage';
import { useLanding } from '../landing/queries';
import { useStartPractice } from '../practice/useStartPractice';
import { MyAccessCard } from './AccessPanel';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { formatClock } from '../exam/timer';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { useRemaining } from '../exam/useRemaining';
import { useIsDesktop } from '../../lib/useMediaQuery';
import {
  chartAria, chartPoints, DESKTOP_CHART, headline, longDate, PHONE_CHART, practiceLine, progressWidth, startHereLine, suggestedMeta, visibleSections,
  type ChartGeometry,
} from './dashboardModel';

const card = 'min-w-0 rounded-card border border-border bg-surface p-4 md:rounded-card-lg md:p-6 dark:border-night-border dark:bg-night-surface';

/** Dashboard / My progress (Dashboard.dc, DashboardPhone.dc). Needs an account: guests are sent to sign-up. */
export function DashboardPage() {
  useDocumentTitle('My progress');
  const slug = useActiveCountrySlug();
  const { user, isLoading } = useSession();
  const q = useQuery({ queryKey: attemptKeys.dashboard, queryFn: getDashboard, enabled: !!user, staleTime: 0, retry: false });

  if (!isLoading && !user) return <Navigate to={signInPath(countryPath(slug, 'progress'))} replace />;

  const body = q.isError ? (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
      <QueryError error={q.error} what="your progress" onRetry={() => void q.refetch()} retrying={q.isFetching} />
    </main>
  ) : !q.data ? (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-7">
      <div className="mb-5 flex flex-col gap-3" aria-hidden="true">
        <SkeletonBar className="h-8 w-1/2 bg-border" />
        <SkeletonBar className="h-4 w-2/3" />
      </div>
      <SkeletonList count={3} label="Loading your progress…" />
    </main>
  ) : (
    <DashboardView d={q.data} slug={slug} />
  );

  return <div className="flex flex-1 flex-col">{body}</div>;
}

/** The dashboard's own "Search job title, subject or exam" box (Main.dc's top card), wired the same way as the Mock tests catalog's search: it just navigates there with the query. */
function DashboardSearch({ slug }: { slug: string }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`${countryPath(slug, 'tests')}${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };
  return (
    <form role="search" onSubmit={submit} className="relative flex-1 md:max-w-[460px]">
      <label htmlFor="dashboard-q" className="sr-only">
        Search job title, subject or exam
      </label>
      <Search size={18} strokeWidth={2.2} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted dark:text-night-muted" />
      <input
        id="dashboard-q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search job title, subject or exam, e.g. Accountant"
        autoComplete="off"
        className="h-11 w-full rounded-control border border-input-border bg-surface pl-[42px] pr-3.5 text-[14px] text-ink placeholder:text-muted md:text-[14px] dark:border-night-border dark:bg-night-surface dark:text-night-ink"
      />
    </form>
  );
}

function GoalLine({ d }: { d: DashboardResponse }) {
  // No goal (a country switch clears it): the "Choose your goal" prompt (C15, built without a design).
  if (!d.goal) {
    return (
      <p className="m-0 text-[15px] text-ink-2 md:text-base">
        {CHOOSE_GOAL_PROMPT.text}{' '}
        <Link to="/account/goal" className="link font-semibold">
          {CHOOSE_GOAL_PROMPT.link}
        </Link>
      </p>
    );
  }
  return (
    <p className="m-0 text-[15px] text-ink-2 md:text-base">
      <span className="md:hidden">{d.hasActivity ? 'Goal: ' : 'Preparing for '}</span>
      <span className="hidden md:inline">Preparing for </span>
      <strong className="text-ink">{d.goal.name}</strong>
      <span className={d.hasActivity ? 'hidden md:inline' : 'inline'}>
        {' '}
        in <strong className="text-ink">{d.country.name}</strong>
      </span>{' '}
      ·{' '}
      <Link to="/account/goal" className="link">
        <span className={d.hasActivity ? 'md:hidden' : 'hidden'}>Change</span>
        <span className={d.hasActivity ? 'hidden md:inline' : 'inline'}>Change goal</span>
      </Link>
    </p>
  );
}

function PracticeButton({ start, label, busy }: { start: () => void; label: string; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className={buttonClasses({ variant: 'primary', className: 'cursor-pointer px-5 md:self-start md:text-[15px]' })}
    >
      {label}
    </button>
  );
}

function DashboardView({ d, slug }: { d: DashboardResponse; slug: string }) {
  const show = visibleSections(d);
  const practice = useStartPractice(slug);
  const desktop = useIsDesktop();
  const landing = useLanding(slug);
  const fresh = !d.hasActivity;
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-3.5 px-4 pb-6 pt-[18px] outline-none md:gap-5 md:px-6 md:pb-16 md:pt-7">
      <div className={cx(card, 'flex flex-col gap-3')}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5 md:gap-1">
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] text-heading md:text-2xl dark:text-night-heading">{headline(d)}</h1>
            <GoalLine d={d} />
          </div>
          {!fresh && (
            <Link
              to={countryPath(slug, 'tests')}
              className="hidden rounded-control border border-input-border bg-surface px-4 py-[11px] text-[15px] font-semibold text-ink no-underline hover:bg-soft hover:text-ink md:inline-block dark:border-night-border dark:bg-night-surface dark:text-night-ink"
            >
              Browse mock tests
            </Link>
          )}
        </div>
        <DashboardSearch slug={slug} />
      </div>

      {practice.error && (
        <p role="alert" className="m-0 rounded-control border border-incorrect-line bg-incorrect-bg p-3 text-sm font-semibold text-incorrect">
          {practice.error}
        </p>
      )}

      {landing.data && <Categories slug={slug} data={landing.data} />}

      {fresh ? (
        <FreshView d={d} slug={slug} />
      ) : (
        <>
          {(show.resume || show.recommended) && (
            <div className="flex flex-wrap gap-3.5 md:gap-4">
              {d.resume && <ResumeCard resume={d.resume} slug={slug} />}
              {d.recommended && (
                <section aria-labelledby="rec" className="flex min-w-0 flex-[1_1_360px] flex-col gap-2 rounded-card border-2 border-brand bg-surface p-[17px] md:gap-3 md:rounded-card-lg md:p-[23px]">
                  <h2 id="rec" className="m-0 text-[13px] font-semibold text-brand md:text-sm">
                    Recommended next
                  </h2>
                  <p className="m-0 text-lg font-semibold leading-snug md:text-xl md:font-bold md:leading-[1.35]">
                    {d.recommended.topicName} practice<span className="hidden md:inline"> set</span>
                  </p>
                  <p className="m-0 text-sm text-ink-2 md:text-[15px]">{practiceLine(d.recommended, desktop)}</p>
                  <PracticeButton start={() => practice.startTopic(d.recommended!.topicId)} label="Start practice" busy={practice.pending} />
                </section>
              )}
            </div>
          )}

          {(show.history || show.topics) && (
            <div className="flex flex-wrap items-start gap-3.5 md:gap-4">
              {show.history && <HistoryCard d={d} />}
              {show.topics && <TopicsCard d={d} onPractise={practice.startTopic} />}
            </div>
          )}

          <div className="flex flex-wrap items-start gap-3.5 md:gap-4">
            {show.recent && <RecentCard d={d} slug={slug} />}
            <MyAccessCard d={d} slug={slug} className="flex-[1_1_320px] md:rounded-card-lg md:p-6" />
          </div>
        </>
      )}
    </main>
  );
}

/**
 * A user with no finished test (DashboardNew.dc, DashboardNewPhone.dc): Start here, empty history, more tests for the
 * goal, My access. Desktop puts My access in the right column; the phone shows it right after Start here.
 */
function FreshView({ d, slug }: { d: DashboardResponse; slug: string }) {
  const desktop = useIsDesktop();
  const start = d.startHere;
  const resume = d.resume && <ResumeCard resume={d.resume} slug={slug} className="flex-none" />;
  const startCard = start && (
    <section aria-labelledby="st-t" className="flex flex-col gap-2.5 rounded-card-lg border-2 border-brand bg-surface p-[21px] dark:bg-night-surface">
      <h2 id="st-t" className="m-0 text-sm font-bold text-brand dark:text-night-brand">
        Start here
      </h2>
      <p className="m-0 text-xl font-bold leading-[1.3] text-heading dark:text-night-heading">{start.title}</p>
      <p className="m-0 text-[15px] text-ink-2 dark:text-night-ink">
        {startHereLine(start)}. Take it once to see where you stand — we’ll point you to your weakest topics afterwards.
      </p>
      <Link to={countryPath(slug, 'tests', start.slug)} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'md:self-start' })}>
        Start free mock test
      </Link>
    </section>
  );
  const history = (
    <section aria-labelledby="sh-t" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 dark:border-night-border dark:bg-night-surface">
      <h2 id="sh-t" className="m-0 text-base font-bold text-heading dark:text-night-heading">
        Score history
      </h2>
      <div className="flex flex-col items-center gap-1.5 rounded-control border border-dashed border-input-border px-4 py-7 text-center dark:border-night-border">
        <BarChart3 size={32} strokeWidth={1.8} aria-hidden="true" className="text-muted dark:text-night-muted" />
        <p className="m-0 text-base font-semibold text-heading dark:text-night-heading">No scores yet</p>
        <p className="m-0 text-sm text-ink-2 dark:text-night-ink">Your scores and strongest and weakest topics will appear here after your first mock test.</p>
      </div>
    </section>
  );
  const more = d.suggestedTests.length > 0 && (
    <section aria-labelledby="sg-t" className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-5 dark:border-night-border dark:bg-night-surface">
      <h2 id="sg-t" className="m-0 text-base font-bold text-heading dark:text-night-heading">
        More for your goal
      </h2>
      {desktop ? (
        <div className="overflow-hidden rounded-tables border border-border dark:border-night-border">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-page text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted dark:border-night-border dark:bg-night-soft dark:text-night-muted">
                <th scope="col" className="px-4 py-2.5">Mock test</th>
                <th scope="col" className="px-4 py-2.5">Questions</th>
                <th scope="col" className="px-4 py-2.5">Time</th>
                <th scope="col" className="px-4 py-2.5">Access</th>
                <th scope="col" className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {d.suggestedTests.map((t) => (
                <tr key={t.slug} className="border-b border-soft last:border-b-0 dark:border-night-border">
                  <th scope="row" className="px-4 py-3 text-left text-[15px] font-semibold text-heading dark:text-night-heading">{t.title}</th>
                  <td className="px-4 py-3 text-ink-2 dark:text-night-ink">{t.questionCount}</td>
                  <td className="px-4 py-3 text-ink-2 dark:text-night-ink">{t.durationMinutes} min</td>
                  <td className="px-4 py-3">
                    <span className={cx('whitespace-nowrap rounded-pill px-[9px] py-[3px] text-xs font-semibold', t.isFree ? 'bg-free-bg text-free' : 'bg-brand-soft text-brand')}>
                      {t.isFree ? 'Free' : 'Full Access'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={countryPath(slug, 'tests', t.slug)} className="font-semibold text-link no-underline hover:text-link-hover">
                      View test
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {d.suggestedTests.map((t) => (
            <li key={t.slug}>
              <Link to={countryPath(slug, 'tests', t.slug)} className="flex items-center justify-between gap-2.5 border-t border-soft py-3 text-ink no-underline hover:text-ink">
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold">{t.title}</span>
                  <span className="text-[13px] text-muted">{suggestedMeta(t)}</span>
                </span>
                <span className={cx('whitespace-nowrap rounded-pill px-[9px] py-[3px] text-xs font-semibold', t.isFree ? 'bg-free-bg text-free' : 'bg-brand-soft text-brand')}>
                  {t.isFree ? 'Free' : 'Full Access'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  const access = <MyAccessCard d={d} slug={slug} />;

  if (!desktop) {
    return (
      <div className="flex flex-col gap-3.5">
        {resume}
        {startCard}
        {access}
        {history}
        {more}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-[18px]">
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px]">
        {resume}
        {startCard}
        {history}
        {more}
      </div>
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-[18px]">{access}</div>
    </div>
  );
}

function ResumeCard({ resume, slug, className }: { resume: NonNullable<DashboardResponse['resume']>; slug: string; className?: string }) {
  const left = useRemaining(resume.remainingSeconds);
  return (
    <section aria-labelledby="cont" className={cx('flex min-w-0 flex-[1_1_360px] flex-col gap-2.5 rounded-card bg-dark p-[18px] text-white md:gap-3 md:rounded-card-lg md:p-6', className)}>
      <h2 id="cont" className="m-0 text-[13px] font-semibold text-on-dark md:text-sm">
        Continue where you stopped
      </h2>
      <p className="m-0 text-lg font-semibold md:text-xl md:font-bold md:leading-[1.35]">{resume.mockTest.title}</p>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-ink md:h-2">
        <div className="h-full bg-brand-ring" style={{ width: `${progressWidth(resume.answered, resume.total)}%` }} />
      </div>
      <p className="m-0 text-sm text-on-dark md:text-[15px]">
        {resume.answered} of {resume.total} answered · {formatClock(left)} left<span className="hidden md:inline"> on the timer</span>
      </p>
      <ActionLink
        ready={ROUTES_READY.resume}
        to={countryPath(slug, 'tests', resume.mockTest.slug, 'start')}
        variant="plain"
        className="!bg-surface !text-ink hover:!bg-surface px-5 text-base md:self-start md:text-[15px]"
      >
        Resume test
      </ActionLink>
    </section>
  );
}

function ScoreChart({ d, geometry }: { d: DashboardResponse; geometry: ChartGeometry }) {
  const hist = d.scoreHistory.filter((h) => h.percent !== null);
  const points = chartPoints(hist.map((h) => ({ percent: h.percent, label: formatDate(h.submittedAt) })), geometry);
  const desktop = geometry.width === DESKTOP_CHART.width;
  const labelSize = desktop ? 14 : 13;
  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      role="img"
      aria-label={chartAria(points, hist.map((h) => longDate(h.submittedAt)))}
      className="h-auto w-full"
    >
      {desktop &&
        geometry.gridLines.map((g) => (
          <g key={g.percent}>
            <line x1="40" y1={g.y} x2="580" y2={g.y} stroke="#EEF1F5" />
            <text x="30" y={g.y + 4} textAnchor="end" fontSize="12" fill="#5E6573">
              {g.percent}%
            </text>
          </g>
        ))}
      <line x1={desktop ? 40 : 10} y1={geometry.baseline} x2={desktop ? 580 : 330} y2={geometry.baseline} stroke="#DCE2EB" />
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#164A7A" strokeWidth="3" strokeLinejoin="round" />
      {points.map((p, i) => {
        const last = i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={last ? (desktop ? 7 : 6) : desktop ? 6 : 5} fill="#164A7A" stroke={last ? '#FFFFFF' : undefined} strokeWidth={last ? 2 : undefined} />
            <text x={p.x} y={p.y - 14} textAnchor="middle" fontSize={labelSize} fontWeight="700" fill="#3A3F4A">
              {p.percent}%
            </text>
            <text x={p.x} y={geometry.dateY} textAnchor="middle" fontSize="12" fill="#5E6573">
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function HistoryCard({ d }: { d: DashboardResponse }) {
  const desktop = useIsDesktop();
  return (
    <section aria-labelledby="hist" className={cx(card, 'flex flex-col gap-2 flex-[999_1_520px] md:gap-3.5')}>
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 id="hist" className="m-0 text-base font-bold text-heading dark:text-night-heading">
          Score history
        </h2>
        <span className="hidden text-sm text-ink-2 md:inline">All mock tests</span>
      </div>
      <ScoreChart d={d} geometry={desktop ? DESKTOP_CHART : PHONE_CHART} />
    </section>
  );
}

function TopicsCard({ d, onPractise }: { d: DashboardResponse; onPractise: (topicId: string) => void }) {
  const { strong, needsWork } = d.topics;
  return (
    <section aria-labelledby="topics" className={cx(card, 'flex flex-col gap-1.5 flex-[1_1_320px] md:gap-3.5')}>
      <h2 id="topics" className="m-0 mb-1 text-base font-bold text-heading md:mb-0 dark:text-night-heading">
        Topics
      </h2>
      {strong.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase text-free md:text-[13px] md:normal-case">Strong</span>
          {strong.map((t) => (
            <div key={t.topicId} className="flex justify-between py-1 text-[15px] md:py-1.5">
              <span>{t.name}</span>
              <strong className="tabular">{t.percent}%</strong>
            </div>
          ))}
        </div>
      )}
      {needsWork.length > 0 && (
        <div className={cx('mt-1.5 flex flex-col gap-1.5 md:mt-0', strong.length > 0 && 'md:border-t md:border-border md:pt-3')}>
          <span className="text-xs font-semibold uppercase text-flagged-ink md:text-[13px] md:normal-case">Needs work</span>
          {needsWork.map((t) => (
            <div key={t.topicId} className="flex items-center justify-between gap-2.5 text-[15px] md:py-1">
              <span>
                {t.name} · <strong className="tabular">{t.percent}%</strong>
              </span>
              <button
                type="button"
                onClick={() => onPractise(t.topicId)}
                aria-label={`Practise ${t.name}`}
                className="min-h-[44px] cursor-pointer border-0 bg-transparent py-2.5 text-sm font-semibold text-link hover:text-link-hover md:py-2"
              >
                Practise
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentCard({ d, slug }: { d: DashboardResponse; slug: string }) {
  return (
    <section aria-labelledby="done" className={cx(card, 'flex flex-col gap-1 p-4 flex-[999_1_520px] md:gap-1.5')}>
      <h2 id="done" className="m-0 mb-1.5 text-base font-bold text-heading md:mb-2 dark:text-night-heading">
        Recently completed
      </h2>
      {d.recentlyCompleted.map((r) => (
        <Link
          key={r.attemptId}
          to={countryPath(slug, 'results', r.attemptId)}
          className="flex flex-wrap items-center justify-between gap-2 border-t border-soft py-3 text-ink no-underline hover:text-ink md:border-border md:py-3.5"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold md:text-base">{r.title}</span>
            <span className="text-[13px] text-muted md:text-sm">
              <span className="md:hidden">{formatDate(r.submittedAt)}</span>
              <span className="hidden md:inline">{formatDate(r.submittedAt, true)}</span>
              {r.attemptNumber ? ` · attempt ${r.attemptNumber}` : ''}
            </span>
          </span>
          <span className="text-base font-semibold tabular md:text-[17px]">{r.percent === null ? '–' : `${Math.round(r.percent)}%`}</span>
        </Link>
      ))}
    </section>
  );
}
