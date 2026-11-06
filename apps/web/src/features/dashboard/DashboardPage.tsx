import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Layers, LifeBuoy, Play, Search, Target, TrendingUp, type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { attemptKeys, getDashboard } from '../../api/attempts';
import type { Category, DashboardResponse } from '../../api/types';
import { AccessBadge } from '../../components/Badge';
import { ActionLink, buttonClasses } from '../../components/Button';
import { CategoryIcon } from '../../components/CategoryIcon';
import { QueryError, Loader } from '../../components/states';
import { cx } from '../../lib/cx';
import { formatDate, plural } from '../../lib/format';
import { signInPath } from '../../lib/next';
import { ROUTES_READY } from '../../lib/routesReady';
import { CHOOSE_GOAL_PROMPT } from '../account/changeGoalModel';
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
  chartAria, chartPoints, DESKTOP_CHART, headline, heroStats, longDate, PHONE_CHART, practiceLine, progressWidth, startHereLine, suggestedMeta, visibleSections,
  type ChartGeometry, type HeroStat, type HeroStatIcon,
} from './dashboardModel';

const card = 'min-w-0 rounded-card border border-border bg-surface p-3.5 md:rounded-card-lg md:p-4 dark:border-night-border dark:bg-night-surface';
/** Shorter buttons inside the dashboard's compact rows (desktop only; the phone keeps its touch size). */
const shortBtn = 'md:!min-h-[36px] md:!px-4 md:!text-sm';

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
      <Loader label="Loading your progress…" />
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
    <form role="search" onSubmit={submit} className="relative min-w-0 flex-1 lg:max-w-[460px]">
      <label htmlFor="dashboard-q" className="sr-only">
        Search job title, subject or exam
      </label>
      <Search size={16} strokeWidth={2.2} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted dark:text-night-muted" />
      <input
        id="dashboard-q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search job title, subject or exam, e.g. Accountant"
        autoComplete="off"
        className="h-11 w-full rounded-control border border-input-border bg-surface pl-9 pr-3 text-[14px] text-ink placeholder:text-muted md:h-9 dark:border-night-border dark:bg-night-surface dark:text-night-ink"
      />
    </form>
  );
}

const HERO_ICON: Record<HeroStatIcon, { Icon: LucideIcon; iconBg: string; iconFg: string }> = {
  tests: { Icon: ClipboardList, iconBg: 'bg-brand-soft dark:bg-night-brand-soft', iconFg: 'text-brand dark:text-night-brand' },
  completed: { Icon: CheckCircle2, iconBg: 'bg-free-bg', iconFg: 'text-free' },
  progress: { Icon: TrendingUp, iconBg: 'bg-flagged-bg', iconFg: 'text-flagged-ink' },
  goal: { Icon: CalendarClock, iconBg: 'bg-soft dark:bg-night-soft', iconFg: 'text-ink-2 dark:text-night-ink' },
};

/** The hero's 4-tile stat row — every value comes from `heroStats(d, …)`, never a placeholder. */
function HeroStatRow({ tiles }: { tiles: HeroStat[] }) {
  return (
    <div className="flex flex-wrap gap-2.5 md:gap-3">
      {tiles.map((t) => {
        const { Icon, iconBg, iconFg } = HERO_ICON[t.icon];
        return (
          <div key={t.label} className="flex min-w-0 flex-[1_1_150px] items-center gap-2.5 rounded-card border border-border bg-surface p-2.5 md:flex-[1_1_200px] md:px-3.5 dark:border-night-border dark:bg-night-surface">
            <span className={cx('flex h-9 w-9 flex-none items-center justify-center rounded-control', iconBg, iconFg)}>
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            {t.icon === 'goal' ? (
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-medium text-muted dark:text-night-muted">{t.label}</span>
                <strong className="line-clamp-2 text-sm font-bold leading-tight text-heading dark:text-night-heading">{t.value}</strong>
              </span>
            ) : (
              <span className="flex min-w-0 flex-col">
                <strong className="text-lg font-extrabold leading-tight text-heading dark:text-night-heading">{t.value}</strong>
                <span className="text-xs font-medium text-muted dark:text-night-muted">{t.label}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Decorative hero illustration: books, a laptop showing a marked test, and a graduation cap. Desktop only. */
function HeroArt() {
  return (
    <svg width="104" height="66" viewBox="0 0 260 164" aria-hidden="true" focusable="false" className="hidden flex-none self-center lg:block">
      <rect x="8" y="132" width="112" height="22" rx="11" fill="#FBE9C8" stroke="#164A7A" strokeWidth="4" />
      <rect x="22" y="110" width="94" height="22" rx="11" fill="#FFFFFF" stroke="#164A7A" strokeWidth="4" />
      <rect x="70" y="42" width="150" height="104" rx="10" fill="#FFFFFF" stroke="#164A7A" strokeWidth="6" />
      <rect x="56" y="146" width="178" height="8" rx="4" fill="#164A7A" />
      <circle cx="96" cy="72" r="10" fill="#2D62CF" />
      <path d="M91 72l4 4 6-7" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="116" y="62" width="82" height="7" rx="3.5" fill="#DCEBFA" />
      <rect x="116" y="75" width="56" height="7" rx="3.5" fill="#DCEBFA" />
      <circle cx="96" cy="112" r="10" fill="#2D62CF" />
      <path d="M91 112l4 4 6-7" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="116" y="102" width="82" height="7" rx="3.5" fill="#DCEBFA" />
      <rect x="116" y="115" width="56" height="7" rx="3.5" fill="#DCEBFA" />
      <path d="M186 40v22c0 7 14 12 30 12s30-5 30-12V40" fill="#1E4BA8" />
      <path d="M216 8l44 22-44 22-44-22z" fill="#164A7A" />
      <path d="M216 30l32 8v30" fill="none" stroke="#E3A008" strokeWidth="4" strokeLinecap="round" />
      <path d="M243 68h10l3 22h-16z" fill="#E3A008" />
    </svg>
  );
}

/** One line of the "Continue learning" card: icon, what it is, optional progress, and the action. */
function LearnRow({ icon: Icon, eyebrow, title, meta, progress, action }: { icon: LucideIcon; eyebrow: string; title: string; meta: string; progress?: number; action: ReactNode }) {
  return (
    <section aria-label={eyebrow} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-border px-3 py-2.5 dark:border-night-border">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-control bg-brand text-white">
        <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col">
        <span className="text-xs font-semibold text-brand dark:text-night-brand">{eyebrow}</span>
        <p className="m-0 text-[15px] font-bold leading-snug text-heading dark:text-night-heading">{title}</p>
        <p className="m-0 text-[13px] leading-snug text-ink-2 dark:text-night-ink">{meta}</p>
        {progress !== undefined && (
          <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-pill bg-soft dark:bg-night-soft">
            <div className="h-full rounded-pill bg-brand dark:bg-night-brand" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className="w-full flex-none md:w-auto">{action}</div>
    </section>
  );
}

function ResumeRow({ resume, slug }: { resume: NonNullable<DashboardResponse['resume']>; slug: string }) {
  const left = useRemaining(resume.remainingSeconds);
  return (
    <LearnRow
      icon={ClipboardList}
      eyebrow="Continue where you stopped"
      title={resume.mockTest.title}
      meta={`${resume.answered} of ${resume.total} answered · ${formatClock(left)} left on the timer`}
      progress={progressWidth(resume.answered, resume.total)}
      action={
        <ActionLink ready={ROUTES_READY.resume} to={countryPath(slug, 'tests', resume.mockTest.slug, 'start')} variant="primary" block className={shortBtn}>
          Resume test
        </ActionLink>
      }
    />
  );
}

/** The next thing to do: the test in progress, else the first test to take, then the weakest-topic practice set. */
function ContinueCard({ d, slug, practice }: { d: DashboardResponse; slug: string; practice: ReturnType<typeof useStartPractice> }) {
  const desktop = useIsDesktop();
  const start = !d.resume ? d.startHere : null;
  return (
    <section aria-labelledby="learn" className={cx(card, 'flex flex-[999_1_480px] flex-col gap-2')}>
      <h2 id="learn" className="m-0 text-base font-bold text-heading dark:text-night-heading">
        Continue learning
      </h2>
      {d.resume && <ResumeRow resume={d.resume} slug={slug} />}
      {start && (
        <LearnRow
          icon={ClipboardList}
          eyebrow="Start here"
          title={start.title}
          meta={`${startHereLine(start)}. Take it once to see where you stand — we’ll point you to your weakest topics afterwards.`}
          action={
            <Link to={countryPath(slug, 'tests', start.slug)} className={buttonClasses({ variant: 'primary', block: true, className: shortBtn })}>
              Start free mock test
            </Link>
          }
        />
      )}
      {d.recommended && (
        <LearnRow
          icon={Target}
          eyebrow="Recommended next"
          title={`${d.recommended.topicName} practice set`}
          meta={practiceLine(d.recommended, desktop)}
          action={
            <button type="button" onClick={() => practice.startTopic(d.recommended!.topicId)} disabled={practice.pending} className={buttonClasses({ variant: 'primary', block: true, className: `cursor-pointer ${shortBtn}` })}>
              Start practice
            </button>
          }
        />
      )}
      {!d.resume && !start && !d.recommended && (
        <LearnRow
          icon={ClipboardList}
          eyebrow="Keep going"
          title="Pick your next mock test"
          meta="Every attempt shows you which topics to work on next."
          action={
            <Link to={countryPath(slug, 'tests')} className={buttonClasses({ variant: 'primary', block: true, className: shortBtn })}>
              Browse mock tests
            </Link>
          }
        />
      )}
    </section>
  );
}

const quickRow = 'flex w-full min-h-[44px] cursor-pointer items-center gap-2.5 rounded-control border border-input-border bg-surface px-3 py-1 text-left text-ink no-underline md:min-h-[36px] hover:bg-soft hover:text-ink dark:border-night-border dark:bg-night-surface dark:text-night-ink dark:hover:bg-night-soft';

function QuickRowBody({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon size={16} strokeWidth={2} aria-hidden="true" className="flex-none text-brand dark:text-night-brand" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" className="flex-none text-muted dark:text-night-muted" />
    </>
  );
}

/** Shortcuts. "Practise weakest topic" only appears when there is a real weakest topic to practise. */
function QuickActionsCard({ d, slug, practice }: { d: DashboardResponse; slug: string; practice: ReturnType<typeof useStartPractice> }) {
  return (
    <section aria-labelledby="qa" className={cx(card, 'flex flex-[1_1_280px] flex-col gap-1.5')}>
      <h2 id="qa" className="m-0 mb-0.5 text-base font-bold text-heading dark:text-night-heading">
        Quick actions
      </h2>
      <Link to={countryPath(slug, 'tests')} className={quickRow}>
        <QuickRowBody icon={Play} label="Browse all mock tests" />
      </Link>
      {d.recommended && (
        <button type="button" onClick={() => practice.startTopic(d.recommended!.topicId)} disabled={practice.pending} className={cx(quickRow, 'disabled:opacity-60')}>
          <QuickRowBody icon={Layers} label="Practise weakest topic" />
        </button>
      )}
      <Link to="/account/goal" className={quickRow}>
        <QuickRowBody icon={Target} label={d.goal ? 'Change my goal' : 'Choose my goal'} />
      </Link>
      {!d.recommended && (
        <Link to="/help" className={quickRow}>
          <QuickRowBody icon={LifeBuoy} label="Help and support" />
        </Link>
      )}
    </section>
  );
}

const CATEGORY_TINTS = [
  'bg-brand-soft text-brand dark:bg-night-brand-soft dark:text-night-brand',
  'bg-soft text-ink-2 dark:bg-night-soft dark:text-night-ink',
  'bg-free-bg text-free',
  'bg-flagged-bg text-flagged-ink',
];

/** The dashboard's own compact category tiles, full width. The landing page keeps its larger list. */
function DashboardCategories({ slug, categories }: { slug: string; categories: Category[] }) {
  return (
    <section aria-labelledby="cats" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="cats" className="m-0 text-base font-bold text-heading dark:text-night-heading">
          Browse by job category
        </h2>
        <Link to={countryPath(slug, 'tests')} className="link text-[13px] font-semibold no-underline">
          See all mock tests
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        {categories.map((c, i) => (
          <Link
            key={c.id}
            to={`${countryPath(slug, 'tests')}?category=${encodeURIComponent(c.slug)}`}
            className={cx(
              'flex min-w-0 items-center gap-2.5 rounded-card border p-2.5 no-underline transition-shadow hover:shadow-search',
              c.featured
                ? 'border-brand bg-brand-softer dark:border-night-brand dark:bg-night-brand-soft'
                : 'border-border bg-surface dark:border-night-border dark:bg-night-surface',
            )}
          >
            <span className={cx('flex h-9 w-9 flex-none items-center justify-center rounded-control', c.featured ? 'bg-brand text-white' : CATEGORY_TINTS[i % CATEGORY_TINTS.length])}>
              <CategoryIcon name={c.icon} size={18} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-bold leading-tight text-heading dark:text-night-heading">{c.name}</span>
              <span className="text-xs text-ink-2 dark:text-night-muted">
                {plural(c.mockTestCount, 'mock test')}
                {c.featured && <span className="font-semibold text-brand dark:text-night-brand"> · Most practised</span>}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function GoalLine({ d }: { d: DashboardResponse }) {
  const strongCls = 'text-heading dark:text-night-heading';
  const bodyCls = 'text-sm text-ink-2 dark:text-night-ink';
  // No goal (a country switch clears it): the "Choose your goal" prompt (C15, built without a design).
  if (!d.goal) {
    return (
      <p className={cx('m-0', bodyCls)}>
        {CHOOSE_GOAL_PROMPT.text}{' '}
        <Link to="/account/goal" className="link font-semibold">
          {CHOOSE_GOAL_PROMPT.link}
        </Link>
      </p>
    );
  }
  return (
    <p className={cx('m-0', bodyCls)}>
      Preparing for <strong className={strongCls}>{d.goal.name}</strong> in <strong className={strongCls}>{d.country.name}</strong> ·{' '}
      <Link to="/account/goal" className="link">
        Change goal
      </Link>
    </p>
  );
}

function DashboardView({ d, slug }: { d: DashboardResponse; slug: string }) {
  const show = visibleSections(d);
  const practice = useStartPractice(slug);
  const landing = useLanding(slug);
  const fresh = !d.hasActivity;
  const mockTestsAvailable = d.goal && landing.data ? (landing.data.categories.find((c) => c.id === d.goal!.categoryId)?.mockTestCount ?? null) : null;
  const hero = heroStats(d, mockTestsAvailable);
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-3 px-4 pb-6 pt-3 outline-none md:px-6 md:pb-10">
      <div className="flex items-center justify-between gap-5 overflow-hidden rounded-card-lg bg-gradient-to-r from-brand-soft via-brand-light to-brand-ring/50 p-3.5 md:px-5 md:py-2 dark:from-night-brand-soft dark:via-night-soft dark:to-night-brand-soft">
        <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:gap-6">
          <div className="flex min-w-0 flex-col">
            <h1 className="m-0 text-xl font-extrabold tracking-[-0.02em] text-heading dark:text-night-heading">
              {headline(d)} <span aria-hidden="true">👋</span>
            </h1>
            <GoalLine d={d} />
          </div>
          <DashboardSearch slug={slug} />
        </div>
        <HeroArt />
      </div>

      <HeroStatRow tiles={hero} />

      {practice.error && (
        <p role="alert" className="m-0 rounded-control border border-incorrect-line bg-incorrect-bg p-3 text-sm font-semibold text-incorrect">
          {practice.error}
        </p>
      )}

      <div className="flex flex-wrap items-stretch gap-3">
        <ContinueCard d={d} slug={slug} practice={practice} />
        <QuickActionsCard d={d} slug={slug} practice={practice} />
      </div>

      {landing.data && <DashboardCategories slug={slug} categories={landing.data.categories} />}

      {fresh ? (
        <FreshView d={d} slug={slug} />
      ) : (
        <>
          {(show.history || show.topics) && (
            <div className="flex flex-wrap items-start gap-3">
              {show.history && <HistoryCard d={d} />}
              {show.topics && <TopicsCard d={d} onPractise={practice.startTopic} />}
            </div>
          )}

          <div className="flex flex-wrap items-start gap-3">
            {show.recent && <RecentCard d={d} slug={slug} />}
            <MyAccessCard d={d} slug={slug} className="flex-[1_1_320px] md:rounded-card-lg" />
          </div>
        </>
      )}
    </main>
  );
}

/**
 * A user with no finished test (DashboardNew.dc, DashboardNewPhone.dc): empty history, more tests for the goal,
 * My access. Desktop puts My access in the right column; the phone shows it first.
 */
function FreshView({ d, slug }: { d: DashboardResponse; slug: string }) {
  const desktop = useIsDesktop();
  const history = (
    <section aria-labelledby="sh-t" className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 dark:border-night-border dark:bg-night-surface">
      <h2 id="sh-t" className="m-0 text-base font-bold text-heading dark:text-night-heading">
        Score history
      </h2>
      <div className="flex flex-col items-center gap-0.5 rounded-control border border-dashed border-input-border px-4 py-3 text-center dark:border-night-border">
        <BarChart3 size={22} strokeWidth={1.8} aria-hidden="true" className="text-muted dark:text-night-muted" />
        <p className="m-0 text-sm font-semibold text-heading dark:text-night-heading">No scores yet</p>
        <p className="m-0 text-[13px] text-ink-2 dark:text-night-ink">Your scores and strongest and weakest topics will appear here after your first mock test.</p>
      </div>
    </section>
  );
  const more = d.suggestedTests.length > 0 && (
    <section aria-labelledby="sg-t" className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 dark:border-night-border dark:bg-night-surface">
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
                  <th scope="row" className="px-4 py-2 text-left text-sm font-semibold text-heading dark:text-night-heading">{t.title}</th>
                  <td className="px-4 py-2 text-ink-2 dark:text-night-ink">{t.questionCount}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-ink-2 dark:text-night-ink">{t.durationMinutes} min</td>
                  <td className="px-4 py-2">
                    <AccessBadge isFree={t.isFree} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
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
                <AccessBadge isFree={t.isFree} />
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
        {access}
        {history}
        {more}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
        {history}
        {more}
      </div>
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">{access}</div>
    </div>
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
      className="h-auto max-h-[190px] w-full"
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
          className="flex flex-wrap items-center justify-between gap-2 border-t border-soft py-2 text-ink no-underline hover:text-ink md:border-border"
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold">{r.title}</span>
            <span className="text-xs text-muted">
              <span className="md:hidden">{formatDate(r.submittedAt)}</span>
              <span className="hidden md:inline">{formatDate(r.submittedAt, true)}</span>
              {r.attemptNumber ? ` · attempt ${r.attemptNumber}` : ''}
            </span>
          </span>
          <span className="text-sm font-semibold tabular">{r.percent === null ? '–' : `${Math.round(r.percent)}%`}</span>
        </Link>
      ))}
    </section>
  );
}
