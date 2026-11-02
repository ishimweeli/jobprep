import { t } from '@jobprep/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { catalogKeys, getMockTest } from '../../api/catalog';
import type { ExamDetail } from '../../api/types';
import { Badge, AccessBadge } from '../../components/Badge';
import { buttonClasses } from '../../components/Button';
import { PhoneBackHeader } from '../../components/layout/Header';
import { QueryError, SkeletonBar, SkeletonList } from '../../components/states';
import { attemptScore, formatDate, languageList, passMarkDisplay } from '../../lib/format';
import { useSession } from '../auth/session';
import { formatClock } from '../exam/timer';
import { useRemaining } from '../exam/useRemaining';
import { answeredShare, attemptsLine, PRIMARY_LABEL, reviewLastLabel, unlockedState } from './detailsModel';
import { GuestPaidDialog } from './GuestPaidDialog';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { countryPath, useActiveCountry } from '../country/hooks';
import { AccessCard, accessView, PhoneCtaBar } from './AccessCard';
import { ResumePrompt, useInProgress } from '../exam/ResumePrompt';

const sectionCard = 'flex flex-col gap-1 rounded-[14px] border border-border bg-surface p-4 md:gap-3 md:rounded-card md:p-[22px]';

export function ExamDetailPage() {
  const { slug, country } = useActiveCountry();
  const { user, isLoading: sessionLoading } = useSession();
  const [params, setParams] = useSearchParams();
  const { slug: testSlug = '' } = useParams();
  const q = useQuery({
    queryKey: catalogKeys.detail(slug, testSlug),
    queryFn: () => getMockTest(slug, testSlug),
    staleTime: 30_000,
  });
  const exam = q.data;
  const inProgress = useInProgress();
  useDocumentTitle(exam?.title);

  if (q.isError) {
    return (
      <div>
        <PhoneBackHeader to={countryPath(slug, 'tests')} label="Back to mock tests" title="Mock tests" />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
          <QueryError error={q.error} what="this mock test" onRetry={() => void q.refetch()} retrying={q.isFetching} />
        </main>
      </div>
    );
  }

  if (!exam) {
    return (
      <div>
        <PhoneBackHeader to={countryPath(slug, 'tests')} label="Back to mock tests" title="Mock tests" />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-7">
          <div className="mb-5 flex flex-col gap-3" aria-hidden="true">
            <SkeletonBar className="h-6 w-1/3" />
            <SkeletonBar className="h-9 w-4/5 bg-border" />
          </div>
          <SkeletonList count={3} label="Loading mock test…" />
        </main>
      </div>
    );
  }

  const view = accessView(exam, slug);
  const guest = !user && !sessionLoading;
  const gateOpen = guest && exam.access.state === 'LOCKED' && params.get('gate') === 'paid';
  const closeGate = () => {
    const next = new URLSearchParams(params);
    next.delete('gate');
    setParams(next, { replace: true });
  };
  const openGate = () => {
    const next = new URLSearchParams(params);
    next.set('gate', 'paid');
    setParams(next, { replace: true });
  };
  const onBuy = guest ? openGate : undefined;
  if (exam.access.state === 'GRANTED') return <UnlockedDetails exam={exam} slug={slug} />;
  const running = inProgress.data?.find((a) => a.mockTest.slug === exam.slug && a.kind === 'FULL');
  return (
    <div className="flex flex-1 flex-col">
      <PhoneBackHeader to={countryPath(slug, 'tests')} label="Back to mock tests" title={<span className="text-[15px] font-semibold text-ink-2">{exam.category.name}</span>} />
      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 pb-6 pt-[18px] md:gap-[22px] md:px-6 md:pb-16 md:pt-7">
        <nav aria-label="Breadcrumb" className="hidden text-sm text-muted md:block">
          <Link to={countryPath(slug)} className="text-muted underline hover:text-ink">
            Home
          </Link>{' '}
          ›{' '}
          <Link to={countryPath(slug, 'tests')} className="text-muted underline hover:text-ink">
            Mock tests
          </Link>{' '}
          › {exam.category.name}
        </nav>

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-col gap-4 md:flex-[999_1_560px] md:gap-5">
            {running && <ResumePrompt attempt={running} slug={slug} />}
            <Header exam={exam} />
            <Facts exam={exam} />
            <Sections exam={exam} />
            <Instructions exam={exam} />
            <Attempts exam={exam} />
          </div>
          <aside aria-label="Access" className="hidden min-w-0 flex-[1_1_320px] flex-col gap-4 md:flex">
            <AccessCard view={view} onBuy={onBuy} />
          </aside>
        </div>
      </main>
      <PhoneCtaBar view={view} onBuy={onBuy} />
      <GuestPaidDialog open={gateOpen} onClose={closeGate} exam={exam} slug={slug} countryName={country?.name ?? 'this country'} />
    </div>
  );
}

function Header({ exam }: { exam: ExamDetail }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <Badge tone="brand" className="hidden px-2.5 py-1 text-[13px] md:inline-flex">
          {exam.category.name}
        </Badge>
        <AccessBadge isFree={exam.isFree} className="px-2.5 py-1 text-xs md:text-[13px]" />
      </div>
      <h1 className="m-0 text-[26px] font-bold leading-[1.2] tracking-tight md:text-[34px] md:leading-[1.15]">{exam.title}</h1>
      {exam.summary && <p className="m-0 max-w-[44em] text-base leading-[1.55] text-ink-2 md:text-[17px]">{exam.summary}</p>}
    </div>
  );
}

function Facts({ exam }: { exam: ExamDetail }) {
  const facts = [
    { label: 'Questions', value: String(exam.questionCount) },
    { label: 'Time limit', value: `${exam.durationMinutes} min` },
    { label: 'Total marks', value: String(exam.totalMarks) },
    { label: 'Language', value: languageList(exam.languages) },
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] md:gap-3">
      {facts.map((f) => (
        <div key={f.label} className="flex flex-col-reverse gap-0.5 rounded-xl border border-border bg-surface p-3 md:rounded-[14px] md:p-4">
          <dt className="text-[13px] text-muted md:text-sm">{f.label}</dt>
          <dd className="m-0 text-xl font-extrabold md:text-2xl">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Sections({ exam }: { exam: ExamDetail }) {
  if (exam.sections.length === 0) return null;
  return (
    <section aria-labelledby="sec" className={sectionCard}>
      <h2 id="sec" className="m-0 mb-1.5 text-[17px] font-bold md:mb-0 md:text-xl">
        What the test covers
      </h2>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[440px] border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] text-muted">
              <th scope="col" className="py-2 font-semibold">Section</th>
              <th scope="col" className="py-2 font-semibold">Question type</th>
              <th scope="col" className="py-2 text-right font-semibold">Questions</th>
              <th scope="col" className="py-2 text-right font-semibold">Marks</th>
            </tr>
          </thead>
          <tbody>
            {exam.sections.map((s) => (
              <tr key={s.name} className="border-t border-border">
                <th scope="row" className="py-3 text-left font-semibold">{s.name}</th>
                <td className="py-3 text-ink-2">{s.questionType}</td>
                <td className="py-3 text-right tabular">{s.questions}</td>
                <td className="py-3 text-right tabular">{s.marks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 list-none p-0 md:hidden" aria-label="Sections">
        {exam.sections.map((s) => (
          <li key={s.name} className="flex justify-between gap-2.5 border-t border-soft py-2.5">
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">{s.name}</span>
              <span className="text-[13px] text-muted">{s.questionType}</span>
            </span>
            <span className="whitespace-nowrap text-sm text-ink-2">
              {s.questions} Q · {s.marks} marks
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Instructions({ exam }: { exam: ExamDetail }) {
  const pass = passMarkDisplay(exam);
  return (
    <section aria-labelledby="ins" className={`${sectionCard} md:gap-3`}>
      <h2 id="ins" className="m-0 text-[17px] font-bold md:text-xl">
        Instructions
      </h2>
      {exam.instructions.length > 0 && (
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-[18px] text-[15px] leading-normal text-ink-2 md:gap-2 md:pl-5 md:leading-[1.55]">
          {exam.instructions.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {pass.kind === 'official' ? (
        <p className="m-0 rounded-[10px] bg-soft px-3 py-2.5 text-[13px] text-ink-2 md:px-3.5 md:py-3 md:text-sm" data-testid="pass-mark">
          Official pass mark: <strong>{pass.percent}%</strong>. Source: {pass.source}.
        </p>
      ) : (
        <p className="m-0 rounded-[10px] bg-soft px-3 py-2.5 text-[13px] text-muted md:px-3.5 md:py-3 md:text-sm" data-testid="no-pass-mark">
          {t('en', 'exam.noPassMark')}
        </p>
      )}
    </section>
  );
}

function Attempts({ exam }: { exam: ExamDetail }) {
  const attempts = exam.previousAttempts;
  return (
    <section aria-labelledby="att" className={sectionCard}>
      <h2 id="att" className="m-0 text-[17px] font-bold md:text-lg">
        Your previous attempts
      </h2>
      {attempts.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {attempts.map((a) => (
            <li key={a.id} className="flex justify-between gap-3 border-t border-soft py-2.5 text-[15px] first:border-t-0">
              <span className="flex flex-col">
                <span className="font-semibold">{formatDate(a.submittedAt, true)}</span>
                {a.minutesUsed !== null && <span className="text-[13px] text-muted">{a.minutesUsed} min used</span>}
              </span>
              <strong className="tabular">{attemptScore(a)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[15px] text-ink-2">You have not taken this test yet.</p>
      )}
    </section>
  );
}

/**
 * A test the user has unlocked (ExamDetailUnlocked.dc, ExamDetailUnlockedPhone.dc): header with "Unlocked with Full
 * Access", facts, instructions, and the "Your access" card with its three states: not started, in progress
 * (Resume) and taken before (new attempt + "Review last attempt").
 */
function UnlockedDetails({ exam, slug }: { exam: ExamDetail; slug: string }) {
  const desktop = useIsDesktop();
  const state = unlockedState(exam);
  const running = exam.inProgress;
  const left = useRemaining(running?.remainingSeconds ?? 0);
  const startTo = countryPath(slug, 'tests', exam.slug, 'start');
  const primaryTo = running ? countryPath(slug, 'exam', running.attemptId) : startTo;
  const last = exam.previousAttempts[0];
  const reviewLabel = reviewLastLabel(exam);
  const until = exam.access.accessEndsAt ? ` · until ${formatDate(exam.access.accessEndsAt, true)}` : '';

  const accessCard = (
    <section aria-label="Start" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <span className="text-sm font-semibold text-muted">Your access</span>
      <span className="text-[17px] font-bold">Full Access{until}</span>
      {running && (
        <div className="flex flex-col gap-1.5 rounded-control bg-brand-softer px-3.5 py-3">
          <strong className="text-[15px]">You have this test in progress</strong>
          <span className="text-sm text-ink-2">
            {running.answered} of {running.total} answered · {formatClock(left)} left on the timer
          </span>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-[#DDD6FE]">
            <div className="h-1.5 bg-brand" style={{ width: `${answeredShare(running)}%` }} />
          </div>
        </div>
      )}
      <Link to={primaryTo} className={buttonClasses({ variant: 'primary', size: 'lg' })}>
        {PRIMARY_LABEL[state]}
      </Link>
      {state === 'taken_before' && last && reviewLabel && (
        <>
          <Link to={countryPath(slug, 'review', last.id)} className={buttonClasses({ variant: 'neutral', size: 'sm', className: '!min-h-[48px] !px-[18px] !font-semibold' })}>
            {reviewLabel}
          </Link>
          <p className="m-0 text-[13px] text-muted">{attemptsLine(exam)}</p>
        </>
      )}
      {state === 'in_progress' && <p className="m-0 text-[13px] text-muted">To start over, submit this attempt first. It will count in your history.</p>}
    </section>
  );

  return (
    <div className="flex flex-1 flex-col">
      <PhoneBackHeader to={countryPath(slug, 'tests')} label="Back to mock tests" title={<span className="text-[15px] font-semibold text-ink-2">{exam.category.name}</span>} />
      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 pb-6 pt-[18px] md:gap-[18px] md:px-6 md:pb-14 md:pt-7">
        <nav aria-label="Breadcrumb" className="hidden text-sm text-muted md:block">
          <Link to={countryPath(slug)} className="text-muted underline hover:text-ink">
            Home
          </Link>{' '}
          ›{' '}
          <Link to={countryPath(slug, 'tests')} className="text-muted underline hover:text-ink">
            Mock tests
          </Link>{' '}
          › {exam.category.name}
        </nav>
        <div className="flex flex-wrap items-start gap-[22px]">
          <div className="flex min-w-0 flex-col gap-4 md:flex-[999_1_560px] md:gap-[18px]">
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-2">
                <Badge tone="brand" className="px-2.5 py-1 text-[13px]">
                  {exam.category.name}
                </Badge>
                <Badge tone="free" className="gap-1.5 px-2.5 py-1 text-[13px]">
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  Unlocked with Full Access
                </Badge>
              </div>
              <h1 className="m-0 text-[26px] font-bold leading-[1.15] tracking-tight md:text-[34px]">{exam.title}</h1>
              {exam.summary && <p className="m-0 max-w-[44em] text-base leading-[1.55] text-ink-2">{exam.summary}</p>}
            </div>
            <Facts exam={exam} />
            <Instructions exam={exam} />
            {!desktop && accessCard}
          </div>
          {desktop && (
            <aside aria-label="Access" className="min-w-0 flex-[1_1_320px]">
              {accessCard}
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
