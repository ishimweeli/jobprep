import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mic, Plus, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createSession, getJob, getOverview, interviewKeys, updateJob,
  type InterviewKind, type InterviewLevel, type InterviewMode, type InterviewTopic, type JobProfile,
} from '../../api/interviews';
import { Button, buttonClasses } from '../../components/Button';
import { Loader, QueryError } from '../../components/states';
import { cx } from '../../lib/cx';
import { errorMessage } from '../../lib/errorCatalogue';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { card, heading, InterviewGate, InterviewPage, muted } from './InterviewGate';
import {
  defaultDuration, durationLabel, durationOptions, KIND_LABEL, LEVEL_LABEL, micErrorMessage, MODE_HINT, MODE_LABEL,
} from './interviewModel';
import { speakTest } from './useSpeaker';

/** Step 2: check what was read from the job description (everything is editable), then configure the interview. */
export function JobReviewPage() {
  useDocumentTitle('Configure your interview');
  return (
    <InterviewGate>
      <Review />
    </InterviewGate>
  );
}

function Review() {
  const { jobId = '' } = useParams();
  const job = useQuery({ queryKey: interviewKeys.job(jobId), queryFn: () => getJob(jobId), staleTime: 60_000 });
  const overview = useQuery({ queryKey: interviewKeys.overview, queryFn: getOverview, staleTime: 0 });
  if (job.isError) return <InterviewPage><QueryError error={job.error} what="the job" onRetry={() => void job.refetch()} retrying={job.isFetching} /></InterviewPage>;
  if (!job.data || !overview.data) return <InterviewPage><Loader label="Loading…" /></InterviewPage>;
  return <ReviewForm key={job.data.id} jobId={job.data.id} initial={job.data.profile} remainingSeconds={overview.data.wallet.remainingSeconds} />;
}

function ReviewForm({ jobId, initial, remainingSeconds }: { jobId: string; initial: JobProfile; remainingSeconds: number }) {
  const slug = useActiveCountrySlug();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [p, setP] = useState<JobProfile>(initial);
  const [mode, setMode] = useState<InterviewMode>('REAL');
  const [kind, setKind] = useState<InterviewKind>(initial.recommendedKind);
  const [level, setLevel] = useState<InterviewLevel>(initial.recommendedLevel);
  const [minutes, setMinutes] = useState(defaultDuration(initial.recommendedDurationMinutes, remainingSeconds));
  const changed = JSON.stringify(p) !== JSON.stringify(initial);
  const options = durationOptions(remainingSeconds);
  const enough = remainingSeconds >= 60;

  const start = useMutation({
    mutationFn: async () => {
      if (changed) await updateJob(jobId, p);
      return createSession({ jobId, mode, kind, level, durationMinutes: minutes });
    },
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: interviewKeys.all });
      navigate(countryPath(slug, 'interview-live', s.id));
    },
  });

  const set = <K extends keyof JobProfile>(k: K, v: JobProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  const valid = p.position.trim().length > 0 && p.topics.length > 0;

  return (
    <InterviewPage>
      <Link to={countryPath(slug, 'interview', 'new')} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold">
        <ArrowLeft size={16} aria-hidden="true" /> Another job description
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className={cx('m-0 text-[26px] font-bold tracking-tight', heading)}>Check the job details</h1>
        <p className={cx('m-0 text-[15px]', muted)}>This is what we read from the job description. Correct anything that is wrong: the interviewer uses it.</p>
      </header>

      <section className={cx(card, 'grid gap-4 md:grid-cols-2')} aria-label="Job details">
        <TextField label="Position" value={p.position} onChange={(v) => set('position', v)} />
        <TextField label="Organisation" value={p.organisation} onChange={(v) => set('organisation', v)} />
        <TextField label="Required experience" value={p.experience} onChange={(v) => set('experience', v)} />
        <div className="hidden md:block" />
        <ChipEditor label="Technical skills" items={p.technicalSkills} onChange={(v) => set('technicalSkills', v)} max={15} />
        <ChipEditor label="Behavioral competencies" items={p.behavioralCompetencies} onChange={(v) => set('behavioralCompetencies', v)} max={10} />
        <div className="md:col-span-2">
          <TopicEditor topics={p.topics} onChange={(v) => set('topics', v)} />
        </div>
      </section>

      <section className={cx(card, 'flex flex-col gap-5')} aria-labelledby="config-h">
        <h2 id="config-h" className={cx('m-0 text-lg font-bold', heading)}>Configure your interview</h2>
        <Choice legend="Interview mode" value={mode} onChange={setMode} options={(['REAL', 'PRACTICE'] as const).map((m) => ({ value: m, label: MODE_LABEL[m], hint: MODE_HINT[m] }))} />
        <Choice legend="Interview type" value={kind} onChange={setKind} options={(['MIXED', 'TECHNICAL', 'BEHAVIORAL'] as const).map((k) => ({ value: k, label: KIND_LABEL[k], hint: k === initial.recommendedKind ? 'Recommended for this job' : undefined }))} />
        <Choice legend="Difficulty" value={level} onChange={setLevel} options={(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const).map((l) => ({ value: l, label: LEVEL_LABEL[l], hint: l === initial.recommendedLevel ? 'Recommended' : undefined }))} row />
        <Choice
          legend="Duration"
          value={String(minutes)}
          onChange={(v) => setMinutes(Number(v))}
          row
          options={options.map((o) => ({ value: String(o.minutes), label: `${o.minutes} minutes`, disabled: !o.enough, hint: o.enough ? undefined : 'Not enough minutes' }))}
        />
        <p className={cx('m-0 text-sm', muted)}>Language: English. You have {durationLabel(remainingSeconds)} of interview time; only the time in the interview is used.</p>
      </section>

      <DeviceCheck />

      {start.isError && (
        <p role="alert" className="m-0 rounded-control border border-incorrect-line bg-incorrect-bg p-3.5 text-sm font-semibold text-incorrect">{errorMessage(start.error)}</p>
      )}
      {enough ? (
        <Button size="lg" onClick={() => start.mutate()} loading={start.isPending} disabled={!valid}>
          <Mic size={18} aria-hidden="true" /> Start the interview
        </Button>
      ) : (
        <Link to={`${countryPath(slug, 'checkout')}?plan=interview&from=interview`} className={buttonClasses({ variant: 'primary', size: 'lg' })}>
          You have no interview minutes left · Get more
        </Link>
      )}
    </InterviewPage>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <input id={id} value={value} maxLength={120} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-control border border-input-border bg-surface px-3 text-[16px] text-ink dark:border-night-border dark:bg-night-surface dark:text-night-ink" />
    </div>
  );
}

function ChipEditor({ label, items, onChange, max }: { label: string; items: string[]; onChange: (v: string[]) => void; max: number }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !items.some((i) => i.toLowerCase() === v.toLowerCase()) && items.length < max) onChange([...items, v.slice(0, 80)]);
    setDraft('');
  };
  const id = `chip-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {items.map((i) => (
          <li key={i} className="inline-flex items-center gap-1 rounded-pill bg-soft py-1 pl-3 pr-1 text-sm dark:bg-night-soft">
            {i}
            <button type="button" aria-label={`Remove ${i}`} onClick={() => onChange(items.filter((x) => x !== i))} className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-muted hover:bg-surface">
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Add one" className="h-10 min-w-0 flex-1 rounded-control border border-input-border bg-surface px-3 text-[15px] text-ink dark:border-night-border dark:bg-night-surface dark:text-night-ink" />
        <button type="button" onClick={add} aria-label={`Add to ${label}`} className={buttonClasses({ variant: 'neutral', size: 'sm' })}><Plus size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function TopicEditor({ topics, onChange }: { topics: InterviewTopic[]; onChange: (v: InterviewTopic[]) => void }) {
  const [draft, setDraft] = useState('');
  const nextId = () => {
    let n = topics.length + 1;
    while (topics.some((t) => t.id === `t${n}`)) n++;
    return `t${n}`;
  };
  const add = () => {
    const name = draft.trim().slice(0, 80);
    if (name && topics.length < 10) onChange([...topics, { id: nextId(), name, kind: 'technical', priority: 'medium' }]);
    setDraft('');
  };
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 text-sm font-semibold">Interview topics</legend>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {topics.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-control bg-soft px-3 py-2 dark:bg-night-soft">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{t.name}</span>
            <select
              aria-label={`Priority of ${t.name}`}
              value={t.priority}
              onChange={(e) => onChange(topics.map((x) => (x.id === t.id ? { ...x, priority: e.target.value as InterviewTopic['priority'] } : x)))}
              className="h-9 rounded-control border border-input-border bg-surface px-2 text-sm text-ink dark:border-night-border dark:bg-night-surface dark:text-night-ink"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <span className={cx('hidden text-xs sm:inline', muted)}>{t.kind === 'technical' ? 'Technical' : 'Behavioral'}</span>
            <button type="button" aria-label={`Remove ${t.name}`} disabled={topics.length === 1} onClick={() => onChange(topics.filter((x) => x.id !== t.id))} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-muted hover:bg-surface disabled:opacity-40">
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {topics.length < 10 && (
        <div className="flex gap-2">
          <label htmlFor="topic-add" className="sr-only">Add a topic</label>
          <input id="topic-add" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Add a topic, e.g. Budget planning" className="h-10 min-w-0 flex-1 rounded-control border border-input-border bg-surface px-3 text-[15px] text-ink dark:border-night-border dark:bg-night-surface dark:text-night-ink" />
          <button type="button" onClick={add} aria-label="Add the topic" className={buttonClasses({ variant: 'neutral', size: 'sm' })}><Plus size={16} aria-hidden="true" /></button>
        </div>
      )}
    </fieldset>
  );
}

function Choice<T extends string>({ legend, value, onChange, options, row }: {
  legend: string; value: T; onChange: (v: T) => void; row?: boolean;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 p-0 text-sm font-semibold">{legend}</legend>
      <div className={cx('grid gap-2', row ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'md:grid-cols-3')}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={cx(
                'flex min-h-[48px] cursor-pointer flex-col items-start justify-center rounded-control px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50',
                on ? 'border-2 border-brand bg-brand-soft dark:bg-night-brand-soft' : 'border border-border-strong bg-surface dark:border-night-border dark:bg-night-surface',
              )}
            >
              <span className="text-[15px] font-semibold text-ink dark:text-night-ink">{o.label}</span>
              {o.hint && <span className={cx('text-xs', muted)}>{o.hint}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Microphone permission with a live level, and a speaker test, before starting. */
function DeviceCheck() {
  const [level, setLevel] = useState(0);
  const [micState, setMicState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  const testMic = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      setMicState('testing');
      let raf = 0;
      let heard = false;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 6));
        if (rms > 0.03) heard = true;
        raf = requestAnimationFrame(tick);
      };
      tick();
      const stop = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); void ctx.close(); };
      stopRef.current = stop;
      setTimeout(() => { stop(); stopRef.current = null; setLevel(0); setMicState(heard ? 'ok' : 'error'); if (!heard) setMicError('We did not hear anything. Check that the right microphone is selected and not muted.'); }, 4000);
    } catch (e) {
      setMicState('error');
      setMicError(micErrorMessage(e));
    }
  };

  return (
    <section className={cx(card, 'flex flex-col gap-3')} aria-labelledby="devices-h">
      <h2 id="devices-h" className={cx('m-0 text-lg font-bold', heading)}>Before you start</h2>
      <p className={cx('m-0 text-[15px]', muted)}>Find a quiet place. You answer by speaking; the interviewer speaks too, so turn your sound on. You can also type your answers.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void testMic()} disabled={micState === 'testing'} className={buttonClasses({ variant: 'neutral', size: 'sm' })}>
          <Mic size={16} aria-hidden="true" /> {micState === 'testing' ? 'Say something…' : 'Test microphone'}
        </button>
        <div className="h-2 w-32 overflow-hidden rounded-full bg-soft dark:bg-night-soft" aria-hidden="true">
          <div className="h-full bg-correct transition-[width]" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
        {micState === 'ok' && <span className="text-sm font-semibold text-correct">Microphone works</span>}
        <button type="button" onClick={() => speakTest()} className={buttonClasses({ variant: 'neutral', size: 'sm' })}>
          <Volume2 size={16} aria-hidden="true" /> Test speaker
        </button>
      </div>
      {micError && <p role="alert" className="m-0 text-sm font-semibold text-incorrect">{micError}</p>}
    </section>
  );
}
