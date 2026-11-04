import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createCase, deleteCase, getMockTest, keys, patchCase } from '../../api/admin';
import {
  attachToCase, contentKeys, deleteCaseTranslation, detachFromCase, getCaseFull, getCasesList, getMockTestEx, putCaseTranslation, type CaseFull,
} from '../../api/content';
import type { ExamCase } from '../../../api/types';
import { ActionDialog } from '../../components/ActionDialog';
import { AdminShell } from '../../components/AdminShell';
import { SelectField } from '../../components/forms';
import { EmptyState, ErrorBox, SaveStatus, Skeleton, type SaveState } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Btn, LinkButton, Pill } from '../../components/ui';
import { cx } from '../../lib/cx';
import { languageName, plural } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';
import { CasePanel } from '../../../features/exam/CasePanel';
import { useAdmin } from '../auth/session';
import { CaseFields } from './CaseFields';
import {
  buildCaseBody, COMPLETENESS_WORDS, completeness, copyOf, describeCaseError, emptyCaseForm, isCaseDirty, toCaseForm, validateCase, type CaseForm, type CaseProblems,
} from './caseForm';
import { blockedByCounts, guarded } from './catalogModel';

const card = 'flex min-w-0 flex-col gap-4 rounded-[16px] border border-border bg-white p-[22px] max-[899px]:gap-3.5 max-[899px]:rounded-[14px] max-[899px]:p-4';
const TAB = 'min-h-11 rounded-full border px-4 text-sm font-semibold';

/** Case studies of one test (A8): `/admin/exams/:testId/cases` is the list, `.../cases/:caseId` the editor (`new` creates). */
export function CasePage() {
  const { testId = '', caseId } = useParams();
  const isDesktop = useIsDesktop();
  const test = useQuery({ queryKey: keys.mockTest(testId), queryFn: () => getMockTestEx(testId) });
  const title = caseId ? (caseId === 'new' ? 'New case study' : 'Case study') : 'Case studies';
  const backTo = caseId ? `/admin/exams/${testId}/cases` : `/admin/exams/${testId}`;

  return (
    <AdminShell title={title} back={isDesktop ? undefined : backTo}>
      {isDesktop && (
        <div className="flex flex-col gap-1">
          <Link to={backTo} className="self-start text-sm font-semibold">← {caseId ? 'Case studies' : 'Back to the questions'}</Link>
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">{title}</h1>
          <span className="text-sm text-muted">{test.data?.mockTest.title ?? ' '}</span>
        </div>
      )}
      {test.isError ? <ErrorBox error={test.error} onRetry={() => void test.refetch()} /> : test.isPending ? <Skeleton label="Loading the mock test…" /> : caseId ? (
        <CaseEditor key={caseId} testId={testId} caseId={caseId} languages={test.data.mockTest.languages} />
      ) : (
        <CaseList testId={testId} />
      )}
    </AdminShell>
  );
}

function CaseList({ testId }: { testId: string }) {
  const admin = useAdmin();
  const hint = denyHint(admin.permissions, 'exams:write', 'add case studies');
  const list = useQuery({ queryKey: contentKeys.cases(testId), queryFn: () => getCasesList(testId) });
  return (
    <section aria-labelledby="cs-list" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="cs-list" className="m-0 text-[17px]">Case studies of this test</h2>
        {hint ? <Btn kind="primary" size="sm" whyDisabled={hint}>+ New case study</Btn> : <LinkButton to={`/admin/exams/${testId}/cases/new`} kind="primary" size="sm">+ New case study</LinkButton>}
      </div>
      <p className="m-0 text-[13px] text-muted">A case study is a passage with tables and notes that several questions share. Candidates read it beside each question.</p>
      {list.isPending ? <Skeleton label="Loading case studies…" /> : list.isError ? <ErrorBox error={list.error} onRetry={() => void list.refetch()} /> : list.data.length === 0 ? (
        <EmptyState title="No case studies yet" hint="Add one, then attach the questions that use it." />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {list.data.map((c) => (
            <li key={c.id} className="flex flex-col gap-1.5 border-t border-soft py-3 first:border-t-0 min-[600px]:flex-row min-[600px]:items-center">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{c.title}</span>
                <span className="text-[13px] text-muted">{plural(c.questions, 'question')} attached · {c.translations.length ? `translated: ${c.translations.map(languageName).join(', ')}` : 'no translations'}</span>
              </span>
              <LinkButton to={`/admin/exams/${testId}/cases/${c.id}`} size="sm" aria-label={`${hint ? 'View' : 'Edit'} ${c.title}`}>{hint ? 'View' : 'Edit'}</LinkButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Tab = 'case' | 'questions' | 'preview' | 'translations';

function CaseEditor({ testId, caseId, languages }: { testId: string; caseId: string; languages: string[] }) {
  const creating = caseId === 'new';
  const q = useQuery({ queryKey: contentKeys.caseFull(caseId), queryFn: () => getCaseFull(caseId), enabled: !creating });
  if (!creating && q.isPending) return <Skeleton label="Loading the case study…" />;
  if (!creating && q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  return <EditorBody testId={testId} data={q.data} languages={languages} />;
}

function EditorBody({ testId, data, languages }: { testId: string; data?: CaseFull; languages: string[] }) {
  const creating = !data;
  const admin = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const canWrite = admin.permissions.includes('exams:write');
  const hint = denyHint(admin.permissions, 'exams:write', 'change case studies');
  const [tab, setTab] = useState<Tab>('case');
  const [initial, setInitial] = useState<CaseForm>(() => (data ? toCaseForm(data) : emptyCaseForm()));
  const [form, setForm] = useState(initial);
  const [problems, setProblems] = useState<CaseProblems>({});
  const [state, setState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const deleteErrors = useRef<Record<string, string>>({});
  const dirty = isCaseDirty(initial, form);
  const [transDirty, setTransDirty] = useState(false);
  const guard = useUnsavedChanges((dirty || transDirty) && canWrite);
  const caseId = data?.id;

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['admin', 'cases'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'case-full'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'mock-test'] }),
    qc.invalidateQueries({ queryKey: ['admin', 'question'] }),
  ]);

  const save = useMutation({
    mutationFn: async () => {
      const body = buildCaseBody(form);
      if (!caseId) return createCase(testId, body);
      await patchCase(caseId, body);
      return { id: caseId };
    },
    onMutate: () => setState('saving'),
    onSuccess: async (r) => {
      void refresh();
      if (!caseId) {
        toast({ text: 'Case study created. Now attach the questions that use it.' });
        guard.bypass(() => navigate(`/admin/exams/${testId}/cases/${r.id}`, { replace: true }));
        return;
      }
      setInitial(form);
      setState('saved');
      toast({ text: 'Case study saved.' });
    },
    onError: (e) => {
      setState('error');
      setMessage(describeCaseError(e));
    },
  });

  const run = () => {
    setMessage(null);
    const found = validateCase(form);
    setProblems(found);
    if (Object.keys(found).length > 0) {
      setState('error');
      return;
    }
    save.mutate();
  };
  const change = (f: CaseForm) => {
    setForm(f);
    setProblems({});
    setState('idle');
    setMessage(null);
  };

  const attached = data?.attachedQuestions ?? [];
  const source = languages[0] ?? 'en';
  const others = languages.slice(1);
  const blocked = blockedByCounts({ questions: data?.questions ?? 0 }, 'case study', 'Detach the questions first.');

  const tabs: { id: Tab; label: string; off?: boolean }[] = [
    { id: 'case', label: 'Case' },
    { id: 'questions', label: 'Questions', off: creating },
    { id: 'preview', label: 'Preview', off: creating },
    { id: 'translations', label: 'Translations', off: creating },
  ];
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const enabled = tabs.filter((t) => !t.off);
    const i = enabled.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowRight' ? enabled[(i + 1) % enabled.length] : e.key === 'ArrowLeft' ? enabled[(i - 1 + enabled.length) % enabled.length] : undefined;
    if (next) {
      e.preventDefault();
      setTab(next.id);
      document.getElementById(`cs-tab-${next.id}`)?.focus();
    }
  };

  let panel: ReactNode;
  if (tab === 'case') {
    panel = (
      <>
        {!canWrite && <p role="note" className="m-0 rounded-[10px] bg-soft px-3.5 py-2.5 text-sm text-ink-2">{hint} You can read everything here.</p>}
        <CaseFields form={form} onChange={change} readOnly={!canWrite} problems={problems} />
        {message && <div role="alert" className="rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">{message}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <SaveStatus state={state} />
          <div className="flex flex-wrap gap-2">
            {!creating && <Btn kind="danger" whyDisabled={hint ?? blocked} onClick={() => { deleteErrors.current = {}; setShowDelete(true); }}>Delete case study</Btn>}
            <Btn kind="primary" busy={save.isPending} whyDisabled={hint} onClick={run}>{save.isPending ? 'Saving…' : creating ? 'Create case study' : 'Save case study'}</Btn>
          </div>
        </div>
      </>
    );
  } else if (tab === 'questions' && data) {
    panel = <AttachPanel testId={testId} caseData={data} canWrite={canWrite} hint={hint} onChanged={() => void refresh()} />;
  } else if (tab === 'preview' && data) {
    panel = <PreviewPanel source={form} sourceLang={source} caseData={data} />;
  } else if (tab === 'translations' && data) {
    panel = <TranslationsPanel caseData={data} source={initial} languages={others} canWrite={canWrite} hint={hint} onChanged={() => void refresh()} onDirtyChange={setTransDirty} />;
  }

  return (
    <section aria-labelledby="cs-title" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="cs-title" className="m-0 text-[17px]">{creating ? 'New case study' : initial.title}</h2>
        {!creating && <Pill tone={{ bg: '#EEF1F5', ink: '#3A3F4A' }}>{plural(attached.length, 'question')} attached</Pill>}
      </div>
      <div role="tablist" aria-label="Case study sections" className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`cs-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="cs-panel"
            tabIndex={tab === t.id ? 0 : -1}
            disabled={t.off}
            title={t.off ? 'Save the case study first' : undefined}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
            className={cx(TAB, tab === t.id ? 'border-link bg-brand-soft text-brand' : 'border-border-strong bg-white text-ink', t.off && 'opacity-50')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="cs-panel" role="tabpanel" aria-labelledby={`cs-tab-${tab}`} className="flex flex-col gap-4">{panel}</div>

      <ActionDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title={`Delete “${initial.title}”?`}
        confirmLabel="Delete case study"
        kind="danger"
        reason={false}
        errors={deleteErrors.current}
        note="Deleting is recorded in the audit log. A case study that questions still use cannot be deleted."
        submit={() => guarded(deleteErrors.current, 'case_in_use', 'case study', 'Detach the questions first.', () => deleteCase(caseId!))}
        onDone={() => {
          toast({ text: 'Case study deleted.' });
          void refresh();
          guard.bypass(() => navigate(`/admin/exams/${testId}/cases`, { replace: true }));
        }}
      >
        <p className="m-0">The passage, tables, notes and translations are removed. No question uses it.</p>
      </ActionDialog>
      {guard.dialog}
    </section>
  );
}

/** Which questions use this case, and a picker for more (single-answer questions of the same test). */
function AttachPanel({ testId, caseData, canWrite, hint, onChanged }: { testId: string; caseData: CaseFull; canWrite: boolean; hint?: string; onChanged: () => void }) {
  const toast = useToast();
  const test = useQuery({ queryKey: keys.mockTest(testId), queryFn: () => getMockTest(testId) });
  const attached = caseData.attachedQuestions ?? [];
  const attachedIds = new Set(attached.map((a) => a.id));
  const free = (test.data?.questions ?? []).filter((x) => x.type === 'SINGLE_CHOICE' && !attachedIds.has(x.id));
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (go: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await go();
      toast({ text: done });
      setPicked([]);
      onChanged();
    } catch (e) {
      setError(describeCaseError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="cs-att" className="flex flex-col gap-2">
        <h3 id="cs-att" className="m-0 text-[15px]">Attached questions</h3>
        {attached.length === 0 ? <p className="m-0 text-sm text-muted">No question uses this case study yet.</p> : (
          <ul className="m-0 flex list-none flex-col p-0">
            {attached.map((a) => (
              <li key={a.id} className="flex flex-col gap-1.5 border-t border-soft py-2.5 first:border-t-0 min-[600px]:flex-row min-[600px]:items-center">
                <span className="flex-1 text-sm"><strong>Question {a.number}.</strong> {a.stem}</span>
                {canWrite && <Btn size="sm" kind="danger" disabled={busy} aria-label={`Detach question ${a.number}`} onClick={() => void run(() => detachFromCase(caseData.id, [a.id]), `Question ${a.number} no longer uses this case study.`)}>Detach</Btn>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="cs-pick" className="flex flex-col gap-2">
        <h3 id="cs-pick" className="m-0 text-[15px]">Attach more questions</h3>
        <p className="m-0 text-[13px] text-muted">Only single-answer questions of this test can use a case study.</p>
        {test.isPending ? <Skeleton label="Loading the questions…" /> : test.isError ? <ErrorBox error={test.error} onRetry={() => void test.refetch()} /> : free.length === 0 ? (
          <p className="m-0 text-sm text-muted">Every single-answer question of this test is already attached.</p>
        ) : (
          <fieldset className="m-0 flex max-h-[320px] flex-col overflow-y-auto border-0 p-0">
            <legend className="sr-only">Questions that can be attached</legend>
            {free.map((x) => (
              <label key={x.id} className="flex min-h-11 items-start gap-2.5 border-t border-soft py-2 text-sm first:border-t-0">
                <input type="checkbox" className="mt-0.5 h-5 w-5 flex-none accent-brand" disabled={!canWrite} checked={picked.includes(x.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, x.id] : picked.filter((p) => p !== x.id))} />
                <span><strong>Question {x.number}.</strong> {x.stem}</span>
              </label>
            ))}
          </fieldset>
        )}
        {error && <div role="alert" className="rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">{error}</div>}
        <Btn kind="primary" className="self-start" busy={busy} disabled={picked.length === 0} whyDisabled={hint} onClick={() => void run(() => attachToCase(caseData.id, picked), `${plural(picked.length, 'question')} attached.`)}>
          Attach {picked.length > 0 ? plural(picked.length, 'question') : 'selected questions'}
        </Btn>
      </section>
    </div>
  );
}

/** The case exactly as candidates see it (the exam's own panel), from the text on screen, in any language that has one. */
function PreviewPanel({ source, sourceLang, caseData }: { source: CaseForm; sourceLang: string; caseData: CaseFull }) {
  const translations = caseData.translations ?? [];
  const [lang, setLang] = useState(sourceLang);
  const shown = lang === sourceLang ? source : toCaseForm(translations.find((t) => t.language === lang) ?? source);
  const body = buildCaseBody(shown);
  const numbers = (caseData.attachedQuestions ?? []).map((a) => a.number);
  const asCase: ExamCase = { id: caseData.id, title: body.title || 'Untitled case study', passage: body.passage, tables: body.tables, notes: body.notes, questionNumbers: numbers };
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-muted">This is the case panel candidates read beside each question. It shows the text now on screen, saved or not.{numbers.length === 0 ? ' No questions are attached yet, so the question range is blank.' : ''}</p>
      {translations.length > 0 && (
        <SelectField label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className="max-w-[240px]">
          <option value={sourceLang}>{languageName(sourceLang)}</option>
          {translations.map((t) => <option key={t.language} value={t.language}>{languageName(t.language)}</option>)}
        </SelectField>
      )}
      <div className="rounded-[14px] border border-dashed border-input-border bg-page p-3 max-[899px]:p-2">
        <CasePanel c={asCase} className="flex" />
      </div>
    </div>
  );
}

function TranslationsPanel({ caseData, source, languages, canWrite, hint, onChanged, onDirtyChange }: { caseData: CaseFull; source: CaseForm; languages: string[]; canWrite: boolean; hint?: string; onChanged: () => void; onDirtyChange: (d: boolean) => void }) {
  const [lang, setLang] = useState(languages[0] ?? '');
  const trans = useMemo(() => new Map((caseData.translations ?? []).map((t) => [t.language, t])), [caseData.translations]);
  if (languages.length === 0) {
    return <EmptyState title="This test has one language" hint="Add Kinyarwanda or Kiswahili on the test’s page to translate its case studies." />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Translation language" className="flex flex-wrap gap-1.5">
        {languages.map((l) => {
          const c = completeness(source, trans.get(l) ? toCaseForm(trans.get(l)!) : undefined);
          return (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={cx(TAB, lang === l ? 'border-link bg-brand-soft text-brand' : 'border-border-strong bg-white text-ink')}>
              {languageName(l)} · {COMPLETENESS_WORDS[c]}
            </button>
          );
        })}
      </div>
      <TranslationEditor key={`${caseData.id}-${lang}`} caseData={caseData} lang={lang} source={source} existing={trans.get(lang)} canWrite={canWrite} hint={hint} onChanged={onChanged} onDirtyChange={onDirtyChange} />
    </div>
  );
}

function TranslationEditor({ caseData, lang, source, existing, canWrite, hint, onChanged, onDirtyChange }: { caseData: CaseFull; lang: string; source: CaseForm; existing?: NonNullable<CaseFull['translations']>[number]; canWrite: boolean; hint?: string; onChanged: () => void; onDirtyChange: (d: boolean) => void }) {
  const toast = useToast();
  const [initial, setInitial] = useState<CaseForm>(() => (existing ? toCaseForm(existing) : { title: '', passage: [''], tables: [], notes: [] }));
  const [form, setForm] = useState(initial);
  const [state, setState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [problems, setProblems] = useState<CaseProblems>({});
  const [removing, setRemoving] = useState(false);
  const dirty = isCaseDirty(initial, form);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const c = completeness(source, form);

  const save = async () => {
    setMessage(null);
    const found = validateCase(form);
    setProblems(found);
    if (Object.keys(found).length > 0) {
      setState('error');
      return;
    }
    setState('saving');
    try {
      await putCaseTranslation(caseData.id, lang, buildCaseBody(form));
      setInitial(form);
      setState('saved');
      toast({ text: `${languageName(lang)} translation saved.` });
      onChanged();
    } catch (e) {
      setState('error');
      setMessage(describeCaseError(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="m-0 text-sm font-semibold">{languageName(lang)}: {COMPLETENESS_WORDS[c]}</p>
        {canWrite && <Btn size="sm" onClick={() => { setForm(copyOf(source)); setState('idle'); }}>Copy the English text to start</Btn>}
      </div>
      <details className="rounded-[10px] border border-border bg-page px-3.5 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">The English text, for reference</summary>
        <div className="mt-2 flex flex-col gap-1.5 text-ink-2">
          <strong>{source.title}</strong>
          {source.passage.map((p, i) => <p key={i} className="m-0">{p}</p>)}
        </div>
      </details>
      <CaseFields form={form} onChange={(f) => { setForm(f); setState('idle'); setProblems({}); }} readOnly={!canWrite} problems={problems} titleLabel={`Title in ${languageName(lang)}`} />
      {message && <div role="alert" className="rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">{message}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <SaveStatus state={state} />
        <div className="flex flex-wrap gap-2">
          {existing && <Btn kind="danger" whyDisabled={hint} onClick={() => setRemoving(true)}>Remove translation</Btn>}
          <Btn kind="primary" whyDisabled={hint} busy={state === 'saving'} onClick={() => void save()}>Save {languageName(lang)}</Btn>
        </div>
      </div>
      <ActionDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title={`Remove the ${languageName(lang)} translation?`}
        confirmLabel="Remove translation"
        kind="danger"
        reason={false}
        submit={() => deleteCaseTranslation(caseData.id, lang)}
        onDone={() => {
          toast({ text: `${languageName(lang)} translation removed.` });
          setInitial({ title: '', passage: [''], tables: [], notes: [] });
          setForm({ title: '', passage: [''], tables: [], notes: [] });
          onChanged();
        }}
      >
        <p className="m-0">Candidates reading in {languageName(lang)} will see the English case study instead.</p>
      </ActionDialog>
    </div>
  );
}
