import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createMockTest, getCatalogOptions, keys, patchMockTest } from '../../api/admin';
import { contentKeys, getCountryOptions, getMockTestEx, type CountryOption } from '../../api/content';
import { AdminShell } from '../../components/AdminShell';
import { ErrorBox, SaveStatus, Skeleton, type SaveState } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Btn, LinkButton, Pill } from '../../components/ui';
import { TEST_TONE } from '../../lib/badges';
import { allowedCountryCodes, useAdminCountry } from '../../lib/adminCountry';
import { countryName } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { PublishPanel } from './PublishPanel';
import { SectionsPanel } from './SectionsPanel';
import { TestFields } from './TestFields';
import {
  buildCreateBody, buildPatch, describeTestError, emptyForm, isDirty, toForm, validateForm, type MockTestForm, type TestProblems,
} from './mockTestForm';

const card = 'flex flex-col gap-4 rounded-[16px] border border-border bg-white p-[22px] max-[899px]:gap-3.5 max-[899px]:rounded-[14px] max-[899px]:p-4';

/**
 * Mock test form and publishing (A9). `/admin/exams/new` creates a draft (then opens it for editing),
 * `/admin/exams/:testId/edit` edits every field and holds the sections, the publish checklist and the state actions.
 * `?title=&country=` prefill the new form (the demand screens' "Plan exam" link).
 */
export function MockTestFormPage() {
  const { testId } = useParams();
  const isDesktop = useIsDesktop();
  const creating = !testId;
  const detail = useQuery({ queryKey: keys.mockTest(testId ?? ''), queryFn: () => getMockTestEx(testId!), enabled: !!testId });
  const title = creating ? 'New mock test' : 'Edit mock test';
  const back = testId ? `/admin/exams/${testId}` : '/admin/exams';

  let body: ReactNode;
  if (!creating && detail.isPending) body = <Skeleton label="Loading the mock test…" />;
  else if (!creating && detail.isError) body = <ErrorBox error={detail.error} onRetry={() => void detail.refetch()} />;
  else body = <FormBody key={testId ?? 'new'} testId={testId} detail={detail.data} desktop={isDesktop} />;

  return (
    <AdminShell title={title} back={isDesktop ? undefined : back}>
      {isDesktop && (
        <div className="flex flex-col gap-1">
          <Link to={back} className="self-start text-sm font-semibold">← {creating ? 'Exams & questions' : 'Back to the questions'}</Link>
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">{title}</h1>
        </div>
      )}
      {body}
    </AdminShell>
  );
}

function useCountryChoices(): CountryOption[] {
  const admin = useAdmin();
  const q = useQuery({ queryKey: contentKeys.countryOptions, queryFn: getCountryOptions, staleTime: 5 * 60_000 });
  return useMemo(() => q.data ?? allowedCountryCodes(admin.countryScope).map((code) => ({ code, name: countryName(code), status: '' })), [q.data, admin.countryScope]);
}

function FormBody({ testId, detail, desktop }: { testId?: string; detail?: Awaited<ReturnType<typeof getMockTestEx>>; desktop: boolean }) {
  const creating = !testId;
  const admin = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { country: filterCountry } = useAdminCountry();
  const catalog = useQuery({ queryKey: keys.catalog, queryFn: getCatalogOptions, staleTime: 5 * 60_000 });
  const countries = useCountryChoices();
  const canWrite = admin.permissions.includes('exams:write');
  const hint = denyHint(admin.permissions, 'exams:write', 'change mock tests');

  const [initial, setInitial] = useState<MockTestForm>(() => {
    if (detail) return toForm(detail);
    const wanted = (sp.get('country') ?? filterCountry ?? '').toUpperCase();
    return emptyForm({ title: sp.get('title') ?? '', country: wanted });
  });
  const [form, setForm] = useState(initial);
  const [problems, setProblems] = useState<TestProblems>({});
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const dirty = isDirty(initial, form);
  const guard = useUnsavedChanges(dirty && canWrite);

  // A single country to choose from is chosen for the person.
  useEffect(() => {
    if (creating && !form.countryCode && countries.length === 1) setForm((f) => ({ ...f, countryCode: countries[0]!.code }));
  }, [creating, countries, form.countryCode]);

  // "Publish" in the toolbar links to #publish
  useEffect(() => {
    if (detail && window.location.hash === '#publish') document.getElementById('publish')?.scrollIntoView();
  }, [detail]);

  const set = <K extends keyof MockTestForm>(k: K, v: MockTestForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setState('idle');
    setServerMsg(null);
    setProblems({});
  };

  const save = useMutation({
    mutationFn: async () => {
      if (creating) return createMockTest(buildCreateBody(form));
      await patchMockTest(testId, buildPatch(initial, form));
      return { id: testId };
    },
    onMutate: () => setState('saving'),
    onSuccess: async (r) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'exams'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'checklist'] });
      if (creating) {
        toast({ text: 'The draft is created. Add sections and questions, then publish.' });
        guard.bypass(() => navigate(`/admin/exams/${r.id}/edit`, { replace: true }));
        return;
      }
      const fresh = await qc.fetchQuery({ queryKey: keys.mockTest(testId), queryFn: () => getMockTestEx(testId), staleTime: 0 });
      const next = toForm(fresh);
      setInitial(next);
      setForm(next);
      setState('saved');
      toast({ text: 'Saved.' });
    },
    onError: (e) => {
      setState('error');
      const d = describeTestError(e);
      if (d.field) setProblems({ [d.field]: d.message });
      else setServerMsg(d.message);
    },
  });

  const run = () => {
    setServerMsg(null);
    const found = validateForm(form, creating);
    setProblems(found);
    if (Object.keys(found).length > 0) {
      setState('error');
      return;
    }
    if (!creating && !dirty) {
      setState('saved');
      return;
    }
    save.mutate();
  };

  const status = detail?.mockTest.status;
  const first = Object.values(problems)[0];

  const fields = (
    <section aria-labelledby="mt-fields" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="mt-fields" className="m-0 text-[17px]">{creating ? 'Details' : 'Test details'}</h2>
        {status && <Pill tone={TEST_TONE[status]}>{TEST_TONE[status].label}</Pill>}
      </div>
      {!canWrite && <p role="note" className="m-0 rounded-[10px] bg-soft px-3.5 py-2.5 text-sm text-ink-2">{hint} You can read everything here.</p>}
      <TestFields form={form} set={set} problems={problems} readOnly={!canWrite} creating={creating} catalog={catalog.data} countries={countries} extras={detail?.mockTest} />
      {first && <div role="alert" className="rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">{first}</div>}
      {serverMsg && <div role="alert" className="rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">{serverMsg}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <SaveStatus state={state} savedText="Saved" />
        <div className="flex flex-wrap gap-2">
          <LinkButton to={testId ? `/admin/exams/${testId}` : '/admin/exams'}>{dirty ? 'Cancel' : 'Close'}</LinkButton>
          <Btn kind="primary" busy={save.isPending} whyDisabled={canWrite ? undefined : hint} onClick={run}>
            {save.isPending ? 'Saving…' : creating ? 'Create draft' : 'Save changes'}
          </Btn>
        </div>
      </div>
    </section>
  );

  const side = testId && detail && (
    <>
      <PublishPanel testId={testId} title={detail.mockTest.title} status={detail.mockTest.status} dirty={dirty} />
      <SectionsPanel testId={testId} sections={detail.sections} />
      <nav aria-label="This test" className="flex flex-wrap gap-2">
        <LinkButton to={`/admin/exams/${testId}/cases`}>Case studies</LinkButton>
        <LinkButton to={`/admin/exams/${testId}/import`}>Import questions (CSV)</LinkButton>
        <LinkButton to={`/admin/exams/${testId}`}>Questions</LinkButton>
      </nav>
    </>
  );

  return (
    <>
      {desktop ? (
        <div className="flex flex-wrap items-start gap-[18px]">
          <div className="min-w-0 flex-[999_1_560px]">{fields}</div>
          {side && <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-[18px]">{side}</div>}
        </div>
      ) : (
        <>
          {fields}
          {side}
        </>
      )}
      {guard.dialog}
    </>
  );
}
