import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { attemptKeys, getAttempt, getAttemptTimer } from '../../api/attempts';
import { ApiError } from '../../api/client';
import type { AttemptState } from '../../api/types';
import { LogoMark } from '../../components/Logo';
import { cx } from '../../lib/cx';
import { readStorage, writeStorage } from '../../lib/storage';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { countryPath } from '../country/hooks';
import { CasePanel } from './CasePanel';
import {
  caseFor, casePosition, cellState, countsOf, firstUnansweredIndex, marksLabel, pickOption, progressPercent, savedLabel,
} from './examModel';
import { AnswerOptions, CheckIcon, ChooseBadge, ClockIcon, FlagButton, NavCell, NavigatorAside, NavSheet, OfflineBanner, OnlineBanner, SubmitDialog } from './ExamParts';
import type { LocalAnswers } from './queue';
import type { SaveEngine } from './saveEngine';
import { TimeUpDialog, TimeUpScreen } from './TimeUpScreen';
import { formatClock, isLow } from './timer';
import { useExamTimer } from './useExamTimer';
import { translationNote, useT } from '../../lib/i18n';

const idxKey = (id: string) => `jobprep.exam.index.${id}`;

function readIndex(id: string, max: number, fallback: number): number {
  const raw = readStorage(idxKey(id));
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n < max ? n : fallback;
}

interface Props {
  state: AttemptState;
  engine: SaveEngine;
  initialAnswers: LocalAnswers;
  slug: string;
}

/** The exam screen: header, question, options, navigator, submit dialog, offline banner, time-up. */
export function ExamRunner({ state, engine, initialAnswers, slug }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { questions, cases } = state;
  const attemptId = state.attempt.id;
  useDocumentTitle(state.attempt.mockTest.title);

  const [answers, setAnswers] = useState<LocalAnswers>(initialAnswers);
  const [idx, setIdx] = useState(() => {
    const fu = firstUnansweredIndex(questions, initialAnswers);
    return readIndex(attemptId, questions.length, fu >= 0 ? fu : 0);
  });
  const [dialog, setDialog] = useState<null | 'nav' | 'confirm'>(null);
  const [view, setView] = useState<'question' | 'case'>('question');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ended, setEnded] = useState<null | { answered: number; total: number }>(null);
  /** The question whose last pick was refused because "Choose N" was reached ("Unselect one to change"). */
  const [blockedId, setBlockedId] = useState<string | null>(null);
  /** "Back online. Your N waiting answers are saved." (desktop) for a few seconds after the queue drained. */
  const [backOnline, setBackOnline] = useState<number | null>(null);
  const desktop = useIsDesktop();

  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const resultsTo = countryPath(slug, 'results', attemptId);
  const peakWaiting = useRef(0);
  useEffect(() => {
    if (snap.waiting && snap.pending > 0) {
      peakWaiting.current = Math.max(peakWaiting.current, snap.pending);
      return;
    }
    if (peakWaiting.current > 0 && snap.pending === 0) {
      setBackOnline(peakWaiting.current);
      peakWaiting.current = 0;
      const id = setTimeout(() => setBackOnline(null), 8000);
      return () => clearTimeout(id);
    }
  }, [snap.waiting, snap.pending]);

  const q = questions[idx];
  const counts = useMemo(() => countsOf(questions, answers), [questions, answers]);
  const kase = caseFor(q, cases);

  useEffect(() => {
    writeStorage(idxKey(attemptId), String(idx));
  }, [attemptId, idx]);

  // Connection events drive the queue (the banner itself follows the engine's connection state).
  useEffect(() => {
    const online = () => engine.notifyOnline();
    const offline = () => engine.notifyOffline();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const hide = () => engine.flushOnHide();
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [engine]);

  const finishWithTimeUp = useCallback(async () => {
    // The attempt closed on the server: push any last queued answers (the server still takes ones made in time),
    // then read the final counts so the screen says exactly what was kept.
    setDialog(null);
    try {
      await engine.flushNow();
    } catch {
      /* the server decides what it keeps */
    }
    try {
      const fresh = await getAttempt(attemptId);
      setEnded({ answered: fresh.counts.answered, total: fresh.counts.total });
    } catch {
      setEnded({ answered: countsOf(questions, answers).answered, total: questions.length });
    }
    void qc.invalidateQueries({ queryKey: attemptKeys.inProgress });
  }, [attemptId, answers, engine, qc, questions]);

  const timer = useExamTimer({
    initial: state.timer,
    fetchTimer: () => getAttemptTimer(attemptId),
    onExpired: (status) => {
      if (status === 'SUBMITTED') navigate(resultsTo, { replace: true });
      else void finishWithTimeUp();
    },
  });

  // A late save answer can also say the attempt is over (another device, or the sweeper got there first).
  useEffect(() => {
    engine.setCallbacks({
      onStatus: (status) => {
        if (status === 'AUTO_SUBMITTED') void finishWithTimeUp();
      },
      onClosed: () => void finishWithTimeUp(),
    });
  }, [engine, finishWithTimeUp]);

  useEffect(() => {
    engine.attach();
    return () => engine.destroy();
  }, [engine]);

  const t = useT();

  // Time is up: phones get the full-screen message (TimeUp.dc); desktops keep the exam in view, dimmed, behind a dialog (TimeUpDesktop.dc).
  if (ended && !desktop) return <TimeUpScreen answered={ended.answered} total={ended.total} resultsTo={resultsTo} />;
  if (!q) return null;

  const frozen = !!ended;
  const clock = frozen ? formatClock(0) : formatClock(timer.seconds);
  const low = !frozen && isLow(timer.seconds);
  const label = frozen ? { waiting: false, text: 'Submitted' } : savedLabel(snap);
  const offline = !frozen && snap.connection === 'offline';
  const selected = answers[q.id]?.selected ?? [];
  const flagged = !!answers[q.id]?.flagged;
  const first = idx === 0;
  const last = idx === questions.length - 1;

  const go = (i: number) => {
    setIdx(Math.max(0, Math.min(questions.length - 1, i)));
    setView('question');
    setDialog(null);
  };
  const pick = (key: string) => {
    if (frozen) return;
    const { selected: next, blocked } = pickOption(q, selected, key);
    setBlockedId(blocked ? q.id : null);
    if (next.length === selected.length && next.every((k, i) => k === selected[i])) return;
    setAnswers((a) => ({ ...a, [q.id]: { selected: next, flagged: a[q.id]?.flagged ?? false } }));
    engine.enqueue({ questionId: q.id, selected: next });
  };
  const toggleFlag = () => {
    const next = !flagged;
    setAnswers((a) => ({ ...a, [q.id]: { selected: a[q.id]?.selected ?? [], flagged: next } }));
    engine.enqueue({ questionId: q.id, flagged: next });
  };
  const onNext = () => (last ? setDialog('confirm') : go(idx + 1));
  const goUnanswered = () => {
    const i = firstUnansweredIndex(questions, answers);
    go(i >= 0 ? i : 0);
  };
  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await engine.submit();
      void qc.invalidateQueries({ queryKey: attemptKeys.inProgress });
      if (res.autoSubmitted) setEnded({ answered: res.counts.answered, total: res.counts.total });
      else navigate(resultsTo, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'attempt_closed' || e.status === 404)) navigate(resultsTo, { replace: true });
      else setSubmitError('We could not submit your exam. Check your internet connection and try again. Your answers are saved on this device.');
    } finally {
      setSubmitting(false);
    }
  };

  const pos = kase ? casePosition(q, kase) : null;
  const note = translationNote(state.language);

  const page = (
    <div className="flex h-[100dvh] flex-col bg-surface text-ink md:block md:h-auto md:min-h-screen md:bg-page" {...(frozen ? { 'aria-hidden': true } : {})}>
      {offline && <OfflineBanner />}
      {backOnline !== null && !offline && !frozen && <OnlineBanner saved={backOnline} />}
      {note && (
        <p role="note" data-testid="translation-note" className="m-0 bg-soft px-4 py-2 text-center text-[13px] font-semibold text-ink-2 md:text-sm">
          {note === 'english_only' ? t('language.englishOnly') : t('language.partlyTranslated')}
        </p>
      )}

      <header className="shrink-0 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-2.5 px-4 pb-2.5 pt-3.5 md:flex-row md:flex-wrap md:items-center md:gap-x-6 md:gap-y-3 md:px-6 md:py-3">
          <div className="flex items-center gap-2.5 md:contents">
            <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-[1_1_320px]">
              {!kase && (
                <span className="hidden md:inline-flex">
                  <LogoMark size={30} />
                </span>
              )}
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] text-muted md:text-base md:font-semibold md:text-ink">{state.attempt.mockTest.title}</span>
                <span
                  role="status"
                  className={cx(
                    'flex items-center gap-1.5 text-xs font-semibold md:text-[13px] md:font-normal',
                    label.waiting ? 'text-flagged-ink' : 'text-correct',
                  )}
                >
                  {!label.waiting && <CheckIcon size={14} />}
                  {label.waiting ? (
                    label.text
                  ) : (
                    <>
                      <span className="md:hidden">Saved</span>
                      <span className="hidden md:inline">{label.text}</span>
                    </>
                  )}
                </span>
              </div>
            </div>
            <div
              role="timer"
              aria-label="Time remaining"
              data-low={low || undefined}
              className={cx(
                'flex items-center gap-2 rounded-[10px] px-3 py-2 text-lg font-semibold tabular md:rounded-control md:px-3.5 md:text-[22px] md:font-bold',
                low ? 'bg-incorrect-bg text-incorrect' : 'bg-soft text-ink',
              )}
            >
              <span className="hidden md:inline-flex">
                <ClockIcon />
              </span>
              <span>{clock}</span>
            </div>
            {frozen ? (
              <span className="hidden min-h-[44px] items-center rounded-control bg-disabled px-[18px] text-[15px] font-semibold text-white md:inline-flex">Submit exam</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSubmitError(null);
                  setDialog('confirm');
                }}
                className={cx(
                  'min-h-[44px] cursor-pointer rounded-[10px] border border-dark bg-dark px-3 text-sm font-semibold text-white md:inline-flex md:items-center md:rounded-control md:px-[18px] md:text-[15px]',
                  offline ? 'hidden' : 'inline-flex items-center',
                )}
              >
                <span className="md:hidden">Submit</span>
                <span className="hidden md:inline">Submit exam</span>
              </button>
            )}
          </div>
          {kase && (
            <div role="group" aria-label="View" className="grid grid-cols-2 rounded-control bg-soft p-1 md:hidden">
              {(['question', 'case'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cx(
                    'min-h-[42px] cursor-pointer rounded-[9px] border-0 text-[15px] font-semibold',
                    view === v ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(20,30,50,0.15)]' : 'bg-transparent text-ink-2',
                  )}
                >
                  {v === 'question' ? 'Question' : 'Case study'}
                </button>
              ))}
            </div>
          )}
          {!kase && (
            <div aria-hidden="true" className="h-1 overflow-hidden rounded-pill bg-soft md:hidden">
              <div className="h-1 bg-brand" style={{ width: `${progressPercent(counts)}%` }} />
            </div>
          )}
        </div>
      </header>

      <div
        className={cx(
          'flex min-h-0 flex-1 flex-col md:mx-auto md:w-full md:flex-row md:flex-wrap md:p-6',
          kase ? 'md:max-w-[1320px] md:items-stretch md:gap-5' : 'md:max-w-[1280px] md:items-start md:gap-6',
        )}
      >
        {kase && <CasePanel c={kase} className={view === 'case' ? 'flex flex-1' : 'hidden md:flex'} />}

        {(view === 'question' || !kase) && (
          <main
            id="main-content"
            tabIndex={-1}
            className={cx(
              'flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-[18px] outline-none md:flex-[999_1_600px] md:gap-[22px] md:overflow-visible md:rounded-card md:border md:border-border md:bg-surface md:p-7',
              kase && 'md:flex-[1_1_520px] md:gap-[18px] md:p-6',
            )}
          >
            <div className="flex items-center justify-between gap-2 md:flex-wrap md:gap-2.5">
              <div className="flex flex-col md:gap-0">
                <span className="text-[13px] font-semibold text-muted md:text-sm">
                  {pos ? (
                    <>
                      Case question {pos.index} of {pos.total}
                      <span className="md:hidden"> · {marksLabel(q.marks)}</span>
                      <span className="hidden md:inline"> · {q.topic.name}</span>
                    </>
                  ) : (
                    q.topic.name
                  )}
                </span>
                <h1 className="m-0 text-[17px] font-bold md:text-xl">
                  Question {q.number} of {questions.length}
                  {pos && <span className="hidden text-[15px] font-semibold text-muted md:inline"> · {marksLabel(q.marks)}</span>}
                </h1>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {q.multiple && q.choose ? <ChooseBadge choose={q.choose} /> : null}
                <FlagButton flagged={flagged} onToggle={toggleFlag} />
              </div>
            </div>

            {!kase && (
              <div aria-hidden="true" className="hidden h-1.5 overflow-hidden rounded-pill bg-soft md:block">
                <div className="h-1.5 rounded-pill bg-brand" style={{ width: `${progressPercent(counts)}%` }} />
              </div>
            )}

            {kase && (
              <div role="group" aria-label="Case questions" className="hidden flex-wrap gap-1.5 md:flex">
                {kase.questionNumbers.map((n) => {
                  const cq = questions.find((x) => x.number === n);
                  if (!cq) return null;
                  const cell = cellState(cq, answers, q.id, true);
                  return (
                    <NavCell key={n} cell={cell} onGo={() => go(n - 1)} size="aside" className="w-11" />
                  );
                })}
              </div>
            )}

            {kase && (
              <button
                type="button"
                onClick={() => setView('case')}
                className="flex min-h-[48px] cursor-pointer items-center gap-2.5 rounded-control border border-brand-light bg-brand-softer px-3 py-2.5 text-left text-sm font-semibold text-brand md:hidden"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h12l4 4v12H4z M8 12h8 M8 16h5" />
                </svg>
                Based on: {kase.title.split(',')[0]} case
              </button>
            )}

            <p className={cx('m-0 text-[19px] font-semibold leading-normal md:max-w-[40em] md:text-[22px]', kase && 'text-[18px] md:text-[21px]')}>{q.stem}
              {q.multiple && q.choose ? <strong className="font-semibold"> Choose {q.choose}.</strong> : null}
            </p>

            <AnswerOptions question={q} selected={selected} onPick={pick} numeric={!!kase} blocked={blockedId === q.id} disabled={frozen} />

            {offline && <p className="m-0 text-[13px] text-muted md:hidden">The timer keeps running while offline, exactly as it would in the exam room.</p>}

            <div className="mt-auto hidden flex-wrap justify-between gap-3 border-t border-border pt-2 md:flex">
              <button
                type="button"
                onClick={() => go(idx - 1)}
                disabled={first}
                className="min-h-[44px] cursor-pointer rounded-control border border-input-border bg-surface px-5 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={onNext}
                className="min-h-[44px] cursor-pointer rounded-control border border-brand bg-brand px-6 text-base font-semibold text-white hover:bg-brand-hover"
              >
                {last ? 'Finish' : 'Next →'}
              </button>
            </div>
          </main>
        )}

        {!kase && (
          <div className="hidden md:contents">
            <NavigatorAside questions={questions} answers={answers} currentId={q.id} counts={counts} onGo={go} waitingIds={offline ? snap.pendingIds : []} />
          </div>
        )}
      </div>

      {/* Phone controls. In the case view they become "Back to question N". */}
      {kase && view === 'case' ? (
        <div className="shrink-0 border-t border-border px-3 pb-3.5 pt-2.5 md:hidden">
          <button
            type="button"
            onClick={() => setView('question')}
            className="min-h-[48px] w-full cursor-pointer rounded-control border-0 bg-brand text-base font-semibold text-white"
          >
            Back to question {q.number}
          </button>
        </div>
      ) : (
        <nav aria-label="Question controls" className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-3 pb-3.5 pt-2.5 md:hidden">
          <button
            type="button"
            onClick={() => go(idx - 1)}
            disabled={first}
            aria-label="Previous question"
            className="h-12 w-[52px] cursor-pointer rounded-control border border-input-border bg-surface text-xl text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            onClick={() => setDialog('nav')}
            className="h-12 flex-1 cursor-pointer rounded-control border border-border bg-soft text-[15px] font-semibold text-ink"
          >
            All questions · {counts.answered}/{counts.total}
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next question"
            className="h-12 w-[84px] cursor-pointer rounded-control border border-brand bg-brand text-base font-semibold text-white"
          >
            Next
          </button>
        </nav>
      )}

      <NavSheet open={dialog === 'nav'} onClose={() => setDialog(null)} questions={questions} answers={answers} currentId={q.id} counts={counts} onGo={go} />
      <SubmitDialog
        open={dialog === 'confirm'}
        onClose={() => setDialog(null)}
        counts={counts}
        clock={clock}
        onGoUnanswered={goUnanswered}
        onSubmit={() => void submit()}
        submitting={submitting}
        error={submitError}
      />
    </div>
  );

  if (frozen && ended) {
    return (
      <>
        {page}
        <TimeUpDialog answered={ended.answered} total={ended.total} resultsTo={resultsTo} />
      </>
    );
  }
  return page;
}
