import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  deleteSession, getSession, interviewKeys, practiceWeakAreas, retryEvaluation,
  type InterviewReport, type InterviewSessionView, type ScoreLine,
} from '../../api/interviews';
import { Button, buttonClasses } from '../../components/Button';
import { Loader, QueryError } from '../../components/states';
import { cx } from '../../lib/cx';
import { errorMessage } from '../../lib/errorCatalogue';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { card, heading, InterviewGate, InterviewPage, muted } from './InterviewGate';
import { ScorePill } from './InterviewHomePage';
import { durationLabel, endReasonText, KIND_LABEL, MODE_LABEL, scoreTone, signedPercent } from './interviewModel';

/** After the interview: the score, the rubric, every question's feedback, the transcript, and practice on weak areas. */
export function InterviewReportPage() {
  useDocumentTitle('Interview feedback');
  return (
    <InterviewGate>
      <Report />
    </InterviewGate>
  );
}

function Report() {
  const { sessionId = '' } = useParams();
  const q = useQuery({
    queryKey: interviewKeys.session(sessionId),
    queryFn: () => getSession(sessionId),
    staleTime: 0,
    // The evaluation runs on the server after the interview: ask again until it is ready.
    refetchInterval: (query) => (query.state.data?.status === 'ENDED' ? 2500 : false),
  });
  if (q.isError) return <InterviewPage><QueryError error={q.error} what="the interview" onRetry={() => void q.refetch()} retrying={q.isFetching} /></InterviewPage>;
  if (!q.data) return <InterviewPage><Loader label="Loading the interview…" /></InterviewPage>;
  return <ReportView s={q.data} />;
}

function ReportView({ s }: { s: InterviewSessionView }) {
  const slug = useActiveCountrySlug();
  const [tab, setTab] = useState<'feedback' | 'transcript'>('feedback');
  const r = s.report;
  const reason = endReasonText(s.endReason);
  return (
    <InterviewPage>
      <Link to={countryPath(slug, 'interview')} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold">
        <ArrowLeft size={16} aria-hidden="true" /> Interview preparation
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className={cx('m-0 text-[26px] font-bold tracking-tight', heading)}>Interview performance</h1>
        <p className={cx('m-0 text-[15px]', muted)}>
          {s.job.title} · {durationLabel(s.activeSeconds)} · {MODE_LABEL[s.mode]} · {KIND_LABEL[s.kind]} · {formatDate(s.createdAt, true)}
        </p>
        {reason && <p className={cx('m-0 text-sm', muted)}>{reason}</p>}
      </header>

      <div role="tablist" aria-label="Report sections" className="flex gap-2">
        {(['feedback', 'transcript'] as const).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cx('min-h-[40px] cursor-pointer rounded-pill px-4 text-sm font-semibold', tab === t ? 'border-0 bg-brand text-white' : 'border border-border-strong bg-surface text-ink dark:border-night-border dark:bg-night-surface dark:text-night-ink')}>
            {t === 'feedback' ? 'Feedback' : 'Transcript'}
          </button>
        ))}
      </div>

      {tab === 'transcript' ? (
        <Transcript s={s} />
      ) : s.status === 'ENDED' || s.status === 'ACTIVE' || s.status === 'PAUSED' || s.status === 'READY' ? (
        <section className={cx(card, 'flex flex-col items-center gap-2 py-10 text-center')} role="status">
          <Loader label="Preparing your feedback…" />
          <p className={cx('m-0 max-w-[420px] text-[15px]', muted)}>We are reviewing each of your answers against the job's requirements. This usually takes under a minute.</p>
        </section>
      ) : s.status === 'FAILED' || !r ? (
        <EvaluationFailed id={s.id} />
      ) : (
        <Feedback s={s} r={r} />
      )}

      <DeleteInterview id={s.id} />
    </InterviewPage>
  );
}

const BAR = { good: 'bg-correct', mid: 'bg-flagged', low: 'bg-incorrect', none: 'bg-border' } as const;

function Bars({ lines }: { lines: ScoreLine[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {lines.map((l) => (
        <li key={l.key} className="flex flex-col gap-1">
          <span className="flex justify-between gap-2 text-[15px]">
            <span className="font-medium">{l.label}</span>
            <span className="font-bold tabular">
              {l.score}%{l.change !== null && <span className={cx('ml-1.5 text-xs font-semibold', l.change >= 0 ? 'text-correct' : 'text-incorrect')}>{signedPercent(l.change)}</span>}
            </span>
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-soft dark:bg-night-soft" aria-hidden="true">
            <span className={cx('block h-full rounded-full', BAR[scoreTone(l.score)])} style={{ width: `${l.score}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Feedback({ s, r }: { s: InterviewSessionView; r: InterviewReport }) {
  const slug = useActiveCountrySlug();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const practice = useMutation({
    mutationFn: () => practiceWeakAreas(s.id, { mode: 'PRACTICE', durationMinutes: 15 }),
    onSuccess: (n) => { void qc.invalidateQueries({ queryKey: interviewKeys.all }); navigate(countryPath(slug, 'interview-live', n.id)); },
  });
  if (r.insufficient) {
    return (
      <section className={cx(card, 'flex flex-col gap-3')}>
        <h2 className={cx('m-0 text-xl font-bold', heading)}>{r.headline}</h2>
        {r.improvements.map((i) => <p key={i.title} className="m-0 text-[15px]">{i.detail}</p>)}
        <Link to={countryPath(slug, 'interview', 'jobs', s.job.id)} className={buttonClasses({ variant: 'primary', className: 'self-start' })}>Try this interview again</Link>
      </section>
    );
  }
  return (
    <>
      <section className={cx(card, 'flex flex-col gap-5 md:flex-row md:items-start')}>
        <div className="flex flex-col items-center gap-1 md:w-[180px] md:flex-none">
          <strong className={cx('text-[52px] font-extrabold leading-none', heading)}>{r.overallScore}<span className="text-2xl">/100</span></strong>
          <span className="text-base font-semibold">{r.headline}</span>
          {r.previous?.overallScore != null && r.overallScore != null && (
            <span className={cx('text-sm font-semibold', r.overallScore >= r.previous.overallScore ? 'text-correct' : 'text-incorrect')}>
              {signedPercent(r.overallScore - r.previous.overallScore)} since last time
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1"><Bars lines={r.rubric} /></div>
      </section>
      <p className={cx('m-0 text-[13px]', muted)}>Coaching feedback on this practice interview, not a prediction of whether you will be hired.</p>

      {r.comparison && <section className={cx(card, 'text-[15px]')}><strong>Compared with last time: </strong>{r.comparison}</section>}

      {r.improvements.length > 0 && (
        <section className={card} aria-labelledby="improve-h">
          <h2 id="improve-h" className={cx('m-0 mb-3 text-lg font-bold', heading)}>Top areas for improvement</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {r.improvements.map((i) => (
              <li key={i.title} className="flex flex-col gap-0.5">
                <span className="font-semibold">{i.title}</span>
                <span className="text-[15px] text-ink-2 dark:text-night-ink">{i.detail}</span>
              </li>
            ))}
          </ul>
          {r.plan.length > 0 && (
            <>
              {practice.isError && <p role="alert" className="m-0 mt-3 text-sm font-semibold text-incorrect">{errorMessage(practice.error)}</p>}
              <Button className="mt-4" onClick={() => practice.mutate()} loading={practice.isPending}>
                <Target size={18} aria-hidden="true" /> Practise weak areas
              </Button>
            </>
          )}
        </section>
      )}

      {r.strengths.length > 0 && (
        <section className={card} aria-labelledby="strengths-h">
          <h2 id="strengths-h" className={cx('m-0 mb-3 text-lg font-bold', heading)}>What went well</h2>
          <ul className="m-0 flex flex-col gap-1.5 pl-5">{r.strengths.map((x) => <li key={x} className="text-[15px]">{x}</li>)}</ul>
        </section>
      )}

      {r.topics.length > 0 && (
        <section className={card} aria-labelledby="topics-h">
          <h2 id="topics-h" className={cx('m-0 mb-3 text-lg font-bold', heading)}>By topic</h2>
          <Bars lines={r.topics} />
        </section>
      )}

      {r.plan.length > 0 && (
        <section className={card} aria-labelledby="plan-h">
          <h2 id="plan-h" className={cx('m-0 mb-3 text-lg font-bold', heading)}>Your improvement plan</h2>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {r.plan.map((p) => (
              <li key={p.topic} className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{p.topic}</span>
                  <span className={cx('text-[13px]', muted)}>Priority: {p.priority === 'high' ? 'High' : p.priority === 'medium' ? 'Medium' : 'Low'} · {p.practiceQuestions} practice questions</span>
                </span>
                <ScorePill score={p.score} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.questions.length > 0 && (
        <section className={card} aria-labelledby="questions-h">
          <h2 id="questions-h" className={cx('m-0 mb-1 text-lg font-bold', heading)}>Question by question</h2>
          <ol className="m-0 flex list-none flex-col p-0">
            {r.questions.map((q, i) => <QuestionRow key={i} n={i + 1} q={q} />)}
          </ol>
        </section>
      )}
    </>
  );
}

function QuestionRow({ n, q }: { n: number; q: InterviewReport['questions'][number] }) {
  const [open, setOpen] = useState(n === 1);
  return (
    <li className="border-b border-border last:border-b-0 dark:border-night-border">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-start gap-3 border-0 bg-transparent py-3 text-left text-ink dark:text-night-ink">
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{n}. {q.question}</span>
        <ScorePill score={q.score} />
        <ChevronDown size={18} aria-hidden="true" className={cx('mt-1 flex-none transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <dl className="m-0 mb-4 flex flex-col gap-3 text-[15px]">
          <div><dt className={cx('text-xs font-semibold uppercase tracking-[0.06em]', muted)}>Your answer</dt><dd className="m-0">{q.answer}</dd></div>
          <div><dt className={cx('text-xs font-semibold uppercase tracking-[0.06em]', muted)}>Evaluation</dt><dd className="m-0 font-semibold">{q.score}/100 — {q.verdict}</dd></div>
          {q.missing.length > 0 && <div><dt className={cx('text-xs font-semibold uppercase tracking-[0.06em]', muted)}>Missing</dt><dd className="m-0">{q.missing.join(', ')}</dd></div>}
          {q.competencies.length > 0 && <div><dt className={cx('text-xs font-semibold uppercase tracking-[0.06em]', muted)}>Tested</dt><dd className="m-0">{q.competencies.join(', ')}</dd></div>}
          <div className="rounded-control bg-brand-soft p-3 dark:bg-night-brand-soft"><dt className="text-xs font-semibold uppercase tracking-[0.06em] text-brand dark:text-night-brand">A stronger answer</dt><dd className="m-0">{q.improvedAnswer}</dd></div>
        </dl>
      )}
    </li>
  );
}

function Transcript({ s }: { s: InterviewSessionView }) {
  if (s.transcript.length === 0) return <section className={cx(card, 'text-[15px]')}>Nothing was said in this interview.</section>;
  return (
    <section className={card} aria-label="Transcript">
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {s.transcript.map((t) => (
          <li key={t.seq} className={cx('max-w-[90%] rounded-card px-3.5 py-2.5 text-[15px]', t.role === 'INTERVIEWER' ? 'self-start bg-soft dark:bg-night-soft' : 'self-end bg-brand-soft dark:bg-night-brand-soft')}>
            <span className={cx('mb-0.5 block text-xs font-semibold', muted)}>{t.role === 'INTERVIEWER' ? 'Interviewer' : 'You'}</span>
            {t.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

function EvaluationFailed({ id }: { id: string }) {
  const qc = useQueryClient();
  const retry = useMutation({ mutationFn: () => retryEvaluation(id), onSuccess: () => void qc.invalidateQueries({ queryKey: interviewKeys.session(id) }) });
  return (
    <section role="alert" className={cx(card, 'flex flex-col gap-3')}>
      <p className="m-0 text-[15px] font-semibold">We could not prepare the feedback for this interview. Your transcript is saved.</p>
      <Button className="self-start" onClick={() => retry.mutate()} loading={retry.isPending}>Try again</Button>
    </section>
  );
}

function DeleteInterview({ id }: { id: string }) {
  const slug = useActiveCountrySlug();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const del = useMutation({
    mutationFn: () => deleteSession(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: interviewKeys.all }); navigate(countryPath(slug, 'interview'), { replace: true }); },
  });
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 dark:border-night-border">
      {confirm ? (
        <>
          <span className="text-sm font-semibold">Delete this interview, its transcript and feedback? This cannot be undone.</span>
          <Button variant="final" size="sm" onClick={() => del.mutate()} loading={del.isPending}>Delete</Button>
          <Button variant="plain" size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
        </>
      ) : (
        <Button variant="plain" size="sm" onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden="true" /> Delete this interview</Button>
      )}
    </div>
  );
}
