import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, FileUp, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { catalogKeys, listJobs } from '../../api/catalog';
import { createJobFromExam, createJobFromText, uploadJob, type InterviewJob } from '../../api/interviews';
import { Button } from '../../components/Button';
import { Loader } from '../../components/states';
import { cx } from '../../lib/cx';
import { errorMessage } from '../../lib/errorCatalogue';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { card, heading, InterviewGate, InterviewPage, muted } from './InterviewGate';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

/** Step 1: the job description — pasted, uploaded (PDF, Word, text) or one of JobPrep's own jobs (`?job=<slug>`). */
export function NewInterviewPage() {
  useDocumentTitle('New interview');
  return (
    <InterviewGate>
      <NewInterview />
    </InterviewGate>
  );
}

function NewInterview() {
  const slug = useActiveCountrySlug();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromJob = params.get('job');
  const [tab, setTab] = useState<'paste' | 'upload' | 'jobprep'>(fromJob ? 'jobprep' : 'paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const done = (job: InterviewJob) => navigate(countryPath(slug, 'interview', 'jobs', job.id), { replace: !!fromJob });
  const analyse = useMutation({
    mutationFn: (input: { kind: 'text'; text: string } | { kind: 'file'; file: File } | { kind: 'exam'; slug: string }) =>
      input.kind === 'text' ? createJobFromText(input.text) : input.kind === 'file' ? uploadJob(input.file) : createJobFromExam(input.slug),
    onSuccess: done,
  });

  // Arrived from a job page ("Practise the interview for this job"): read that job straight away.
  const started = useRef(false);
  useEffect(() => {
    if (fromJob && !started.current) {
      started.current = true;
      analyse.mutate({ kind: 'exam', slug: fromJob });
    }
  }, [fromJob, analyse]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tab === 'paste') analyse.mutate({ kind: 'text', text });
    else if (tab === 'upload' && file) analyse.mutate({ kind: 'file', file });
  };
  const pickFile = (f: File | null) => {
    setFileError(null);
    if (f && f.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError('That file is larger than 5 MB. Upload a smaller file or paste the text instead.');
      return;
    }
    setFile(f);
  };

  if (analyse.isPending) {
    return (
      <InterviewPage>
        <section className={cx(card, 'flex flex-col items-center gap-3 py-10 text-center')} role="status">
          <Loader label="Reading the job description…" />
          <p className={cx('m-0 max-w-[420px] text-[15px]', muted)}>
            We are picking out the position, responsibilities, skills and the topics an interviewer is likely to ask about. This takes a few seconds.
          </p>
        </section>
      </InterviewPage>
    );
  }

  const tabs = [
    { key: 'paste' as const, label: 'Paste text', Icon: Briefcase },
    { key: 'upload' as const, label: 'Upload a file', Icon: FileUp },
    { key: 'jobprep' as const, label: 'A JobPrep job', Icon: Search },
  ];
  return (
    <InterviewPage>
      <Link to={countryPath(slug, 'interview')} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold">
        <ArrowLeft size={16} aria-hidden="true" /> Interview preparation
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className={cx('m-0 text-[26px] font-bold tracking-tight', heading)}>Which job are you preparing for?</h1>
        <p className={cx('m-0 text-[15px]', muted)}>Give us the job description. We read it and prepare an interview for that exact job. This is free; only the interview itself uses minutes.</p>
      </header>

      <div role="tablist" aria-label="How to give the job description" className="grid grid-cols-3 gap-2">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              'flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-1 rounded-control px-2 text-[13px] font-semibold md:flex-row md:text-sm',
              tab === key ? 'border-2 border-brand bg-brand-soft text-brand dark:bg-night-brand-soft dark:text-night-brand' : 'border border-border-strong bg-surface text-ink dark:border-night-border dark:bg-night-surface dark:text-night-ink',
            )}
          >
            <Icon size={18} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {analyse.isError && (
        <p role="alert" className="m-0 rounded-control border border-incorrect-line bg-incorrect-bg p-3.5 text-sm font-semibold text-incorrect">
          {errorMessage(analyse.error)}
        </p>
      )}

      {tab === 'jobprep' ? (
        <JobPicker slug={slug} onPick={(s) => analyse.mutate({ kind: 'exam', slug: s })} />
      ) : (
        <form onSubmit={submit} className={cx(card, 'flex flex-col gap-4')}>
          {tab === 'paste' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="jd-text" className="text-sm font-semibold">Job description</label>
              <textarea
                id="jd-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder="Paste the whole advert: the job title, responsibilities, qualifications and competencies."
                className="min-h-[220px] w-full resize-y rounded-control border border-input-border bg-surface p-3.5 text-[16px] leading-relaxed text-ink placeholder:text-muted dark:border-night-border dark:bg-night-surface dark:text-night-ink"
              />
              <p className={cx('m-0 text-[13px]', muted)}>The more of the advert you paste, the closer the interview is to the real one.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="jd-file" className="text-sm font-semibold">Job description file</label>
              <input
                id="jd-file"
                type="file"
                accept={ACCEPT}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                aria-describedby="jd-file-hint"
                className="block w-full rounded-control border border-dashed border-border-strong bg-soft p-4 text-sm dark:border-night-border dark:bg-night-soft"
              />
              <p id="jd-file-hint" className={cx('m-0 text-[13px]', muted)}>PDF, Word (.docx) or text, up to 5 MB. The file is read and not kept.</p>
              {fileError && <p role="alert" className="m-0 text-sm font-semibold text-incorrect">{fileError}</p>}
            </div>
          )}
          <Button type="submit" disabled={tab === 'paste' ? text.trim().length < 80 : !file}>
            Read the job description
          </Button>
          {tab === 'paste' && text.trim().length > 0 && text.trim().length < 80 && (
            <p className={cx('m-0 -mt-2 text-[13px]', muted)}>Paste a little more: at least a few lines of the advert.</p>
          )}
        </form>
      )}
    </InterviewPage>
  );
}

/** Search JobPrep's own jobs (the catalog) and pick one. */
function JobPicker({ slug, onPick }: { slug: string; onPick: (examSlug: string) => void }) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const query = { q: term || undefined, pageSize: 8, sort: 'recommended' };
  const jobs = useQuery({ queryKey: catalogKeys.jobList(slug, query), queryFn: () => listJobs(slug, query), staleTime: 30_000 });
  return (
    <section className={cx(card, 'flex flex-col gap-3')}>
      <label htmlFor="job-q" className="text-sm font-semibold">Search JobPrep jobs</label>
      <input
        id="job-q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="e.g. Accountant, Headteacher, Executive Secretary"
        className="h-12 w-full rounded-control border border-input-border bg-surface px-3.5 text-[16px] text-ink dark:border-night-border dark:bg-night-surface dark:text-night-ink"
      />
      {jobs.isLoading ? (
        <Loader label="Loading jobs…" />
      ) : jobs.data && jobs.data.results.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {jobs.data.results.map((j) => (
            <li key={j.jobSlug} className="border-b border-border last:border-b-0 dark:border-night-border">
              <button type="button" onClick={() => onPick(j.jobSlug)} className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent py-3 text-left text-ink dark:text-night-ink">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{j.jobName}</span>
                  <span className={cx('text-[13px]', muted)}>{j.category.name}</span>
                </span>
                <span className="text-sm font-semibold text-brand dark:text-night-brand">Use this job</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cx('m-0 text-[15px]', muted)}>No job matches. Paste the job description instead.</p>
      )}
    </section>
  );
}
