import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { archiveQuestion, createQuestion, getCase, getCatalogOptions, getMockTestFull, keys, patchQuestion } from '../../api/admin';
import { deleteTranslation, getQuestionX, putTranslation, type QuestionDetailX } from '../../api/questions-demand';
import type { Difficulty, MockTestDetailFull, QuestionType } from '../../api/types';
import { ActionDialog } from '../../components/ActionDialog';
import { AdminDialog } from '../../components/AdminDialog';
import { ErrorBox, SaveStatus, Loader, type SaveState } from '../../components/states';
import { Btn } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { TEST_TONE } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { formatCount, formatDay, languageName, plural } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';
import { useAdmin } from '../auth/session';
import { QuestionPreview } from './QuestionPreview';
import {
  MAX_OPTIONS, MIN_OPTIONS, TRANSLATION_LABEL, TYPE_LABEL,
  addOption, buildCreate, buildPatch, buildTranslationBody, copySource, describeSaveError, emptyTranslation, isDirty, moveOption, newForm, previewContent, removeOption,
  setType, toForm, toggleCorrect, toTranslationForm, translationDirty, translationState, translationTabs, validateForm, versionNote,
  type FieldName, type FormProblem, type QuestionForm, type SaveAction, type TranslationForm,
} from './questionForm';

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'FOUNDATION', label: 'Foundation' },
  { value: 'CHALLENGING', label: 'Challenging' },
];
const TYPES: QuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_SELECT', 'CASE_BASED'];

/** "Reported by 2 candidates" box: the latest message and every date. */
function ReportBanner({ reports }: { reports: QuestionDetailX['reports'] }) {
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

const fill = 'min-w-0 flex-[999_1_560px]';

/** `questionId` is a question's id, or `'new'` for the "Add question" form of the test. */
export function QuestionEditor({ testId, questionId, phone }: { testId: string; questionId: string; phone: boolean }) {
  const isNew = questionId === 'new';
  const q = useQuery({ queryKey: keys.question(questionId), queryFn: () => getQuestionX(questionId), enabled: !isNew });
  const test = useQuery({ queryKey: keys.mockTest(testId), queryFn: () => getMockTestFull(testId) });
  const catalog = useQuery({ queryKey: keys.catalog, queryFn: getCatalogOptions, staleTime: 5 * 60_000 });

  if (!isNew && q.isPending) return <Loader label="Loading the question…" className={fill} />;
  if (!isNew && q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} className={fill} />;
  if (test.isPending) return <Loader label="Loading the mock test…" className={fill} />;
  if (test.isError) return <ErrorBox error={test.error} onRetry={() => void test.refetch()} className={fill} />;

  const categoryId = test.data.mockTest.category.id;
  const topics = catalog.data?.categories.find((c) => c.id === categoryId)?.topics ?? [];
  return <EditorForm key={questionId} testId={testId} data={isNew ? null : q.data!} test={test.data} topics={topics} phone={phone} />;
}

function EditorForm({ testId, data, test, topics, phone }: {
  testId: string;
  data: QuestionDetailX | null;
  test: MockTestDetailFull;
  topics: { id: string; name: string }[];
  phone: boolean;
}) {
  const admin = useAdmin();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const uid = useId();
  const isNew = data === null;
  const canWrite = admin.permissions.includes('exams:write');
  const canResolve = admin.permissions.includes('reports:resolve');
  const q = data?.question;
  const blockedWhy = denyHint(admin.permissions, 'exams:write', 'change questions');

  const blank = () => newForm({ sectionId: test.sections[0]?.id, topicId: topics.length === 1 ? topics[0]!.id : '' });
  const [initial, setInitial] = useState<QuestionForm>(() => (data ? toForm(data) : blank()));
  const [form, setForm] = useState<QuestionForm>(() => (data ? toForm(data) : blank()));
  const [problems, setProblems] = useState<FormProblem[]>([]);
  const [serverProblem, setServerProblem] = useState<FormProblem | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [notice, setNotice] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [previewLang, setPreviewLang] = useState('');

  // Translations: one draft per language beyond the first (the source). Keys follow the saved options.
  const languages = test.mockTest.languages;
  const otherLanguages = isNew ? [] : languages.slice(1);
  const savedKeys = initial.options.map((o) => o.key);
  const [trInitial, setTrInitial] = useState<Record<string, TranslationForm>>(() =>
    Object.fromEntries(otherLanguages.map((l) => [l, toTranslationForm(data?.question.translations?.find((t) => t.language === l), (data ? toForm(data) : blank()).options.map((o) => o.key))])),
  );
  const [trForm, setTrForm] = useState<Record<string, TranslationForm>>(trInitial);
  const [tab, setTab] = useState('source');
  const [trState, setTrState] = useState<Record<string, { state: SaveState; error?: string }>>({});
  const [removeLang, setRemoveLang] = useState<string | null>(null);

  const trDirty = (l: string) => translationDirty(trInitial[l] ?? emptyTranslation(savedKeys), trForm[l] ?? emptyTranslation(savedKeys), savedKeys);
  const formDirty = isDirty(initial, form);
  const dirty = formDirty || otherLanguages.some(trDirty);
  const guard = useUnsavedChanges(dirty);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.mockTest(testId) });
    void qc.invalidateQueries({ queryKey: ['admin', 'exams'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'reports-queue'] });
  };

  const save = useMutation({
    mutationFn: async ({ action }: { action: SaveAction }) => {
      if (!q) return createQuestion(testId, buildCreate(form, action));
      return patchQuestion(q.id, buildPatch(initial, form, action, { canResolveReports: canResolve }));
    },
    onSuccess: async (r, { action }) => {
      setServerProblem(null);
      refresh();
      if (!q) {
        const id = (r as { id: string }).id;
        toast({ text: action === 'publish' ? 'Question created and published.' : 'Question created as a draft.' });
        guard.bypass(() => navigate(`/admin/exams/${testId}/q/${id}`));
        return;
      }
      const fresh = await qc.fetchQuery({ queryKey: keys.question(q.id), queryFn: () => getQuestionX(q.id), staleTime: 0 });
      const next = toForm(fresh);
      setInitial(next);
      setForm(next);
      setSaveState('saved');
      setNotice(action === 'publish' ? 'Published.' : 'Saved as a draft.');
    },
    onError: (e) => {
      setNotice('');
      setSaveState('error');
      const d = describeSaveError(e);
      setServerProblem({ field: d.field ?? 'stem', message: d.message });
    },
  });

  const run = (action: SaveAction) => {
    setNotice('');
    setServerProblem(null);
    const found = validateForm(form, { creating: isNew });
    setProblems(found);
    if (found.length === 0) {
      setSaveState('saving');
      save.mutate({ action });
    } else setSaveState('error');
  };

  const all = [...problems, ...(serverProblem ? [serverProblem] : [])];
  const bad = (f: FieldName) => all.some((p) => p.field === f);
  const edit = (next: QuestionForm, clears: FieldName[]) => {
    setForm(next);
    setNotice('');
    setSaveState('idle');
    setProblems((p) => p.filter((x) => !clears.includes(x.field)));
  };
  const set = <K extends keyof QuestionForm>(k: K, v: QuestionForm[K]) => {
    const field: FieldName = k === 'topicId' ? 'topic' : k === 'caseId' ? 'case' : k === 'sectionId' ? 'section' : k === 'type' ? 'correct' : k === 'scoring' ? 'choose' : (k as FieldName);
    edit({ ...form, [k]: v }, [field]);
  };
  const ro = !canWrite;
  const multi = form.type === 'MULTIPLE_SELECT';

  const saveTr = useMutation({
    mutationFn: async (lang: string) => putTranslation(q!.id, lang, buildTranslationBody(trForm[lang]!, savedKeys)),
    onMutate: (lang) => setTrState((s) => ({ ...s, [lang]: { state: 'saving' } })),
    onSuccess: async (_r, lang) => {
      const fresh = await qc.fetchQuery({ queryKey: keys.question(q!.id), queryFn: () => getQuestionX(q!.id), staleTime: 0 });
      const saved = toTranslationForm(fresh.question.translations?.find((t) => t.language === lang), savedKeys);
      setTrInitial((s) => ({ ...s, [lang]: saved }));
      setTrForm((s) => ({ ...s, [lang]: saved }));
      setTrState((s) => ({ ...s, [lang]: { state: 'saved' } }));
      refresh();
    },
    onError: (e, lang) => setTrState((s) => ({ ...s, [lang]: { state: 'error', error: describeSaveError(e).message } })),
  });
  const removeTr = async (lang: string) => {
    await deleteTranslation(q!.id, lang);
    const empty = emptyTranslation(savedKeys);
    setTrInitial((s) => ({ ...s, [lang]: empty }));
    setTrForm((s) => ({ ...s, [lang]: empty }));
    setTrState((s) => ({ ...s, [lang]: { state: 'idle' } }));
    void qc.invalidateQueries({ queryKey: keys.question(q!.id) });
  };

  const statusFor = (l: string) => translationState(trForm[l] ?? emptyTranslation(savedKeys), savedKeys);
  const tabs = translationTabs(languages, statusFor);

  const prev = data?.position.previousId;
  const next = data?.position.nextId;
  const arrow = 'inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-input-border bg-white text-ink no-underline hover:text-ink';
  const subtitle = isNew ? `${test.mockTest.title} · New question` : `${data!.mockTest.title} · ${data!.mockTest.isFree ? 'Free' : 'Full Access'} · ${TEST_TONE[data!.mockTest.status].label}`;
  const fieldBox = (invalid: boolean) => cx('rounded-[10px] border bg-white text-ink', invalid ? 'border-2 border-incorrect' : 'border-input-border');
  const selectCls = cx('w-full border border-input-border bg-white px-2.5 font-normal text-ink', phone ? 'h-[46px] rounded-[10px] px-3 text-base' : 'h-11 rounded-[10px] text-[15px]');
  const lab = 'flex flex-col gap-1.5 text-sm font-semibold';
  const topicOptions = topics.some((t) => t.id === form.topicId) || !q?.topic ? topics : [{ id: q.topic.id, name: q.topic.name }, ...topics];

  const stats = data ? `${formatCount(data.stats.attempts)} attempts${data.stats.correctPercent === null ? '' : ` · ${data.stats.correctPercent}% answered correctly`}` : '';
  const edited = data?.lastEdited ? `Last edited by ${data.lastEdited.by ?? 'an admin'} · ${formatDay(data.lastEdited.at)} · ` : '';
  const note = data ? versionNote(data.stats.attempts, data.question.version) : '';

  // ── Source panel
  const stem = (
    <div className="flex flex-col gap-1.5">
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
    </div>
  );

  const typeSel = (
    <label className={lab}>
      Question type
      <select value={form.type} disabled={ro} onChange={(e) => edit(setType(form, e.target.value as QuestionType), ['correct', 'case', 'choose'])} className={selectCls}>
        {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
      </select>
    </label>
  );

  const iconBtn = 'inline-flex h-11 w-11 flex-none items-center justify-center rounded-[10px] border border-input-border bg-white text-base text-ink disabled:cursor-not-allowed disabled:opacity-40';
  const options = (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-sm font-semibold">
        {multi ? 'Options — tick every correct answer' : phone ? 'Options — tap the circle for the correct one' : 'Options — select the correct answer'}
      </legend>
      {form.options.map((o, i) => {
        const right = form.correct.includes(o.key);
        return (
          <div key={o.key} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={`${uid}-correct`}
              checked={right}
              disabled={ro}
              onChange={() => edit(toggleCorrect(form, o.key), ['correct', 'choose'])}
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
                'min-w-[150px] flex-1 px-3 text-ink',
                phone ? 'h-[46px] text-base' : 'h-11 text-[15px]',
                right ? 'rounded-[10px] border-2 border-correct bg-correct-bg' : fieldBox(bad('options') && !o.text.trim()),
              )}
            />
            {!ro && (
              <span className="ml-auto flex gap-1.5">
                <button type="button" className={iconBtn} disabled={i === 0} aria-label={`Move option ${o.key} up`} onClick={() => edit(moveOption(form, o.key, -1), ['correct'])}>↑</button>
                <button type="button" className={iconBtn} disabled={i === form.options.length - 1} aria-label={`Move option ${o.key} down`} onClick={() => edit(moveOption(form, o.key, 1), ['correct'])}>↓</button>
                <button type="button" className={iconBtn} disabled={form.options.length <= MIN_OPTIONS} aria-label={`Remove option ${o.key}`} onClick={() => edit(removeOption(form, o.key), ['options', 'correct', 'choose'])}>×</button>
              </span>
            )}
          </div>
        );
      })}
      {!ro && (
        <div className="flex items-center gap-3">
          <Btn size="sm" onClick={() => edit(addOption(form), ['options'])} disabled={form.options.length >= MAX_OPTIONS}>+ Add option</Btn>
          <span className="text-[13px] text-muted">{form.options.length} of {MAX_OPTIONS} options (at least {MIN_OPTIONS})</span>
        </div>
      )}
    </fieldset>
  );

  const multiBox = multi && (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-page p-3.5">
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-semibold">Marking</legend>
        {([
          ['ALL_OR_NOTHING', 'All or nothing', 'The candidate gets the marks only when they pick exactly the correct options.'],
          ['PARTIAL', 'Partial credit', 'Each correct pick earns a share of the marks and each wrong pick cancels one. The review shows “Partly correct”.'],
        ] as const).map(([v, title, why]) => (
          <label key={v} className="flex min-h-11 items-start gap-2.5 text-[15px]">
            <input type="radio" name={`${uid}-scoring`} checked={form.scoring === v} disabled={ro} onChange={() => set('scoring', v)} className="mt-1 h-5 w-5 flex-none accent-brand" />
            <span className="flex flex-col"><span className="font-semibold">{title}</span><span className="text-[13px] text-muted">{why}</span></span>
          </label>
        ))}
      </fieldset>
      <label className={lab}>
        Choose how many (optional)
        <input
          type="number"
          min={1}
          max={form.options.length}
          inputMode="numeric"
          value={form.choose}
          readOnly={ro}
          aria-invalid={bad('choose') || undefined}
          onChange={(e) => set('choose', e.target.value)}
          className={cx(selectCls, 'max-w-40', bad('choose') && 'border-2 border-incorrect')}
        />
        <span className="text-[13px] font-normal text-muted">If set, candidates see “Choose {form.choose || 'N'}” and can pick no more than that. It tells them how many answers are correct, so leave it empty to keep that hidden.</span>
      </label>
    </div>
  );

  const caseBox = form.type === 'CASE_BASED' && (
    <div className={lab}>
      <label htmlFor={`${uid}-case`}>Case study</label>
      <select id={`${uid}-case`} value={form.caseId} disabled={ro} aria-invalid={bad('case') || undefined} onChange={(e) => set('caseId', e.target.value)} className={cx(selectCls, bad('case') && 'border-2 border-incorrect')}>
        <option value="">Choose a case study</option>
        {test.cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      <span className="text-[13px] font-normal text-muted">
        {test.cases.length === 0 ? 'This mock test has no case study yet. ' : 'A case-based question has one correct answer. '}
        <Link to={`/admin/exams/${testId}/cases`}>Manage case studies</Link>
      </span>
    </div>
  );

  const topic = (
    <label className={lab}>
      Topic
      <select value={form.topicId} disabled={ro} aria-invalid={bad('topic') || undefined} onChange={(e) => set('topicId', e.target.value)} className={cx(selectCls, bad('topic') && 'border-2 border-incorrect')}>
        {!form.topicId && <option value="">Choose a topic</option>}
        {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
  const section = (
    <label className={lab}>
      Section
      <select value={form.sectionId} disabled={ro} aria-invalid={bad('section') || undefined} onChange={(e) => set('sectionId', e.target.value)} className={cx(selectCls, bad('section') && 'border-2 border-incorrect')}>
        {!form.sectionId && <option value="">Choose a section</option>}
        {test.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
  const explanation = (
    <div className="flex flex-col gap-1.5">
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
    </div>
  );

  const sourcePanel = (
    <div className="flex flex-col gap-4">
      {stem}
      {typeSel}
      {options}
      {multiBox}
      {caseBox}
      {explanation}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-3">
        {topic}{section}{difficulty}{marks}
      </div>
    </div>
  );

  // ── Translation panel
  const trPanel = (lang: string) => {
    const t = trForm[lang] ?? emptyTranslation(savedKeys);
    const st = trState[lang]?.state ?? 'idle';
    const stateNow = statusFor(lang);
    const set2 = (patch: Partial<TranslationForm>) => {
      setTrForm((s) => ({ ...s, [lang]: { ...t, ...patch } }));
      setTrState((s) => ({ ...s, [lang]: { state: 'idle' } }));
    };
    const areaCls = cx(fieldBox(false), 'w-full resize-y px-3 py-2.5 text-[15px] leading-normal');
    const hasSaved = translationState(trInitial[lang] ?? emptyTranslation(savedKeys), savedKeys) !== 'missing';
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-ink-2">
          <strong>{languageName(lang)}</strong> · {TRANSLATION_LABEL[stateNow]}. Candidates who choose {languageName(lang)} see this text; anything left empty shows the {languageName(languages[0] ?? 'en')} text. The translation follows the saved options{formDirty ? ' (save the source changes first)' : ''}.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-${lang}-stem`} className="text-sm font-semibold">Question in {languageName(lang)}</label>
          <textarea id={`${uid}-${lang}-stem`} rows={3} value={t.stem} readOnly={ro} onChange={(e) => set2({ stem: e.target.value })} className={areaCls} />
          <span className="text-[13px] text-muted">{languageName(languages[0] ?? 'en')}: {initial.stem}</span>
        </div>
        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-1 p-0 text-sm font-semibold">Options in {languageName(lang)}</legend>
          {initial.options.map((o) => (
            <div key={o.key} className="flex flex-col gap-1">
              <label htmlFor={`${uid}-${lang}-${o.key}`} className="text-[13px] font-semibold text-ink-2">Option {o.key} <span className="font-normal text-muted">({o.text})</span></label>
              <input
                id={`${uid}-${lang}-${o.key}`}
                type="text"
                value={t.optionTexts[o.key] ?? ''}
                readOnly={ro}
                onChange={(e) => set2({ optionTexts: { ...t.optionTexts, [o.key]: e.target.value } })}
                className={cx(fieldBox(false), 'h-11 w-full px-3 text-[15px]')}
              />
            </div>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-${lang}-why`} className="text-sm font-semibold">Explanation in {languageName(lang)}</label>
          <textarea id={`${uid}-${lang}-why`} rows={3} value={t.explanation} readOnly={ro} onChange={(e) => set2({ explanation: e.target.value })} className={areaCls} />
        </div>
        {trState[lang]?.error && <div role="alert" className="rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">{trState[lang]!.error}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <Btn kind="primary" busy={st === 'saving'} whyDisabled={ro ? blockedWhy : undefined} onClick={() => saveTr.mutate(lang)}>Save {languageName(lang)} translation</Btn>
          <Btn onClick={() => set2(copySource({ stem: initial.stem, options: initial.options, explanation: initial.explanation }))} disabled={ro}>Copy the {languageName(languages[0] ?? 'en')} text</Btn>
          {hasSaved && !ro && <Btn kind="danger" onClick={() => setRemoveLang(lang)}>Remove translation</Btn>}
          <SaveStatus state={st} savedText={`${languageName(lang)} translation saved`} errorText="Could not save the translation." />
        </div>
      </div>
    );
  };

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

  const busy = save.isPending;
  const actions = ro ? (
    <Btn kind="primary" whyDisabled={blockedWhy}>{isNew ? 'Create & publish' : 'Publish change & resolve reports'}</Btn>
  ) : (
    <>
      <Btn onClick={() => run('draft')} busy={busy} size={phone ? 'lg' : 'md'} className={phone ? 'order-2' : undefined}>{isNew ? 'Create as draft' : 'Save draft'}</Btn>
      <Btn kind="primary" onClick={() => run('publish')} busy={busy} size={phone ? 'lg' : 'md'} className={phone ? 'order-1' : undefined}>
        {isNew ? 'Create & publish' : phone ? 'Publish & resolve reports' : 'Publish change & resolve reports'}
      </Btn>
    </>
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-muted">{subtitle}</span>
        {!phone && <h2 id={`${uid}-t`} className="m-0 text-[17px]">{isNew ? 'New question' : `Edit question ${data!.position.number} of ${data!.position.total}`}</h2>}
      </div>
      {!isNew && (
        <span className="flex gap-1.5">
          {prev ? <Link to={`/admin/exams/${testId}/q/${prev}`} aria-label="Previous question" className={arrow}>←</Link> : <button type="button" disabled aria-label="Previous question" className={cx(arrow, 'opacity-40')}>←</button>}
          {next ? <Link to={`/admin/exams/${testId}/q/${next}`} aria-label="Next question" className={arrow}>→</Link> : <button type="button" disabled aria-label="Next question" className={cx(arrow, 'opacity-40')}>→</button>}
        </span>
      )}
    </div>
  );

  const showTabs = otherLanguages.length > 0;
  const body = (
    <>
      {header}
      {data && <ReportBanner reports={data.reports} />}
      {showTabs && (
        <div role="tablist" aria-label="Language of the text" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {tabs.map((t, i) => {
            const code = i === 0 ? 'source' : t.code;
            const on = tab === code;
            return (
              <button
                key={code}
                type="button"
                role="tab"
                id={`${uid}-tab-${code}`}
                aria-selected={on}
                aria-controls={`${uid}-panel`}
                onClick={() => setTab(code)}
                className={cx('min-h-11 flex-none whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold', on ? 'border-link bg-brand-soft text-brand' : 'border-border-strong bg-white text-ink')}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
      <div role={showTabs ? 'tabpanel' : undefined} id={`${uid}-panel`} aria-labelledby={showTabs ? `${uid}-tab-${tab}` : undefined} className="flex flex-col gap-4">
        {tab === 'source' || !showTabs ? sourcePanel : trPanel(tab)}
      </div>
      {tab === 'source' && feedback}
      {tab === 'source' && (
        <>
          {note && <p className="m-0 rounded-[10px] bg-page px-3 py-2 text-[13px] text-ink-2">{note}</p>}
          <div className={cx('flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3')}>
            <span className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
              <span>{edited}{stats}</span>
              <SaveStatus state={saveState === 'error' ? 'idle' : saveState} className="!text-[13px]" />
            </span>
            <div className={cx('flex gap-2', phone ? 'w-full flex-col' : 'flex-row')}>
              <Btn onClick={() => { setPreviewLang(languages[0] ?? ''); setPreviewOpen(true); }} size={phone ? 'lg' : 'md'}>Preview as candidate</Btn>
              {actions}
            </div>
          </div>
          {!isNew && !ro && (
            <div>
              <Btn kind="danger" size="sm" onClick={() => setArchiveOpen(true)}>Archive question</Btn>
            </div>
          )}
        </>
      )}
      {tab !== 'source' && showTabs && (
        <div className="flex">
          <Btn onClick={() => { setPreviewLang(tab); setPreviewOpen(true); }}>Preview in {languageName(tab)}</Btn>
        </div>
      )}
    </>
  );

  const previewCaseId = form.type === 'CASE_BASED' ? form.caseId : '';
  const caseQ = useQuery({ queryKey: keys.caseStudy(previewCaseId), queryFn: () => getCase(previewCaseId), enabled: previewOpen && !!previewCaseId });
  const previewTr = previewLang && previewLang !== languages[0] ? trForm[previewLang] : null;
  const closeRef = useRef<HTMLButtonElement>(null);

  const dialogs = (
    <>
      {guard.dialog}
      <AdminDialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview as candidate" wide initialFocusRef={closeRef}>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-ink-2">This is how the question looks on the exam screen. It shows your unsaved changes, and nothing here is saved.</p>
          {languages.length > 1 && !isNew && (
            <label className={lab}>
              Language
              <select value={previewLang} onChange={(e) => setPreviewLang(e.target.value)} className={selectCls}>
                {languages.map((l) => <option key={l} value={l}>{languageName(l)}</option>)}
              </select>
            </label>
          )}
          <QuestionPreview content={previewContent(form, previewTr)} number={data?.position.number ?? test.questions.length + 1} caseStudy={caseQ.data} />
          <div className="flex justify-end">
            <button ref={closeRef} type="button" onClick={() => setPreviewOpen(false)} className="min-h-11 rounded-[10px] border border-input-border bg-white px-4 text-[15px] font-semibold text-ink">Close preview</button>
          </div>
        </div>
      </AdminDialog>
      {q && (
        <ActionDialog
          open={archiveOpen}
          onClose={() => setArchiveOpen(false)}
          title="Archive this question?"
          confirmLabel="Archive question"
          kind="danger"
          reason={false}
          submit={() => archiveQuestion(q.id)}
          onDone={() => {
            refresh();
            toast({ text: 'Question archived.' });
            guard.bypass(() => navigate(`/admin/exams/${testId}`));
          }}
        >
          <p className="m-0">Candidates will no longer see this question in the mock test. Attempts that already used it keep their history. It is recorded in the audit log.</p>
        </ActionDialog>
      )}
      {removeLang && (
        <ActionDialog
          open
          onClose={() => setRemoveLang(null)}
          title={`Remove the ${languageName(removeLang)} translation?`}
          confirmLabel="Remove translation"
          kind="danger"
          reason={false}
          submit={() => removeTr(removeLang)}
          onDone={() => toast({ text: `${languageName(removeLang)} translation removed.` })}
        >
          <p className="m-0">Candidates who choose {languageName(removeLang)} will see the {languageName(languages[0] ?? 'en')} text for this question.</p>
        </ActionDialog>
      )}
    </>
  );

  if (phone) {
    return (
      <>
        <section aria-label={isNew ? 'New question' : 'Edit question'} className="flex flex-col gap-3.5">{body}</section>
        {dialogs}
      </>
    );
  }
  return (
    <section aria-labelledby={`${uid}-t`} className={cx(fill, 'flex flex-col gap-4 rounded-[16px] border border-border bg-white p-[22px]')}>
      {body}
      {dialogs}
    </section>
  );
}
