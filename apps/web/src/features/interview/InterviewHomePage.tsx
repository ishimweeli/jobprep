import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Mic, Plus, Sparkles, Target, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { catalogKeys, getPricing } from '../../api/catalog';
import { getOverview, interviewKeys, type InterviewOverview, type SessionSummary } from '../../api/interviews';
import { buttonClasses } from '../../components/Button';
import { Loader, QueryError } from '../../components/states';
import { cx } from '../../lib/cx';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { card, heading, InterviewGate, InterviewPage, muted } from './InterviewGate';
import { balanceCaption, durationLabel, MODE_LABEL, scoreTone, signedPercent, statusLabel, usedPercent } from './interviewModel';

/** Interview Preparation home: the minute balance, progress, a new interview, past interviews and the improvement plan. */
export function InterviewHomePage() {
  useDocumentTitle('Interview preparation');
  return (
    <InterviewGate>
      <Home />
    </InterviewGate>
  );
}

function Home() {
  const slug = useActiveCountrySlug();
  const q = useQuery({ queryKey: interviewKeys.overview, queryFn: getOverview, staleTime: 0 });
  if (q.isError) return <InterviewPage><QueryError error={q.error} what="your interviews" onRetry={() => void q.refetch()} retrying={q.isFetching} /></InterviewPage>;
  if (!q.data) return <InterviewPage><Loader label="Loading your interviews…" /></InterviewPage>;
  const o = q.data;
  return (
    <InterviewPage wide>
      <header className="flex flex-col gap-1">
        <h1 className={cx('m-0 text-[26px] font-bold tracking-tight md:text-[30px]', heading)}>Interview preparation</h1>
        <p className={cx('m-0 text-[15px]', muted)}>Practise with your personal AI interviewer, then get feedback on every answer.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Balance o={o} slug={slug} />
        <Stats o={o} />
      </div>

      {!o.wallet.hasPackage && <Offer slug={slug} />}

      {o.improvementPlan && o.improvementPlan.items.length > 0 && (
        <section className={card} aria-labelledby="plan-h">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="plan-h" className={cx('m-0 flex items-center gap-2 text-lg font-bold', heading)}>
              <Target size={18} aria-hidden="true" className="text-brand" /> Your improvement plan
            </h2>
            <Link to={countryPath(slug, 'interview', 'sessions', o.improvementPlan.sessionId)} className="text-sm font-semibold">
              From your {o.improvementPlan.jobTitle} interview
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {o.improvementPlan.items.map((p) => (
              <li key={p.topic} className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{p.topic}</span>
                  <span className={cx('text-[13px]', muted)}>
                    Priority: {p.priority === 'high' ? 'High' : p.priority === 'medium' ? 'Medium' : 'Low'} · {p.practiceQuestions} practice question{p.practiceQuestions === 1 ? '' : 's'}
                  </span>
                </span>
                <ScorePill score={p.score} />
              </li>
            ))}
          </ul>
          <Link to={countryPath(slug, 'interview', 'sessions', o.improvementPlan.sessionId)} className={buttonClasses({ variant: 'secondary', className: 'mt-4' })}>
            Practise weak areas
          </Link>
        </section>
      )}

      <section className={card} aria-labelledby="recent-h">
        <h2 id="recent-h" className={cx('m-0 mb-3 text-lg font-bold', heading)}>Recent interviews</h2>
        {o.recent.length === 0 ? (
          <p className={cx('m-0 text-[15px]', muted)}>No interviews yet. Start one from a job description or one of the jobs on JobPrep.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {o.recent.map((s) => <RecentRow key={s.id} s={s} slug={slug} />)}
          </ul>
        )}
      </section>
    </InterviewPage>
  );
}

function Balance({ o, slug }: { o: InterviewOverview; slug: string }) {
  const w = o.wallet;
  const pct = usedPercent(w);
  return (
    <section className={cx(card, 'flex flex-col gap-3')} aria-labelledby="balance-h">
      <h2 id="balance-h" className={cx('m-0 text-sm font-semibold uppercase tracking-[0.06em]', muted)}>Your interview balance</h2>
      <p className="m-0 flex items-baseline gap-2">
        <strong className={cx('text-[40px] font-extrabold leading-none tracking-tight', heading)}>{durationLabel(w.remainingSeconds)}</strong>
        <span className={cx('text-[15px]', muted)}>{balanceCaption(w)}</span>
      </p>
      {w.totalSeconds > 0 && (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-soft dark:bg-night-soft" role="progressbar" aria-label="Interview time used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <p className={cx('m-0 text-[13px]', muted)}>
            {durationLabel(w.usedSeconds)} used{w.packageExpiresAt ? ` · package active until ${formatDate(w.packageExpiresAt, true)}` : ''}
          </p>
        </>
      )}
      <div className="mt-1 flex flex-wrap gap-2">
        {o.inProgress ? (
          <Link to={countryPath(slug, 'interview-live', o.inProgress)} className={buttonClasses({ variant: 'primary' })}>
            <Mic size={18} aria-hidden="true" /> Resume your interview
          </Link>
        ) : (
          <Link to={countryPath(slug, 'interview', 'new')} className={buttonClasses({ variant: 'primary' })}>
            <Plus size={18} aria-hidden="true" /> New interview
          </Link>
        )}
      </div>
    </section>
  );
}

function Stats({ o }: { o: InterviewOverview }) {
  const tiles = [
    { label: 'Interviews', value: String(o.stats.interviews), Icon: Mic },
    { label: 'Avg. score', value: o.stats.averageScore === null ? '—' : `${o.stats.averageScore}%`, Icon: Sparkles },
    { label: 'Improvement', value: o.stats.improvement === null ? '—' : signedPercent(o.stats.improvement), Icon: TrendingUp },
  ];
  return (
    <section className="grid grid-cols-3 gap-2.5 md:gap-3" aria-label="Your progress">
      {tiles.map(({ label, value, Icon }) => (
        <div key={label} className={cx(card, 'flex flex-col justify-center gap-1 !p-3 md:!p-4')}>
          <Icon size={18} aria-hidden="true" className="text-brand dark:text-night-brand" />
          <strong className={cx('text-[22px] font-extrabold leading-tight md:text-[26px]', heading)}>{value}</strong>
          <span className={cx('text-xs font-medium', muted)}>{label}</span>
        </div>
      ))}
    </section>
  );
}

/** No package yet: the 3,000 tier, or the upgrade price for someone who already has Full Access. */
function Offer({ slug }: { slug: string }) {
  const { session } = useSession();
  const pricing = useQuery({ queryKey: catalogKeys.pricing(slug), queryFn: () => getPricing(slug), staleTime: 60_000 });
  const plan = pricing.data?.interviewPrep;
  if (!plan?.checkoutAvailable || !plan.priceLabel) return null;
  const upgrade = !!session?.access.current && !!plan.upgradePriceLabel;
  const hours = plan.interviewMinutes / 60;
  return (
    <section className={cx(card, 'flex flex-col gap-3 bg-brand-soft md:flex-row md:items-center dark:bg-night-brand-soft')} aria-labelledby="offer-h">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="offer-h" className={cx('m-0 text-lg font-bold', heading)}>
          {upgrade ? `Add ${hours} hours of interview practice` : `${hours} hours of interview practice + every mock test`}
        </h2>
        <p className="m-0 text-[15px] text-ink-2 dark:text-night-ink">
          {upgrade
            ? `You already have Full Access: pay only ${plan.upgradePriceLabel} for the rest of your current access period.`
            : `${plan.name}: ${plan.priceLabel} for ${plan.durationDays} days. Minutes are used only while you are in an interview.`}
        </p>
      </div>
      <Link to={`${countryPath(slug, 'checkout')}?plan=interview&from=interview`} className={buttonClasses({ variant: 'primary', className: 'flex-none' })}>
        {upgrade ? `Upgrade · ${plan.upgradePriceLabel}` : `Get interview prep · ${plan.priceLabel}`}
      </Link>
    </section>
  );
}

const TONE = {
  good: 'bg-correct-bg text-correct',
  mid: 'bg-flagged-bg text-flagged-ink',
  low: 'bg-incorrect-bg text-incorrect',
  none: 'bg-soft text-muted dark:bg-night-soft dark:text-night-muted',
} as const;

export function ScorePill({ score }: { score: number | null }) {
  return <span className={cx('inline-flex min-w-[52px] justify-center rounded-pill px-2.5 py-1 text-sm font-bold tabular', TONE[scoreTone(score)])}>{score === null ? '—' : `${score}%`}</span>;
}

function RecentRow({ s, slug }: { s: SessionSummary; slug: string }) {
  const live = s.status === 'READY' || s.status === 'ACTIVE' || s.status === 'PAUSED';
  const to = live ? countryPath(slug, 'interview-live', s.id) : countryPath(slug, 'interview', 'sessions', s.id);
  return (
    <li className="border-b border-border last:border-b-0 dark:border-night-border">
      <Link to={to} className="flex items-center gap-3 py-3 text-ink no-underline hover:text-ink dark:text-night-ink">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{s.title}</span>
          <span className={cx('text-[13px]', muted)}>
            {formatDate(s.createdAt, true)} · {s.durationMinutes} min · {MODE_LABEL[s.mode]} · {statusLabel(s.status)}
          </span>
        </span>
        <ScorePill score={s.overallScore} />
        <ChevronRight size={18} aria-hidden="true" className={muted} />
      </Link>
    </li>
  );
}
