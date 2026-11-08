import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Keyboard, Mic, Pause, Play, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isApiError, type StreamEvent } from '../../api/client';
import {
  beat, endSession, getSession, interviewKeys, pauseSession, resumeSession, sendAnswer, startSession,
  type InterviewClock, type InterviewSessionView,
} from '../../api/interviews';
import { Button, buttonClasses } from '../../components/Button';
import { Loader, QueryError } from '../../components/states';
import { cx } from '../../lib/cx';
import { errorMessage } from '../../lib/errorCatalogue';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { InterviewGate, muted } from './InterviewGate';
import { clock as mmss, KIND_LABEL, micErrorMessage, MODE_LABEL, takeSentences } from './interviewModel';
import { recordingSupported, useRecorder } from './useRecorder';
import { speechSupported, useSpeaker } from './useSpeaker';

/**
 * The live interview (distraction-free, outside the site chrome). The turn-taking runs here: the interviewer's
 * reply streams in and is spoken sentence by sentence, then the microphone records the answer until the candidate
 * stops talking, the answer is sent for transcription, and the next reply streams back. Time is measured by the
 * server; this screen only shows it and sends a heartbeat every 15 seconds.
 */
export function LiveInterviewPage() {
  useDocumentTitle('Interview');
  return (
    <InterviewGate>
      <LiveLoader />
    </InterviewGate>
  );
}

function LiveLoader() {
  const { sessionId = '' } = useParams();
  const q = useQuery({ queryKey: interviewKeys.session(sessionId), queryFn: () => getSession(sessionId), staleTime: Infinity, retry: false });
  if (q.isError) return <div className="p-6"><QueryError error={q.error} what="the interview" onRetry={() => void q.refetch()} retrying={q.isFetching} /></div>;
  if (!q.data) return <div className="p-6"><Loader label="Loading the interview…" /></div>;
  return <Live initial={q.data} />;
}

type Phase = 'intro' | 'thinking' | 'speaking' | 'listening' | 'silent' | 'sending' | 'paused' | 'ending' | 'error';

const HEARTBEAT_MS = 15_000;
const SORRY = "Sorry, I didn't catch that. Could you say it again?";

function Live({ initial }: { initial: InterviewSessionView }) {
  const slug = useActiveCountrySlug();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const id = initial.id;
  const recorder = useRecorder();
  const speaker = useSpeaker(speechSupported());
  const lastInterviewer = [...initial.transcript].reverse().find((t) => t.role === 'INTERVIEWER')?.text ?? '';

  const [phase, setPhase] = useState<Phase>(initial.status === 'ENDED' || initial.status === 'EVALUATED' ? 'ending' : 'intro');
  const [caption, setCaption] = useState(lastInterviewer);
  const [heard, setHeard] = useState('');
  const [typed, setTyped] = useState(!recordingSupported());
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(!recordingSupported() ? 'Your browser cannot record audio here, so you will type your answers.' : null);
  const [error, setError] = useState<{ message: string; retry: (() => void) | null; buy?: boolean } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [clockState, setClockState] = useState<{ c: InterviewClock; at: number }>({
    c: { activeSeconds: initial.activeSeconds, remainingSeconds: initial.remainingSeconds, sessionLeftSeconds: initial.durationMinutes * 60 - initial.activeSeconds, wrapUp: false, timeUp: false },
    at: Date.now(),
  });
  const [, force] = useState(0);

  const alive = useRef(true);
  const stopped = useRef(false); // paused or ending: ignore the answer being recorded
  const typedRef = useRef(typed);
  typedRef.current = typed;
  /** `next` (defined after `answer`, which calls it): read through a ref so the two can refer to each other. */
  const nextRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    // Set on mount too: StrictMode mounts, unmounts and mounts again in development.
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const finish = useCallback(() => {
    stopped.current = true;
    recorder.close();
    speaker.cancel();
    setPhase('ending');
    void qc.invalidateQueries({ queryKey: interviewKeys.all });
    navigate(countryPath(slug, 'interview', 'sessions', id), { replace: true });
  }, [id, navigate, qc, recorder, slug, speaker]);

  const takeClock = (data: object) => {
    const c = data as Partial<InterviewClock>;
    if (typeof c.activeSeconds === 'number') setClockState({ c: c as InterviewClock, at: Date.now() });
  };

  /** Run one streamed interviewer reply: show and speak it as it arrives; resolves once it has been spoken. */
  const interviewerSays = useCallback(async (run: (onEvent: (e: StreamEvent) => void) => Promise<void>) => {
    setPhase('thinking');
    let buffer = '';
    let text = '';
    let ended = false;
    let unclear = false;
    let started = false;
    await run((e) => {
      if (e.event === 'transcript') setHeard(String(e.data.text ?? ''));
      if (e.event === 'delta') {
        if (!started) { started = true; text = ''; }
        text += String(e.data.text ?? '');
        setCaption(text);
        buffer += String(e.data.text ?? '');
        const { sentences, rest } = takeSentences(buffer);
        buffer = rest;
        if (sentences.length) setPhase('speaking');
        sentences.forEach(speaker.say);
      }
      if (e.event === 'done') {
        ended = e.data.ended === true;
        unclear = e.data.unclear === true;
        takeClock(e.data);
      }
    });
    speaker.say(buffer);
    if (unclear) { setCaption(SORRY); speaker.say(SORRY); }
    if (speechSupported()) {
      setPhase('speaking');
      // The candidate may start answering before the interviewer has finished: stop talking and listen.
      const stopWatch = typedRef.current ? () => {} : recorder.watchBargeIn(() => speaker.cancel());
      await speaker.whenDone();
      stopWatch();
    }
    return { ended };
  }, [recorder, speaker]);

  const fail = useCallback((e: unknown, retry: (() => void) | null) => {
    if (!alive.current) return;
    if (isApiError(e) && (e.code === 'interview_not_active' || e.code === 'interview_already_started')) return finish();
    setError({ message: errorMessage(e), retry, buy: isApiError(e) && e.code === 'insufficient_minutes' });
    setPhase('error');
  }, [finish]);

  /** Send one answer (a recording or typed text) and play the reply; retried twice if the network drops before it starts. */
  const answer = useCallback(async (payload: Blob | string) => {
    setPhase('sending');
    setHeard(typeof payload === 'string' ? payload : '');
    setError(null);
    let attempt = 0;
    for (;;) {
      let got = false;
      try {
        const { ended } = await interviewerSays((on) => sendAnswer(id, payload, (e) => { got = true; on(e); }));
        if (!alive.current || stopped.current) return;
        if (ended) return finish();
        void nextRef.current();
        return;
      } catch (e) {
        if (isApiError(e) && e.isNetwork && !got && attempt < 2) { attempt += 1; await new Promise((r) => setTimeout(r, 1500 * attempt)); continue; }
        return fail(e, () => void answer(payload));
      }
    }
  }, [fail, finish, id, interviewerSays]);

  /** Wait for the next answer: record it, or let the candidate type it. */
  const next = useCallback(async () => {
    if (!alive.current || stopped.current) return;
    setPhase('listening');
    if (typedRef.current) return; // the typed form sends it
    try {
      const a = await recorder.listen();
      if (!alive.current || stopped.current || typedRef.current) return;
      if (!a.spoke) return setPhase('silent');
      void answer(a.blob);
    } catch (e) {
      setTyped(true);
      setNotice(micErrorMessage(e));
    }
  }, [answer, recorder]);
  nextRef.current = next;

  /** "Start the interview" (a click, so the browser allows the microphone and speech). */
  const begin = async () => {
    setError(null);
    stopped.current = false;
    if (!typedRef.current) {
      try {
        await recorder.open();
      } catch (e) {
        setTyped(true);
        typedRef.current = true;
        setNotice(micErrorMessage(e));
      }
    }
    try {
      if (initial.status === 'READY') {
        const { ended } = await interviewerSays((on) => startSession(id, on));
        if (ended) return finish();
      } else {
        if (initial.status === 'PAUSED') takeClock(await resumeSession(id));
        if (lastInterviewer) { setCaption(lastInterviewer); speaker.say(lastInterviewer); await speaker.whenDone(); }
      }
      void next();
    } catch (e) {
      fail(e, () => void begin());
    }
  };

  const pause = async () => {
    stopped.current = true;
    recorder.done();
    speaker.cancel();
    try {
      takeClock(await pauseSession(id));
      setPhase('paused');
    } catch (e) {
      fail(e, null);
    }
  };
  const resume = async () => {
    try {
      takeClock(await resumeSession(id));
      stopped.current = false;
      void next();
    } catch (e) {
      fail(e, null);
    }
  };
  const end = async () => {
    stopped.current = true;
    recorder.done();
    speaker.cancel();
    try {
      await endSession(id);
    } finally {
      finish();
    }
  };

  const switchToTyping = () => {
    setTyped(true);
    typedRef.current = true;
    recorder.done();
    setPhase('listening');
  };
  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    void answer(t);
  };

  // Heartbeat while the interview runs; the server ends it when time or minutes run out.
  const running = phase !== 'intro' && phase !== 'paused' && phase !== 'ending' && phase !== 'error';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      beat(id).then((r) => { takeClock(r); if (r.status !== 'ACTIVE') finish(); }).catch(() => { /* the next beat or turn will tell */ });
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [running, id, finish]);
  // The visible clock ticks locally between server updates.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const drift = running ? Math.floor((Date.now() - clockState.at) / 1000) : 0;
  const elapsed = clockState.c.activeSeconds + drift;
  const left = Math.max(0, initial.durationMinutes * 60 - elapsed);
  const status: Record<Phase, string> = {
    intro: 'Ready when you are',
    thinking: 'The interviewer is thinking…',
    speaking: 'The interviewer is speaking',
    listening: typed ? 'Type your answer' : 'Listening… answer when you are ready',
    silent: 'We did not hear anything',
    sending: 'Sending your answer…',
    paused: 'Paused: the clock is stopped',
    ending: 'Ending the interview…',
    error: 'Something went wrong',
  };

  return (
    <div className="flex min-h-screen flex-col bg-page dark:bg-night-page">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 dark:border-night-border dark:bg-night-surface">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold text-heading dark:text-night-heading">{initial.job.title}</span>
          <span className={cx('text-xs', muted)}>{MODE_LABEL[initial.mode]} · {KIND_LABEL[initial.kind]} · {initial.durationMinutes} min</span>
        </span>
        <span className={cx('rounded-control px-2.5 py-1 font-mono text-[15px] font-semibold tabular', left <= 60 ? 'bg-flagged-bg text-flagged-ink' : 'bg-soft text-ink dark:bg-night-soft dark:text-night-ink')} aria-label={`${mmss(left)} left`}>
          {mmss(left)}
        </span>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-5 px-4 py-6 outline-none">
        <section aria-live="polite" className="flex flex-col items-center gap-4 rounded-card-lg border border-border bg-surface px-5 py-8 text-center dark:border-night-border dark:bg-night-surface">
          <Orb phase={phase} level={recorder.level} />
          <p className={cx('m-0 text-sm font-semibold', muted)} role="status">{status[phase]}</p>
          {caption && phase !== 'intro' && <p className="m-0 max-w-[560px] text-[18px] leading-relaxed text-heading dark:text-night-heading">{caption}</p>}
          {phase === 'intro' && (
            <div className="flex max-w-[480px] flex-col items-center gap-3">
              <p className="m-0 text-[16px] leading-relaxed text-ink-2 dark:text-night-ink">
                {initial.status === 'READY'
                  ? 'The interviewer will greet you and ask the first question. Answer out loud; when you stop talking, your answer is sent. Only the time in the interview uses minutes.'
                  : 'Your interview is waiting where you left it.'}
              </p>
              <Button size="lg" onClick={() => void begin()}>
                <Play size={18} aria-hidden="true" /> {initial.status === 'READY' ? 'Start the interview' : 'Continue the interview'}
              </Button>
            </div>
          )}
        </section>

        {heard && (phase === 'sending' || phase === 'thinking' || phase === 'speaking') && (
          <section aria-label="Your answer" className="rounded-card border border-border bg-soft px-4 py-3 dark:border-night-border dark:bg-night-soft">
            <p className={cx('m-0 mb-1 text-xs font-semibold uppercase tracking-[0.06em]', muted)}>You said</p>
            <p className="m-0 text-[15px] text-ink dark:text-night-ink">{heard}</p>
          </section>
        )}

        {notice && <p className="m-0 rounded-control bg-flagged-bg p-3 text-sm font-semibold text-flagged-ink">{notice}</p>}

        {phase === 'silent' && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void next()}><Mic size={18} aria-hidden="true" /> Answer now</Button>
            <Button variant="neutral" onClick={switchToTyping}><Keyboard size={18} aria-hidden="true" /> Type instead</Button>
          </div>
        )}

        {phase === 'listening' && !typed && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => recorder.done()}><Square size={16} aria-hidden="true" /> Done answering</Button>
            <Button variant="ghost" onClick={switchToTyping}><Keyboard size={18} aria-hidden="true" /> Type instead</Button>
          </div>
        )}

        {phase === 'listening' && typed && (
          <form onSubmit={submitTyped} className="flex flex-col gap-2">
            <label htmlFor="typed-answer" className="text-sm font-semibold">Your answer</label>
            <textarea
              id="typed-answer"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              maxLength={4000}
              className="w-full rounded-control border border-input-border bg-surface p-3 text-[16px] text-ink dark:border-night-border dark:bg-night-surface dark:text-night-ink"
            />
            <Button type="submit" disabled={!draft.trim()}>Send answer</Button>
          </form>
        )}

        {phase === 'error' && error && (
          <section role="alert" className="flex flex-col gap-3 rounded-card border border-incorrect-line bg-incorrect-bg p-4">
            <p className="m-0 text-[15px] font-semibold text-incorrect">{error.message}</p>
            <div className="flex flex-wrap gap-2">
              {error.retry && <Button onClick={() => { setError(null); error.retry!(); }}>Try again</Button>}
              {error.buy && <Link to={`${countryPath(slug, 'checkout')}?plan=interview&from=interview`} className={buttonClasses({ variant: 'primary' })}>Get more minutes</Link>}
              <Link to={countryPath(slug, 'interview')} className={buttonClasses({ variant: 'neutral' })}>Back to interview preparation</Link>
            </div>
          </section>
        )}

        {phase !== 'intro' && phase !== 'ending' && (
          <div className="mt-auto flex flex-wrap items-center justify-center gap-2 pt-4">
            {phase === 'paused' ? (
              <Button onClick={() => void resume()}><Play size={16} aria-hidden="true" /> Resume</Button>
            ) : (
              <Button variant="neutral" onClick={() => void pause()} disabled={phase === 'sending' || phase === 'thinking'}>
                <Pause size={16} aria-hidden="true" /> Pause
              </Button>
            )}
            {confirmEnd ? (
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold">End the interview and get feedback?</span>
                <Button variant="final" onClick={() => void end()}>End now</Button>
                <Button variant="plain" onClick={() => setConfirmEnd(false)}>Keep going</Button>
              </span>
            ) : (
              <Button variant="neutral" onClick={() => setConfirmEnd(true)}>End interview</Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/** The interviewer "presence": pulses while speaking, follows the mic level while listening. */
function Orb({ phase, level }: { phase: Phase; level: number }) {
  const listening = phase === 'listening';
  const scale = listening ? 1 + level * 0.35 : 1;
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex h-24 w-24 items-center justify-center rounded-full transition-transform duration-100',
        listening ? 'bg-correct-bg text-correct' : 'bg-brand-soft text-brand dark:bg-night-brand-soft dark:text-night-brand',
        (phase === 'speaking' || phase === 'thinking') && 'animate-pulse',
      )}
      style={{ transform: `scale(${scale})` }}
    >
      <Mic size={36} />
    </span>
  );
}
