import { Link } from 'react-router-dom';
import type { AttemptState } from '../../api/types';
import { buttonClasses } from '../../components/Button';
import { PhoneBrandHeader } from '../../components/layout/Header';
import { SiteShell } from '../../components/layout/SiteLayout';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';

/** What the "This attempt has ended" screen offers (C9). Pure, unit-tested. */
export function attemptEndedView(state: Pick<AttemptState, 'attempt' | 'counts'> & Partial<Pick<AttemptState, 'reopen'>>, slug: string) {
  const a = state.attempt;
  const isPractice = a.kind === 'PRACTICE';
  // The API's `reopen` block (when present) says whether a new attempt is allowed and why not.
  const allowed = state.reopen ? state.reopen.canStartNew : !isPractice;
  const needsAccess = state.reopen?.startNewReason === 'needs_full_access';
  return {
    title: 'This attempt has ended',
    body: a.status === 'AUTO_SUBMITTED'
      ? `It was submitted automatically when time ran out, with ${state.counts.answered} of ${state.counts.total} questions answered. Nothing you answered was lost.`
      : `It was submitted with ${state.counts.answered} of ${state.counts.total} questions answered. Nothing you answered was lost.`,
    resultsTo: countryPath(slug, 'results', a.id),
    // A new attempt of the same test is always allowed (attempts are unlimited); practice sets are started from results or My progress instead.
    newAttemptTo: allowed ? countryPath(slug, 'tests', a.mockTest.slug, 'start') : null,
    fallbackTo: isPractice ? countryPath(slug, 'progress') : null,
    /** A new attempt of a paid test needs Full Access the person does not have. */
    accessNote: needsAccess ? 'A new attempt of this test needs Full Access.' : null,
    accessTo: needsAccess ? countryPath(slug, 'tests', a.mockTest.slug) : null,
  };
}

/** Opening an exam link whose attempt is already submitted (C9): not drawn, built with the system-page layout. */
export function AttemptEnded({ state, slug }: { state: AttemptState; slug: string }) {
  useDocumentTitle('This attempt has ended');
  const v = attemptEndedView(state, slug);
  return (
    <SiteShell>
      <PhoneBrandHeader minimal />
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-start justify-center bg-surface px-4 pb-6 pt-12 outline-none md:bg-page md:pb-14 md:pt-[72px]">
        <div className="flex w-full max-w-[460px] flex-col items-center gap-3.5 text-center">
          <span className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-soft text-ink">
            <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <p className="m-0 text-sm font-semibold text-muted">{state.attempt.mockTest.title}</p>
          <h1 className="m-0 text-2xl leading-[1.2] tracking-tight md:text-[28px]">{v.title}</h1>
          <p className="m-0 text-base leading-[1.55] text-ink-2">{v.body}</p>
          <div className="flex w-full flex-col gap-2">
            <Link to={v.resultsTo} replace className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>
              See results
            </Link>
            {v.newAttemptTo && (
              <Link to={v.newAttemptTo} className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}>
                Start a new attempt
              </Link>
            )}
            {v.accessNote && v.accessTo && (
              <p className="m-0 text-sm text-ink-2">
                {v.accessNote}{' '}
                <Link to={v.accessTo} className="link font-semibold">
                  See the test
                </Link>
              </p>
            )}
            {v.fallbackTo && (
              <Link to={v.fallbackTo} className="link p-2.5 text-[15px] font-semibold">
                Back to my progress
              </Link>
            )}
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
