import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { attemptKeys, getResult } from '../../api/attempts';
import { isApiError } from '../../api/client';
import type { ResultResponse } from '../../api/types';
import { ActionLink, Button, buttonClasses } from '../../components/Button';
import { QueryError, Loader } from '../../components/states';
import { cx } from '../../lib/cx';
import { formatDate } from '../../lib/format';
import { signUpPath } from '../../lib/next';
import { ROUTES_READY } from '../../lib/routesReady';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { StartPracticeLink } from '../practice/StartPracticeLink';
import { FeedbackCard } from './FeedbackCard';
import { useStartPractice } from '../practice/useStartPractice';
import {
  answerText, AUTO_SUBMITTED_LINE, barHeight, deltaHeadline, historyLabel, JOBPREP_PASS_MARK, marksLabel, NOT_SAVED_BANNER, passVerdict, percentLabel, PRACTICE_NOTE, resultsFlags, resultsSummaryLine,
  ringDash, SAVED_BANNER, timeSpent, timeSpentChange, topicBarColor,
} from './resultsModel';

const card = 'min-w-0 rounded-card border border-border bg-surface';

export function ResultsPage() {
  const slug = useActiveCountrySlug();
  const { attemptId = '' } = useParams();
  const q = useQuery({ queryKey: attemptKeys.result(attemptId), queryFn: () => getResult(attemptId), retry: false, staleTime: 30_000 });
  useDocumentTitle('Your results');
  const saved = useSearchParams()[0].get('saved') === '1';
  const { user } = useSession();

  if (q.isError && isApiError(q.error) && q.error.code === 'attempt_in_progress') {
    return <Navigate to={countryPath(slug, 'exam', attemptId)} replace />;
  }
  // C18: the person just signed up from "Save my result" and the attempt could not be added to the account: a neutral note, no error tone.
  if (q.isError && saved && user && isApiError(q.error) && (q.error.status === 404 || q.error.status === 403)) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-8 md:px-6">
        <SavedNote tone="neutral" title={NOT_SAVED_BANNER.title} body={NOT_SAVED_BANNER.body} />
        <Link to={countryPath(slug, 'progress')} className={buttonClasses({ variant: 'primary', size: 'lg' })}>
          Go to My progress
        </Link>
      </main>
    );
  }
  if (q.isError) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
        <QueryError error={q.error} what="your results" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </main>
    );
  }
  if (!q.data) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-7">
        <Loader label="Loading your results…" />
      </main>
    );
  }
  return <ResultsView r={q.data} slug={slug} attemptId={attemptId} justSaved={saved && !!user && !q.data.isGuest} />;
}

/** The "Saved." confirmation after Save my result (and its neutral twin). Same box style as the guest banner. */
function SavedNote({ tone, title, body, action }: { tone: 'good' | 'neutral'; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div role="status" className={cx('flex flex-col gap-2.5 rounded-[14px] border p-3.5 md:flex-row md:flex-wrap md:items-center md:gap-x-5 md:rounded-card md:px-5 md:py-4', tone === 'good' ? 'border-correct-line bg-correct-bg' : 'border-border bg-surface')}>
      <p className="m-0 text-[15px] text-ink-2 md:flex-[1_1_360px]">
        <strong className={tone === 'good' ? 'text-correct' : 'text-ink'}>{title}</strong> {body}
      </p>
      {action}
    </div>
  );
}

function ResultsView({ r, slug, attemptId, justSaved }: { r: ResultResponse; slug: string; attemptId: string; justSaved: boolean }) {
  const flags = resultsFlags(r);
  const practice = useStartPractice(slug);
  const summaryLine = resultsSummaryLine(flags);
  const verdict = flags.isPractice ? null : passVerdict(r.score, r.passMark);
  const headline = flags.showComparison ? deltaHeadline(r.comparison?.deltaPoints ?? null) : null;
  const submitted = formatDate(r.attempt.submittedAt, true);
  const reviewTo = countryPath(slug, 'review', attemptId);
  const tryTo = countryPath(slug, 'tests');
  const weak = r.weakestTopic;
  const prev = flags.showComparison ? r.comparison : null;
  const change = timeSpentChange(r.attempt.timeSpentSeconds, prev?.previousTimeSpentSeconds ?? null);
  const stats = [
    { label: 'Correct', value: String(r.counts.correct), dot: '#1E7A46' },
    { label: 'Incorrect', value: String(r.counts.incorrect), dot: '#A1281B' },
    { label: 'Unanswered', value: String(r.counts.unanswered), dot: '#CDD4DE' },
    { label: 'Time spent', value: timeSpent(r.attempt.timeSpentSeconds), dot: '#164A7A' },
  ];
  const savePath = signUpPath(`${countryPath(slug, 'results', attemptId)}?saved=1`);
  const shortDate = formatDate(r.attempt.submittedAt, true);

  return (
    <div className="flex flex-1 flex-col bg-page">
      <header className="flex items-center justify-between border-b border-border bg-surface py-2 pl-4 pr-2 md:hidden">
        <h1 className="m-0 text-[17px] font-semibold">{flags.isPractice ? 'Practice results' : 'Your results'}</h1>
        <Link to={countryPath(slug)} className="p-3 text-[15px] font-semibold text-ink no-underline hover:text-ink">
          Close
        </Link>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-4 outline-none md:gap-[22px] md:px-6 md:pb-16 md:pt-7">
        {justSaved && (
          <div className="order-1 md:order-1">
            <SavedNote
              tone="good"
              title={SAVED_BANNER.title}
              body={SAVED_BANNER.body}
              action={
                <Link to={countryPath(slug, 'progress')} className="self-start rounded-[10px] border border-brand bg-surface px-3.5 py-2.5 text-[15px] font-semibold text-brand no-underline hover:text-brand md:rounded-control md:px-4 md:py-[11px]">
                  Go to My progress
                </Link>
              }
            />
          </div>
        )}
        {r.isGuest && (
          <div className="order-4 flex flex-col gap-2.5 rounded-[14px] border border-brand-light bg-brand-softer p-3.5 md:order-1 md:flex-row md:flex-wrap md:items-center md:gap-x-5 md:gap-y-3 md:rounded-card md:px-5 md:py-4">
            <p className="m-0 text-[15px] text-ink-2 md:flex-[1_1_360px]">
              <strong className="text-ink">Keep this result.</strong>{' '}
              <span className="md:hidden">Create a free account with Google or your email to track progress.</span>
              <span className="hidden md:inline">Create a free account with Google or your email to track your progress across attempts.</span>
            </p>
            <Link
              to={savePath}
              className="self-start rounded-[10px] border border-brand bg-surface px-3.5 py-2.5 text-[15px] font-semibold text-brand no-underline hover:text-brand md:rounded-control md:px-4 md:py-[11px]"
            >
              Save my result
            </Link>
          </div>
        )}

        <div className="order-1 flex flex-col gap-1 md:order-2">
          <span className="text-[13px] font-semibold text-muted md:text-sm">
            <span className="md:hidden">
              {r.mockTest.title} · {shortDate}
            </span>
            <span className="hidden md:inline">
              {r.mockTest.title} · Submitted {submitted}
            </span>
          </span>
          <h1 className="m-0 hidden text-[28px] tracking-tight md:block">{flags.isPractice ? 'Practice results' : 'Your results'}</h1>
          {flags.autoSubmitted && (
            <span data-testid="auto-submitted" className="text-[13px] text-ink-2 md:text-sm">
              {AUTO_SUBMITTED_LINE}
            </span>
          )}
          {flags.isPractice && <span className="text-[13px] text-ink-2 md:text-sm">{PRACTICE_NOTE}</span>}
        </div>

        <section aria-label="Score summary" className="order-2 flex flex-col items-center gap-3.5 rounded-card border border-border bg-surface p-5 text-center md:order-3 md:flex-row md:flex-wrap md:gap-7 md:rounded-[20px] md:p-7 md:text-left">
          <div className="relative h-[150px] w-[150px] shrink-0 md:h-[168px] md:w-[168px]">
            <svg viewBox="0 0 120 120" role="img" aria-label={`Score ${Math.round(r.score.percent)} percent`} className="h-full w-full">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#E8EFFB" strokeWidth="11" />
              <circle cx="60" cy="60" r="54" fill="none" stroke="#164A7A" strokeWidth="11" strokeLinecap="round" strokeDasharray={ringDash(r.score.percent)} transform="rotate(-90 60 60)" />
            </svg>
            <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[34px] font-bold md:text-[38px] md:tracking-tight">{percentLabel(r.score.percent)}</span>
              <span className="text-[13px] text-muted md:text-sm">{marksLabel(r.score)}</span>
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-4 md:flex-[1_1_420px]">
            {verdict && (
              <div
                data-testid="pass-verdict"
                className={cx('flex flex-col gap-1 rounded-control border px-3.5 py-3 text-left', verdict.passed ? 'border-correct-line bg-correct-bg' : 'border-incorrect-line bg-incorrect-bg')}
              >
                <strong className={cx('flex items-center gap-2 text-xl md:text-[22px]', verdict.passed ? 'text-correct' : 'text-incorrect')}>
                  <span aria-hidden="true">{verdict.passed ? '✓' : '✗'}</span>
                  {verdict.title}
                </strong>
                <span className="text-[15px] text-ink-2">{verdict.line}</span>
              </div>
            )}
            {summaryLine && (
              <p className="m-0 text-base leading-normal md:text-lg" data-testid="results-summary-line">
                {summaryLine}
              </p>
            )}
            {!summaryLine && (headline || weak) && (
              <p className="m-0 text-base leading-normal md:text-lg">
                {headline && prev && (
                  <>
                    <strong>{headline}</strong> from your last attempt
                    {prev.previousPercent !== null && (
                      <span className="hidden md:inline">
                        {' '}
                        ({percentLabel(prev.previousPercent)} on {formatDate(prev.previousSubmittedAt)})
                      </span>
                    )}
                    .{' '}
                  </>
                )}
                {weak && (
                  <>
                    {weak.name} is{' '}
                    <span className="md:hidden">your weakest topic.</span>
                    <span className="hidden md:inline">the topic holding your score back.</span>
                  </>
                )}
              </p>
            )}
            <dl className="m-0 grid grid-cols-2 gap-2 text-left md:grid-cols-[repeat(auto-fill,minmax(min(100%,140px),1fr))] md:gap-2.5">
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col-reverse rounded-control border border-border px-3 py-2.5 md:gap-0.5 md:px-3.5 md:py-3">
                  <dt className="flex items-center gap-1.5 text-[13px] text-muted">
                    <span aria-hidden="true" className="h-[9px] w-[9px] rounded-[3px] md:h-2.5 md:w-2.5" style={{ background: s.dot }} />
                    {s.label}
                  </dt>
                  <dd className="m-0 text-xl font-bold tabular md:text-[22px]">{s.value}</dd>
                </div>
              ))}
            </dl>
            {r.passMark ? (
              <p className="m-0 text-xs text-muted md:text-[13px]">
                Official pass mark: <strong>{Math.round(r.passMark.percent)}%</strong>. Source: {r.passMark.source}.
              </p>
            ) : (
              <p className="m-0 text-xs text-muted md:text-[13px]" data-testid="no-pass-mark">
                No official pass mark is published for this exam, so JobPrep uses {JOBPREP_PASS_MARK}%.
              </p>
            )}
          </div>
        </section>

        <div className="order-3 flex flex-col gap-2 md:order-4 md:flex-row md:flex-wrap md:gap-3">
          <ActionLink ready={ROUTES_READY.review} to={reviewTo} variant="primary" className="md:flex-[1_1_220px]">
            Review Answers
          </ActionLink>
          {flags.isPractice && flags.practiceAgainTopicId && (
            <Button variant="secondary" size="sm" className="md:flex-[1_1_220px]" loading={practice.pending} onClick={() => (r.canPractice ? practice.startFromAttempt(attemptId) : practice.startTopic(flags.practiceAgainTopicId!))}>
              Practice again
            </Button>
          )}
          {practice.error && (
            <span role="alert" className="text-sm font-semibold text-incorrect">
              {practice.error}
            </span>
          )}
          {!flags.isPractice && r.canPractice && (
            <StartPracticeLink
              attemptId={attemptId}
              slug={slug}
              label="Practice Weak Areas"
              variant="secondary"
              className="md:flex-[1_1_220px]"
            />
          )}
          <ActionLink
            ready={ROUTES_READY.tryAnother}
            to={flags.isPractice && !r.isGuest ? countryPath(slug, 'progress') : tryTo}
            variant="plain"
            className="!min-h-[44px] p-3 !text-[15px] md:flex-[1_1_220px] md:border-input-border md:!text-base"
          >
            {flags.isPractice ? (r.isGuest ? 'Try a mock test' : 'Back to my progress') : 'Try Another Mock Test'}
          </ActionLink>
        </div>

        <div className="contents md:order-5 md:flex md:flex-wrap md:items-start md:gap-[22px]">
          <section aria-labelledby="topics" className={cx(card, 'order-5 flex flex-col gap-3.5 rounded-card p-4 md:flex-[999_1_520px] md:gap-[18px] md:rounded-card-lg md:p-6')}>
            <h2 id="topics" className="m-0 text-[17px]">
              Performance by topic
            </h2>
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0 md:gap-[18px]">
              {r.topics.map((t) => (
                <li key={t.topicId} className="flex flex-col gap-1.5 md:gap-2">
                  <div className="flex flex-col gap-1.5 md:contents">
                    <div className="flex items-center justify-between gap-2 text-sm md:gap-2.5 md:text-[15px]">
                      <span className="flex items-center gap-2 font-semibold">
                        {t.name}
                        {t.weak && <span className="hidden rounded-pill bg-flagged-bg px-2 py-0.5 text-xs font-semibold text-flagged-ink md:inline">Weak area</span>}
                      </span>
                      <span className="tabular text-ink-2">
                        <strong className="text-ink">{percentLabel(t.percent)}</strong> · {Math.round(t.marks * 100) / 100} / {Math.round(t.marksAvailable * 100) / 100}
                      </span>
                    </div>
                  </div>
                  <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-pill bg-soft md:h-3">
                    <div className="h-full rounded-pill" style={{ width: `${Math.max(0, Math.min(100, t.percent))}%`, background: topicBarColor(t) }} />
                  </div>
                  {t.weak && <span className="self-start rounded-pill bg-flagged-bg px-2 py-0.5 text-xs font-semibold text-flagged-ink md:hidden">Weak area</span>}
                </li>
              ))}
            </ul>
          </section>

          {flags.showComparison && (
            <section aria-labelledby="hist" className={cx(card, 'order-6 flex flex-col gap-2.5 rounded-card p-4 md:flex-[1_1_340px] md:gap-4 md:rounded-card-lg md:p-6')}>
              <h2 id="hist" className="m-0 text-[17px]">
                <span className="md:hidden">Compared with last time</span>
                <span className="hidden md:inline">Compared with earlier attempts</span>
              </h2>
              {/* Phone: two boxes. Desktop: bars. Both are text-first; the bars carry the same numbers. */}
              <div className="flex gap-2.5 md:hidden">
                {[r.history[r.history.length - 2], r.history[r.history.length - 1]].map((h) =>
                  h ? (
                    <div key={h.attemptId} className={cx('flex-1 rounded-control p-3', h.current ? 'border-2 border-brand p-[11px]' : 'border border-border')}>
                      <span className={cx('block text-[13px]', h.current ? 'text-brand' : 'text-muted')}>{historyLabel(h)}</span>
                      <span className="text-xl font-bold">{h.percent === null ? '–' : percentLabel(h.percent)}</span>
                    </div>
                  ) : null,
                )}
              </div>
              <div
                role="img"
                aria-label={r.history.map((h, i) => `Attempt ${i + 1}: ${h.percent === null ? 'no score' : `${Math.round(h.percent)} percent`}.`).join(' ')}
                className="hidden h-40 items-end gap-6 border-b border-border-strong px-2 md:flex"
              >
                {r.history.map((h) => (
                  <div key={h.attemptId} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[15px] font-semibold">{h.percent === null ? '–' : percentLabel(h.percent)}</span>
                    <div className="w-full rounded-t-lg" style={{ height: barHeight(h.percent ?? 0), background: h.current ? '#164A7A' : '#DCEBFA' }} />
                  </div>
                ))}
              </div>
              <div aria-hidden="true" className="hidden gap-6 px-2 text-center text-[13px] text-muted md:flex">
                {r.history.map((h) => (
                  <span key={h.attemptId} className="flex-1">
                    {historyLabel(h)}
                  </span>
                ))}
              </div>
              {change && (
                <p className="m-0 text-sm text-ink-2">
                  <span className="md:hidden">
                    Time spent: {change.to} (was {change.from}).
                  </span>
                  <span className="hidden md:inline">
                    Time spent {change.verb} {change.from} to {change.to}.
                  </span>
                </p>
              )}
            </section>
          )}
        </div>

        {r.reviewFirst.length > 0 && (
          <section aria-labelledby="first" className={cx(card, 'order-7 flex flex-col gap-1 rounded-card p-4 md:order-6 md:gap-3.5 md:rounded-card-lg md:p-6')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2.5">
              <h2 id="first" className="m-0 mb-1.5 text-[17px] md:mb-0">
                Review these first
              </h2>
              <Link to={reviewTo} className="hidden text-[15px] font-semibold text-link hover:text-link-hover md:inline">
                See all {r.incorrectCount} incorrect answers
              </Link>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {r.reviewFirst.map((w) => {
                const you = answerText(w.yourAnswer);
                return (
                  <li key={w.questionId} className="border-t border-soft md:border-border">
                    <Link to={`${reviewTo}?q=${w.number}`} className="flex items-start gap-2.5 py-3 text-ink no-underline hover:text-ink md:gap-3.5 md:py-3.5">
                      <span className="h-6 shrink-0 rounded-lg bg-incorrect-bg px-[7px] py-[3px] text-[13px] font-semibold text-incorrect md:h-auto md:px-2 md:py-1 md:text-sm">Q{w.number}</span>
                      <span className="flex min-w-0 flex-col gap-0.5 md:gap-1">
                        <span className="text-[15px] font-semibold leading-[1.4] md:text-base">{w.stem}</span>
                        <span className="text-[13px] text-muted md:hidden">{w.topic}</span>
                        <span className="hidden text-sm text-ink-2 md:inline">
                          {you && (
                            <>
                              You chose <strong>{you}</strong> ·{' '}
                            </>
                          )}
                          Correct: <strong className="text-free">{w.correctAnswer.join(', ')}</strong> · {w.topic}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link to={reviewTo} className="py-2.5 pb-0.5 text-[15px] font-semibold text-link hover:text-link-hover md:hidden">
              See all {r.incorrectCount} incorrect
            </Link>
          </section>
        )}

        <FeedbackCard attemptId={attemptId} saved={r.feedback ?? null} />
      </main>
    </div>
  );
}
