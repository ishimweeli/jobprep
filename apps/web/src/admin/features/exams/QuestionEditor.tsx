import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCatalogOptions, getMockTest, getQuestion, keys, patchQuestion } from '../../api/admin';
import type { Difficulty, QuestionDetail } from '../../api/types';
import { ErrorBox, Skeleton } from '../../components/states';
import { TEST_TONE } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { formatCount, formatDay, plural } from '../../lib/format';
import { useAdmin } from '../auth/session';
import {
  buildPatch, describeSaveError, isDirty, isEditable, toForm, validateForm, type FieldName, type FormProblem, type QuestionForm, type SaveAction,
} from './questionForm';

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'FOUNDATION', label: 'Foundation' },
  { value: 'CHALLENGING', label: 'Challenging' },
];

/** "Reported by 2 candidates" box: the latest message and every date. */
function ReportBanner({ reports }: { reports: QuestionDetail['reports'] }) {
  if (reports.length === 0) return null;
  const msg = reports.find((r) => r.message)?.message;
  const days = [...new Set([...reports].reverse().map((r) => formatDay(r.createdAt)))];
  return (
    <div role="note" className="flex flex-col gap-1 rounded-[10px] border border-flagged-line bg-flagged-bg px-3.5 py-3">
      <span className="text-sm font-semibold text-flagged">Reported by {plural(reports.length, 'candidate')}</span>
      <span className="text-sm text-flagged">{msg ? `“${msg}” · ` : ''}{days.join(', ')}</span>
    </div>
  );
}

export function QuestionEditor({ testId, questionId, phone }: { testId: string; questionId: string; phone: boolean }) {
  const q = useQuery({ queryKey: keys.question(questionId), queryFn: () => getQuestion(questionId) });
  const test = useQuery({ queryKey: keys.mockTest(testId), queryFn: () => getMockTest(testId) });
  const catalog = useQuery({ queryKey: keys.catalog, queryFn: getCatalogOptions, staleTime: 5 * 60_000 });

  if (q.isPending) return <Skeleton label="Loading the question…" className="min-w-0 flex-[999_1_560px]" />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} className="min-w-0 flex-[999_1_560px]" />;

  const categoryId = test.data?.mockTest.category.id;
  const topics = catalog.data?.categories.find((c) => c.id === categoryId)?.topics ?? [];
  const cases = test.data?.cases ?? [];
  return <EditorForm key={questionId} testId={testId} data={q.data} topics={topics} cases={cases} phone={phone} />;
}

function EditorForm({ testId, data, topics, cases, phone }: {
  testId: string;
  data: QuestionDetail;
  topics: { id: string; name: string }[];
  cases: { id: string; title: string }[];
  phone: boolean;
}) {
  const admin = useAdmin();
  const qc = useQueryClient();
  const uid = useId();
  const q = data.question;
  const editable = isEditable(q.type, !!q.case) && admin.permissions.includes('exams:write');
  const multi = q.type === 'MULTIPLE_SELECT';
  const [initial, setInitial] = useState<QuestionForm>(() => toForm(data));
  const [form, setForm] = useState<QuestionForm>(() => toForm(data));
  const [problems, setProblems] = useState<FormProblem[]>([]);
  const [serverProblem, setServerProblem] = useState<FormProblem | null>(null);
  const [notice, setNotice] = useState('');

  const save = useMutation({
    mutationFn: ({ action }: { action: SaveAction }) =>
      patchQuestion(q.id, buildPatch(initial, form, action, { canResolveReports: admin.permissions.includes('reports:resolve') })),
    onSuccess: async (_r, { action }) => {
      const fresh = await qc.fetchQuery({ queryKey: keys.question(q.id), queryFn: () => getQuestion(q.id), staleTime: 0 });
      const next = toForm(fresh);
      setInitial(next);
      setForm(next);
      setServerProblem(null);
      setNotice(action === 'publish' ? 'Published.' : 'Saved as a draft.');
      void qc.invalidateQueries({ queryKey: keys.mockTest(testId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'exams'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
    onError: (e) => {
      setNotice('');
      const d = describeSaveError(e);
      setServerProblem({ field: d.field ?? 'stem', message: d.message });
    },
  });

  const run = (action: SaveAction) => {
    setNotice('');
    setServerProblem(null);
    const found = validateForm(form);
    setProblems(found);
    if (found.length === 0) save.mutate({ action });
  };

  const all = [...problems, ...(serverProblem ? [serverProblem] : [])];
  const bad = (f: FieldName) => all.some((p) => p.field === f);
  const set = <K extends keyof QuestionForm>(k: K, v: QuestionForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setNotice('');
    setProblems((p) => p.filter((x) => x.field !== (k === 'topicId' ? 'topic' : k === 'caseId' ? 'case' : (k as FieldName))));
  };
  const dirty = isDirty(initial, form);
  const ro = !editable;

  const subtitle = `${data.mockTest.title} · ${data.mockTest.isFree ? 'Free' : 'Full Access'} · ${TEST_TONE[data.mockTest.status].label}`;
  const prev = data.position.previousId;
  const next = data.position.nextId;
  const arrow = 'inline-flex h-10 w-11 items-center justify-center rounded-[10px] border border-input-border bg-white text-ink no-underline hover:text-ink';

  const fieldBox = (invalid: boolean) => cx('rounded-[10px] border bg-white text-ink', invalid ? 'border-2 border-incorrect' : 'border-input-border');
  const topicOptions = topics.some((t) => t.id === form.topicId) || !q.topic ? topics : [{ id: q.topic.id, name: q.topic.name }, ...topics];

  const stats = `${formatCount(data.stats.attempts)} attempts${data.stats.correctPercent === null ? '' : ` · ${data.stats.correctPercent}% answered correctly`}`;
  const edited = data.lastEdited ? `Last edited by ${data.lastEdited.by ?? 'an admin'} · ${formatDay(data.lastEdited.at)} · ` : '';

  const stem = (
    <>
      <label htmlFor={`${uid}-stem`} className="text-sm font-semibold">Question</label>
      <textarea
        id={`${uid}-stem`}
        rows={phone ? 3 : 2}
        value={form.stem}
        readOnly={ro}
        aria-invalid={bad('stem') || undefined}
        onChange={(e) => set('stem', e.target.value)}
        className={cx(fieldBox(bad('stem')), 'resize-y px-3 py-2.5 text-base')}
      />
    </>
  );

  const options = (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-sm font-semibold">{phone ? 'Options — tap the circle for the correct one' : 'Options — select the correct answer'}</legend>
      {form.options.map((o) => {
        const right = form.correct.includes(o.key);
        return (
          <div key={o.key} className={cx('flex items-center', phone ? 'gap-2' : 'gap-2.5')}>
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={`${uid}-correct`}
              checked={right}
              disabled={ro}
              onChange={() => set('correct', [o.key])}
              aria-label={phone ? `Mark option ${o.key} correct` : `Mark option ${o.key} as correct`}
              className={cx('flex-none accent-correct', phone ? 'h-[22px] w-[22px]' : 'h-5 w-5')}
            />
            <span className={cx('font-semibold text-ink-2', phone ? 'w-5' : 'w-7')}>{o.key}</span>
            <input
              type="text"
              value={o.text}
              readOnly={ro}
              aria-label={`Option ${o.key}`}
              aria-invalid={(bad('options') && !o.text.trim()) || undefined}
              onChange={(e) => set('options', form.options.map((x) => (x.key === o.key ? { ...x, text: e.target.value } : x)))}
              className={cx(
                'min-w-0 flex-1 px-3 text-ink',
                phone ? 'h-[46px] text-base' : 'h-11 text-[15px]',
                right ? 'rounded-[10px] border-2 border-correct bg-correct-bg' : fieldBox(bad('options') && !o.text.trim()),
              )}
            />
          </div>
        );
      })}
    </fieldset>
  );

  const selectCls = cx('border border-input-border bg-white px-2.5 font-normal text-ink', phone ? 'h-[46px] rounded-[10px] px-3 text-base' : 'h-11 rounded-[10px] text-[15px]');
  const lab = 'flex flex-col gap-1.5 text-sm font-semibold';
  const topic = (
    <label className={lab}>
      Topic
      <select value={form.topicId} disabled={ro} aria-invalid={bad('topic') || undefined} onChange={(e) => set('topicId', e.target.value)} className={selectCls}>
        {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
  const difficulty = (
    <label className={lab}>
      Difficulty
      <select value={form.difficulty} disabled={ro} onChange={(e) => set('difficulty', e.target.value as Difficulty)} className={selectCls}>
        {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
    </label>
  );
  const marks = (
    <label className={lab}>
      Marks
      <input type="number" value={form.marks} readOnly={ro} min={0} step="any" aria-invalid={bad('marks') || undefined} onChange={(e) => set('marks', e.target.value)} className={cx(selectCls, bad('marks') && 'border-2 border-incorrect')} />
    </label>
  );
  const caseSel = (
    <label className={lab}>
      Case study
      <select value={form.caseId} disabled={ro} aria-invalid={bad('case') || undefined} onChange={(e) => set('caseId', e.target.value)} className={selectCls}>
        <option value="">None</option>
        {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </label>
  );

  const explanation = (
    <>
      <label htmlFor={`${uid}-why`} className="text-sm font-semibold">{phone ? 'Explanation' : 'Explanation shown after submission'}</label>
      <textarea
        id={`${uid}-why`}
        rows={phone ? 4 : 3}
        value={form.explanation}
        readOnly={ro}
        aria-invalid={bad('explanation') || undefined}
        onChange={(e) => set('explanation', e.target.value)}
        className={cx(fieldBox(bad('explanation')), 'resize-y px-3 py-2.5 text-[15px] leading-normal')}
      />
    </>
  );

  const feedback = (
    <>
      {all.length > 0 && (
        <div role="alert" className="flex flex-col gap-0.5 rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">
          {all.map((p, i) => <span key={`${p.field}-${i}`}>{p.message}</span>)}
        </div>
      )}
      <p role="status" className={cx('m-0 text-sm font-semibold text-correct', !notice && 'sr-only')}>{notice}</p>
    </>
  );

  if (phone) {
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-muted">{subtitle}</span>
          <span className="flex gap-1.5">
            {prev ? <Link to={`/admin/exams/${testId}/q/${prev}`} aria-label="Previous question" className={arrow}>←</Link> : <button type="button" disabled aria-label="Previous question" className={cx(arrow, 'opacity-40')}>←</button>}
            {next ? <Link to={`/admin/exams/${testId}/q/${next}`} aria-label="Next question" className={arrow}>→</Link> : <button type="button" disabled aria-label="Next question" className={cx(arrow, 'opacity-40')}>→</button>}
          </span>
        </div>
        <ReportBanner reports={data.reports} />
        <div className="flex flex-col gap-1.5">{stem}</div>
        {options}
        <div className="flex flex-col gap-1.5">{explanation}</div>
        {topic}
        <div className="grid grid-cols-2 gap-2.5">{difficulty}{marks}</div>
        <p className="m-0 text-[13px] text-muted">{stats}</p>
        {feedback}
        {editable && (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => run('publish')} disabled={save.isPending} aria-busy={save.isPending || undefined} className="min-h-12 rounded-[10px] border-0 bg-brand text-base font-semibold text-white disabled:opacity-60">
              Publish &amp; resolve reports
            </button>
            <button type="button" onClick={() => run('draft')} disabled={save.isPending} aria-busy={save.isPending || undefined} className="min-h-12 rounded-[10px] border border-input-border bg-white text-[15px] font-semibold text-ink disabled:opacity-60">
              Save draft
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby={`${uid}-t`} className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-[16px] border border-border bg-white p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-muted">{subtitle}</span>
          <h2 id={`${uid}-t`} className="m-0 text-[17px]">Edit question {data.position.number} of {data.position.total}</h2>
        </div>
        <div className="flex gap-1.5">
          {prev ? <Link to={`/admin/exams/${testId}/q/${prev}`} aria-label="Previous question" className={arrow}>←</Link> : <button type="button" disabled aria-label="Previous question" className={cx(arrow, 'opacity-40')}>←</button>}
          {next ? <Link to={`/admin/exams/${testId}/q/${next}`} aria-label="Next question" className={arrow}>→</Link> : <button type="button" disabled aria-label="Next question" className={cx(arrow, 'opacity-40')}>→</button>}
        </div>
      </div>
      <ReportBanner reports={data.reports} />
      <div className="flex flex-col gap-1.5">{stem}</div>
      {options}
      <div className="flex flex-col gap-1.5">{explanation}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-3">
        {topic}{difficulty}{marks}{caseSel}
      </div>
      {feedback}
      <div className="flex flex-wrap justify-between gap-2.5 border-t border-border pt-3">
        <span className="self-center text-[13px] text-muted">{edited}{stats}</span>
        {editable && (
          <div className="flex gap-2">
            <button type="button" onClick={() => run('draft')} disabled={save.isPending} aria-busy={save.isPending || undefined} data-dirty={dirty || undefined} className="h-11 rounded-[10px] border border-input-border bg-white px-4 text-[15px] font-semibold text-ink disabled:opacity-60">
              Save draft
            </button>
            <button type="button" onClick={() => run('publish')} disabled={save.isPending} aria-busy={save.isPending || undefined} className="h-11 rounded-[10px] border-0 bg-brand px-4 text-[15px] font-semibold text-white disabled:opacity-60">
              Publish change &amp; resolve reports
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
