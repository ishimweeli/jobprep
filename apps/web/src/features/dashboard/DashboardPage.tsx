import { useQuery } from '@tanstack/react-query';
import { BarChart3, CreditCard, Search } from 'lucide-react';
import { Link, NavLink, Navigate } from 'react-router-dom';
import { attemptKeys, getDashboard } from '../../api/attempts';
import type { DashboardResponse } from '../../api/types';
import { ActionLink } from '../../components/Button';
import { PhoneBrandHeader } from '../../components/layout/Header';
import { QueryError, SkeletonBar, SkeletonList } from '../../components/states';
import { cx } from '../../lib/cx';
import { formatDate } from '../../lib/format';
import { signUpPath } from '../../lib/next';
import { ROUTES_READY } from '../../lib/routesReady';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { formatClock } from '../exam/timer';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { useRemaining } from '../exam/useRemaining';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { chartAria, chartPoints, DESKTOP_CHART, greeting, longDate, PHONE_CHART, progressWidth, visibleSections, type ChartGeometry } from './dashboardModel';

const card = 'min-w-0 rounded-card border border-border bg-surface p-4 md:rounded-card-lg md:p-6';

/** Dashboard / My progress (Dashboard.dc, DashboardPhone.dc). Needs an account: guests are sent to sign-up. */
export function DashboardPage() {
  useDocumentTitle('My progress');
  const slug = useActiveCountrySlug();
  const { user, isLoading } = useSession();
  const q = useQuery({ queryKey: attemptKeys.dashboard, queryFn: getDashboard, enabled: !!user, staleTime: 0, retry: false });

  if (!isLoading && !user) return <Navigate to={signUpPath(countryPath(slug, 'progress'))} replace />;

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

  return (
    <div className="flex flex-1 flex-col">
      <PhoneBrandHeader menu={false} nameOnly />
      {body}
      <PhoneTabBar slug={slug} />
    </div>
  );
}

/** Phone bottom tab bar (DashboardPhone.dc): Mock tests, My progress, Access. */
function PhoneTabBar({ slug }: { slug: string }) {
  const item = ({ isActive }: { isActive: boolean }) =>
    cx(
      'flex min-h-[52px] flex-col items-center gap-0.5 py-1.5 text-xs no-underline hover:text-inherit',
      isActive ? 'font-bold text-brand hover:text-brand' : 'font-semibold text-muted hover:text-muted',
    );
  return (
    <nav aria-label="Main" className="sticky bottom-0 z-30 mt-auto grid grid-cols-3 border-t border-border bg-surface px-1 pb-2.5 pt-1.5 md:hidden">
      <NavLink to={countryPath(slug, 'tests')} end className={item}>
        <Search size={22} aria-hidden="true" />
        Mock tests
      </NavLink>
      <NavLink to={countryPath(slug, 'progress')} className={item}>
        <BarChart3 size={22} strokeWidth={2.2} aria-hidden="true" />
        My progress
      </NavLink>
      <NavLink to={countryPath(slug, 'pricing')} className={item}>
        <CreditCard size={22} aria-hidden="true" />
        Access
      </NavLink>
    </nav>
  );
}

function DashboardView({ d, slug }: { d: DashboardResponse; slug: string }) {
  const show = visibleSections(d);
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-3.5 px-4 pb-6 pt-[18px] outline-none md:gap-[22px] md:px-6 md:pb-16 md:pt-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5 md:gap-1">
          <h1 className="m-0 text-[26px] tracking-tight md:text-[32px]">{greeting(d.country.code, d.user.firstName)}</h1>
          {d.goal && (
            <p className="m-0 text-[15px] text-ink-2 md:text-base">
              <span className="md:hidden">Goal: </span>
              <span className="hidden md:inline">Preparing for </span>
              <strong className="text-ink">{d.goal.name}</strong>
              <span className="hidden md:inline">
                {' '}
                in <strong className="text-ink">{d.country.name}</strong>
              </span>{' '}
              ·{' '}
              {/* "Change goal" has no designed screen (C15): drawn as in the artboard, inert. */}
              {ROUTES_READY.changeGoal ? null : (
                <span aria-disabled="true" className="link cursor-default">
                  <span className="md:hidden">Change</span>
                  <span className="hidden md:inline">Change goal</span>
                </span>
              )}
            </p>
          )}
        </div>
        <Link
          to={countryPath(slug, 'tests')}
          className="hidden rounded-control border border-input-border bg-surface px-4 py-[11px] text-[15px] font-semibold text-ink no-underline hover:bg-soft hover:text-ink md:inline-block"
        >
          Browse mock tests
        </Link>
      </div>

      {(show.resume || show.recommended) && (
        <div className="flex flex-wrap gap-3.5 md:gap-4">
          {d.resume && <ResumeCard resume={d.resume} slug={slug} />}
          {d.recommended && (
            <section aria-labelledby="rec" className="flex min-w-0 flex-[1_1_360px] flex-col gap-2 rounded-card border-2 border-brand bg-surface p-[17px] md:gap-3 md:rounded-card-lg md:p-[23px]">
              <h2 id="rec" className="m-0 text-[13px] font-semibold text-brand-hover md:text-sm">
                Recommended next
              </h2>
              <p className="m-0 text-lg font-bold leading-snug md:text-xl md:leading-[1.35]">
                {d.recommended.topicName} practice<span className="hidden md:inline"> set</span>
              </p>
              <p className="m-0 text-sm text-ink-2 md:text-[15px]">
                <span className="md:hidden">
                  Your weakest topic at {d.recommended.percent}% · {d.recommended.questionCount} questions · {d.recommended.minutes} min
                </span>
                <span className="hidden md:inline">
                  Your weakest topic at {d.recommended.percent}%. {d.recommended.questionCount} questions · {d.recommended.minutes} min, with explanations after each one.
                </span>
              </p>
              {/* The practice runner has no design (C1): the button is drawn and inert. */}
              <ActionLink ready={ROUTES_READY.practice} to="" variant="primary" className="rounded-control px-5 py-3.5 md:self-start md:py-3 md:text-[15px]">
                Start practice
              </ActionLink>
            </section>
          )}
        </div>
      )}

      {(show.history || show.topics) && (
        <div className="flex flex-wrap items-start gap-3.5 md:gap-4">
          {show.history && <HistoryCard d={d} />}
          {show.topics && <TopicsCard d={d} />}
        </div>
      )}

      {(show.recent || show.access) && (
        <div className="flex flex-wrap items-start gap-3.5 md:gap-4">
          {show.recent && <RecentCard d={d} slug={slug} />}
          {show.access && d.access.current && <AccessCard current={d.access.current} />}
        </div>
      )}
    </main>
  );
}

function ResumeCard({ resume, slug }: { resume: NonNullable<DashboardResponse['resume']>; slug: string }) {
  const left = useRemaining(resume.remainingSeconds);
  return (
    <section aria-labelledby="cont" className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5 rounded-card bg-ink p-[18px] text-white md:gap-3 md:rounded-card-lg md:p-6">
      <h2 id="cont" className="m-0 text-[13px] font-semibold text-zinc-300 md:text-sm">
        Continue where you stopped
      </h2>
      <p className="m-0 text-lg font-bold md:text-xl md:leading-[1.35]">{resume.mockTest.title}</p>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-ink-2 md:h-2">
        <div className="h-full bg-brand-ring" style={{ width: `${progressWidth(resume.answered, resume.total)}%` }} />
      </div>
      <p className="m-0 text-sm text-zinc-300 md:text-[15px]">
        {resume.answered} of {resume.total} answered · {formatClock(left)} left<span className="hidden md:inline"> on the timer</span>
      </p>
      <ActionLink
        ready={ROUTES_READY.resume}
        to={countryPath(slug, 'tests', resume.mockTest.slug, 'start')}
        variant="plain"
        className="!bg-surface !text-ink hover:!bg-surface rounded-control px-5 py-3.5 text-base md:self-start md:py-3 md:text-[15px]"
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
            <line x1="40" y1={g.y} x2="580" y2={g.y} stroke="#F4F4F5" />
            <text x="30" y={g.y + 4} textAnchor="end" fontSize="12" fill="#52525B">
              {g.percent}%
            </text>
          </g>
        ))}
      <line x1={desktop ? 40 : 10} y1={geometry.baseline} x2={desktop ? 580 : 330} y2={geometry.baseline} stroke="#D4D4D8" />
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#6D28D9" strokeWidth="3" strokeLinejoin="round" />
      {points.map((p, i) => {
        const last = i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={last ? (desktop ? 7 : 6) : desktop ? 6 : 5} fill="#6D28D9" stroke={last ? '#FFFFFF' : undefined} strokeWidth={last ? 2 : undefined} />
            <text x={p.x} y={p.y - 14} textAnchor="middle" fontSize={labelSize} fontWeight="700" fill="#18181B">
              {p.percent}%
            </text>
            <text x={p.x} y={geometry.dateY} textAnchor="middle" fontSize="12" fill="#52525B">
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
        <h2 id="hist" className="m-0 text-[17px] md:text-xl">
          Score history
        </h2>
        <span className="hidden text-sm text-ink-2 md:inline">All mock tests</span>
      </div>
      <ScoreChart d={d} geometry={desktop ? DESKTOP_CHART : PHONE_CHART} />
    </section>
  );
}

function TopicsCard({ d }: { d: DashboardResponse }) {
  const { strong, needsWork } = d.topics;
  return (
    <section aria-labelledby="topics" className={cx(card, 'flex flex-col gap-1.5 flex-[1_1_320px] md:gap-3.5')}>
      <h2 id="topics" className="m-0 mb-1 text-[17px] md:mb-0 md:text-xl">
        Topics
      </h2>
      {strong.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase text-free md:text-[13px] md:normal-case">Strong</span>
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
          <span className="text-xs font-bold uppercase text-flagged-ink md:text-[13px] md:normal-case">Needs work</span>
          {needsWork.map((t) => (
            <div key={t.topicId} className="flex items-center justify-between gap-2.5 text-[15px] md:py-1">
              <span>
                {t.name} · <strong className="tabular">{t.percent}%</strong>
              </span>
              {/* "Practise" opens the practice runner, which has no design (C1): drawn, inert. */}
              <span aria-disabled="true" role="link" className="cursor-default py-2.5 text-sm font-semibold text-brand md:py-2">
                Practise
              </span>
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
      <h2 id="done" className="m-0 mb-1.5 text-[17px] md:mb-2 md:text-xl">
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
          <span className="text-base font-extrabold tabular md:text-[17px]">{r.percent === null ? '–' : `${Math.round(r.percent)}%`}</span>
        </Link>
      ))}
    </section>
  );
}

function AccessCard({ current }: { current: { endsAt: string; daysLeft: number } }) {
  return (
    <section aria-labelledby="pk" className={cx(card, 'flex flex-col gap-2.5 flex-[1_1_320px] md:gap-3')}>
      <h2 id="pk" className="m-0 text-[17px] md:text-xl">
        My access
      </h2>
      <div className="flex items-center justify-between gap-2 md:flex-col md:items-stretch md:gap-1 md:rounded-[14px] md:border md:border-border md:p-3.5">
        <div className="flex flex-col md:contents">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold md:font-bold">Full Access · all mock tests</span>
            <span className="hidden rounded-pill bg-free-bg px-[9px] py-[3px] text-xs font-bold text-free md:inline">Active</span>
          </div>
          <span className="text-[13px] text-muted md:text-sm md:text-ink-2">
            {current.daysLeft} {current.daysLeft === 1 ? 'day' : 'days'} left · until <span className="md:hidden">{formatDate(current.endsAt)}</span>
            <span className="hidden md:inline">{formatDate(current.endsAt, true)}</span>
          </span>
        </div>
        <span className="rounded-pill bg-free-bg px-[9px] py-[3px] text-xs font-bold text-free md:hidden">Active</span>
      </div>
    </section>
  );
}
