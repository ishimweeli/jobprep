import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useReducer, useState } from 'react';
import { Link } from 'react-router-dom';
import { attemptKeys, checkPracticeAnswer, saveAnswers, submitAttempt } from '../../api/attempts';
import { ApiError } from '../../api/client';
import type { AttemptState } from '../../api/types';
import { buttonClasses } from '../../components/Button';
import { authErrorMessage } from '../../lib/errorCopy';
import { cx } from '../../lib/cx';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath } from '../country/hooks';
import { ChooseBadge } from '../exam/ExamParts';
import {
  canCheck, dominantTopic, feedbackFor, initialPracticeState, joinNames, optionTag, practiceProgress, practiceReducer, practiceSummary, type FeedbackTone,
} from './practiceModel';
import { useStartPractice } from './useStartPractice';

const FEEDBACK: Record<FeedbackTone, string> = {
  correct: 'border-[#6EE7B7] bg-[#ECFDF5] text-free',
  incorrect: 'border-[#FCA5A5] bg-[#FEF2F2] text-red-800',
  partial: 'border-[#FDBA74] bg-[#FFF7ED] text-[#9A3412]',
};

/**
 * The practice-set runner (Practice.dc, PracticePhone.dc). Untimed, no navigator and no flag: pick an answer,
 * "Check answer" saves it and asks the API for the right answer and the explanation (the API only gives them after
 * the answer is saved), then "Next question". "End practice" or the last question shows the summary.
 */
export function PracticeRunner({ state: attempt, slug }: { state: AttemptState; slug: string }) {
  const { questions } = attempt;
  const attemptId = attempt.attempt.id;
  const qc = useQueryClient();
  const [s, dispatch] = useReducer(practiceReducer, undefined, () => initialPracticeState(questions, attempt.answers));
  const [error, setError] = useState<string | null>(null);
  const topics = joinNames(questions.map((q) => q.topic.name));
  useDocumentTitle(s.finished ? 'Practice finished' : 'Practice');
  const more = useStartPractice(slug);

  const q = questions[s.index];
  const check = useMutation({
    mutationFn: async () => {
      const selected = s.picked[q!.id] ?? [];
      await saveAnswers(attemptId, [{ questionId: q!.id, selected }]);
      return checkPracticeAnswer(attemptId, q!.id);
    },
    onSuccess: (result) => {
      setError(null);
      dispatch({ type: 'checked', result });
    },
    onError: (e) => setError(authErrorMessage(e instanceof ApiError ? e : new ApiError(0, 'network_error'))),
  });
  const finish = useMutation({
    mutationFn: () => submitAttempt(attemptId, []),
    onSettled: () => void qc.invalidateQueries({ queryKey: attemptKeys.inProgress }),
  });

  const end = () => {
    finish.mutate();
    dispatch({ type: 'end' });
  };
  const next = () => {
    if (s.index >= questions.length - 1) finish.mutate();
    dispatch({ type: 'next', total: questions.length });
  };

  const header = (
    <header className="shrink-0 border-b border-border bg-surface">
      {/* Phone header: back arrow + title (PracticePhone.dc) */}
      <div className="flex min-h-[60px] items-center gap-2 px-4 py-2 md:hidden">
        <Link to={countryPath(slug, 'progress')} aria-label="Back" className="-ml-3 inline-flex h-11 w-11 items-center justify-center text-xl text-ink no-underline hover:text-ink">
          <span aria-hidden="true">←</span>
        </Link>
        <span className="flex-1 text-[17px] font-bold">Weak-area practice</span>
      </div>
      {/* Desktop header (Practice.dc) */}
      <div className="mx-auto hidden max-w-[1280px] items-center gap-4 px-6 py-3 md:flex">
        <div className="flex flex-1 flex-col">
          <span className="text-base font-bold">Weak-area practice · {topics}</span>
          <span className="text-[13px] text-muted">Feedback after every question · doesn’t affect your scores</span>
        </div>
      </div>
    </header>
  );

  if (s.finished) {
    const sum = practiceSummary(s);
    const topic = dominantTopic(questions);
    return (
      <div className="flex min-h-[100dvh] flex-col bg-surface text-ink md:bg-page">
        {header}
        <main id="main-content" tabIndex={-1} className="flex flex-1 justify-center p-4 outline-none md:p-6">
          <div className="flex w-full max-w-[820px] flex-col gap-4 md:self-start md:rounded-card-lg md:border md:border-border md:bg-surface md:p-7">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand-hover">
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2" />
              </svg>
            </span>
            <h1 className="m-0 text-2xl">Practice finished</h1>
            <p className="m-0 text-base leading-[1.55] text-ink-2">
              You answered <strong className="text-ink">{sum.answered}</strong> {sum.answered === 1 ? 'question' : 'questions'} on {topics} and got <strong className="text-ink">{sum.right}</strong> right. Practice
              answers don’t change your mock test scores.
            </p>
            {topic && (
              <button
                type="button"
                onClick={() => more.startTopic(topic.id)}
                disabled={more.pending}
                className={buttonClasses({ variant: 'primary', size: 'lg', className: 'cursor-pointer' })}
              >
                Practise {questions.length} more
              </button>
            )}
            {more.error && (
              <p role="alert" className="m-0 text-sm font-semibold text-incorrect">
                {more.error}
              </p>
            )}
            <Link to={countryPath(slug, 'tests')} className={buttonClasses({ variant: 'neutral', size: 'sm', className: '!min-h-[48px] !px-[18px] !font-semibold' })}>
              Take a full mock test
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!q) return null;
  const checked = s.checked[q.id];
  const picked = s.picked[q.id] ?? [];
  const fb = checked ? feedbackFor(checked) : null;
  const ready = canCheck(s, q.id);
  const choose = q.multiple ? q.choose : null;

  return (
    <div className="flex h-[100dvh] flex-col bg-surface text-ink md:block md:h-auto md:min-h-screen md:bg-page">
      {header}
      <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 justify-center overflow-y-auto p-4 outline-none md:p-6">
        <div className="flex w-full max-w-[820px] flex-col gap-3.5 md:gap-4 md:self-start md:rounded-card-lg md:border md:border-border md:bg-surface md:p-7">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold text-muted">{q.topic.name} · practice</span>
              <h1 className="m-0 text-[19px]">
                Question {s.index + 1} of {questions.length}
              </h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {choose ? <ChooseBadge choose={choose} /> : null}
              {attempt.timer.untimed !== false && <span className="rounded-pill bg-soft px-2.5 py-1.5 text-[13px] font-bold text-ink-2">Untimed</span>}
            </div>
          </div>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-soft">
            <div className="h-1.5 bg-brand" style={{ width: `${practiceProgress(s.index, questions.length)}%` }} />
          </div>
          <p className="m-0 text-lg font-semibold leading-normal md:text-[22px]">
            {q.stem}
            {choose ? <strong className="font-bold"> Choose {choose}.</strong> : null}
          </p>
          <div role="group" aria-label={choose ? `Answer options, choose ${choose}` : 'Answer options'} className="flex flex-col gap-2.5">
            {q.options.map((o) => {
              const on = picked.includes(o.key);
              const tag = optionTag(checked, o.key, picked);
              const right = tag?.kind === 'right';
              const wrong = tag?.kind === 'wrong';
              return (
                <button
                  key={o.key}
                  type="button"
                  {...(q.multiple ? { role: 'checkbox', 'aria-checked': on } : { 'aria-pressed': on })}
                  aria-disabled={!!checked || undefined}
                  onClick={() => dispatch({ type: 'pick', question: q, key: o.key })}
                  className={cx(
                    'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left text-ink',
                    right ? 'border-2 border-correct bg-[#ECFDF5]' : wrong ? 'border-2 border-incorrect bg-[#FEF2F2]' : !checked && on ? 'border-2 border-brand bg-brand-softer' : 'border border-zinc-300 bg-surface',
                    checked && 'cursor-default',
                  )}
                >
                  {q.multiple ? (
                    <span
                      aria-hidden="true"
                      className={cx('inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] border-2 text-white', on ? 'border-brand bg-brand' : 'border-muted bg-surface')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: on ? 1 : 0 }}>
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    </span>
                  ) : (
                    <span
                      className={cx(
                        'inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-sm font-bold',
                        !checked && on ? 'bg-brand text-white' : 'bg-soft text-ink-2',
                      )}
                    >
                      {o.key}
                    </span>
                  )}
                  {q.multiple && <span className="w-[18px] font-bold text-ink-2">{o.key}</span>}
                  <span className="flex-1 text-base md:text-lg">{o.text}</span>
                  {tag && <span className={cx('text-[13px] font-bold', tag.kind === 'right' ? 'text-free' : 'text-red-800')}>{tag.text}</span>}
                </button>
              );
            })}
          </div>
          {q.multiple && !checked && (
            <p role="status" className={cx('m-0 text-sm font-semibold', s.blocked ? 'text-flagged-ink' : 'text-ink-2')}>
              {s.blocked
                ? `You’ve chosen ${choose}. Unselect one to change your answer.`
                : `${picked.length} of ${choose} chosen${picked.length > 0 && choose && picked.length < choose ? ` — choose ${choose - picked.length} more` : ''}`}
            </p>
          )}
          {fb && checked && (
            <div role="status" className={cx('flex flex-col gap-1.5 rounded-[14px] border px-4 py-3.5', FEEDBACK[fb.tone])}>
              <strong className="text-base">{fb.title}</strong>
              {checked.explanation && <p className="m-0 text-[15px] leading-[1.6] text-[#27272A]">{checked.explanation}</p>}
            </div>
          )}
          {error && (
            <p role="alert" className="m-0 rounded-control border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <button type="button" onClick={end} className="min-h-[48px] cursor-pointer border-0 bg-transparent px-1 text-[15px] font-semibold text-ink-2">
              End practice
            </button>
            {checked ? (
              <button type="button" onClick={next} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'cursor-pointer' })}>
                Next question
              </button>
            ) : (
              <button
                type="button"
                aria-disabled={!ready || undefined}
                aria-busy={check.isPending || undefined}
                onClick={() => ready && !check.isPending && check.mutate()}
                className={buttonClasses({ variant: 'primary', size: 'lg', className: cx('cursor-pointer', !ready && 'opacity-45') })}
              >
                Check answer
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
