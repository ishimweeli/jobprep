import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { archiveMockTest } from '../../api/admin';
import { contentKeys, deleteTest, duplicateTest, getChecklist, getConsequences, publishTest, restoreTest, unpublishTest, type PublishChecklist } from '../../api/content';
import type { TestStatus } from '../../api/types';
import { ActionDialog } from '../../components/ActionDialog';
import { TextField } from '../../components/forms';
import { ErrorBox, Loader } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Btn, Pill } from '../../components/ui';
import { TEST_TONE } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { denyHint } from '../../lib/permissions';
import { useAdmin } from '../auth/session';
import { checklistRow, describeLifecycleError, publishProblems, STATUS_WORDS } from './mockTestForm';

const TONE_CLASS = { ok: 'text-correct', block: 'text-incorrect', warn: 'text-flagged' } as const;

/** The publish checklist: blocking items stop publishing, the others only warn. */
export function ChecklistList({ checklist }: { checklist: PublishChecklist }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {checklist.items.map((item) => {
        const r = checklistRow(item);
        return (
          <li key={item.key} className="flex items-start gap-2.5 text-sm">
            <span aria-hidden="true" className={cx('inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-xs font-semibold', r.tone === 'ok' ? 'bg-correct-bg' : r.tone === 'block' ? 'bg-incorrect-bg' : 'bg-flagged-bg', TONE_CLASS[r.tone])}>{r.mark}</span>
            <span>
              <span className="sr-only">{r.tone === 'ok' ? 'Done: ' : r.tone === 'block' ? 'Must fix: ' : 'Warning: '}</span>
              {r.text}
              {r.detail && <span className="block text-xs text-muted">{r.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Status and state changes of one mock test (A9): the publish checklist, Publish, Unpublish with what it does to
 * candidates, Archive and Restore, Duplicate. Id `publish` is the anchor of the toolbar's "Publish" link.
 */
export function PublishPanel({ testId, title, status, dirty }: { testId: string; title: string; status: TestStatus; dirty: boolean }) {
  const admin = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<null | 'unpublish' | 'archive' | 'duplicate' | 'delete'>(null);
  const [copyTitle, setCopyTitle] = useState('');
  const [typedTitle, setTypedTitle] = useState('');
  const [publishError, setPublishError] = useState<string[]>([]);
  const hint = denyHint(admin.permissions, 'exams:write', 'change a mock test’s status');

  const checklist = useQuery({ queryKey: contentKeys.checklist(testId), queryFn: () => getChecklist(testId), enabled: status === 'DRAFT' });
  const consequences = useQuery({ queryKey: contentKeys.consequences(testId), queryFn: () => getConsequences(testId), enabled: dialog === 'unpublish', staleTime: 0 });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['admin', 'mock-test'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'exams'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'checklist'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] }),
    ]);
  };

  const publish = useMutation({
    mutationFn: () => publishTest(testId),
    onSuccess: async (r) => {
      setPublishError([]);
      const warn = r.warnings?.length ?? 0;
      toast({ text: warn > 0 ? `${title} is published, with ${warn} ${warn === 1 ? 'warning' : 'warnings'} (see the checklist).` : `${title} is published.` });
      await refresh();
    },
    onError: (e) => {
      const list = publishProblems(e);
      setPublishError(list.length ? list : [describeLifecycleError(e)]);
      void qc.invalidateQueries({ queryKey: ['admin', 'checklist'] });
    },
  });
  const restore = useMutation({
    mutationFn: () => restoreTest(testId),
    onSuccess: async () => {
      toast({ text: `${title} is back as a draft.` });
      await refresh();
    },
    onError: (e) => toast({ tone: 'error', text: describeLifecycleError(e) }),
  });

  const tone = TEST_TONE[status];
  const blocked = status === 'DRAFT' && checklist.data && !checklist.data.canPublish;
  const publishWhy = hint ?? (dirty ? 'Save your changes first, so the checklist matches what you see.' : blocked ? 'Fix the items marked as must-fix in the checklist first.' : undefined);
  const consequence = consequences.data;

  return (
    <section id="publish" aria-labelledby="mt-status" className="flex scroll-mt-4 flex-col gap-3.5 rounded-[16px] border border-border bg-white p-5 max-[899px]:rounded-[14px] max-[899px]:p-4">
      <div className="flex items-center justify-between gap-2.5">
        <h2 id="mt-status" className="m-0 text-[17px]">Status and publishing</h2>
        <Pill tone={tone}>{STATUS_WORDS[status]}</Pill>
      </div>

      {status === 'DRAFT' && (
        <>
          <p className="m-0 text-sm text-ink-2">A draft is hidden from candidates. Check the list, then publish.</p>
          {checklist.isPending ? <Loader label="Checking what is missing…" /> : checklist.isError ? <ErrorBox error={checklist.error} onRetry={() => void checklist.refetch()} /> : <ChecklistList checklist={checklist.data} />}
          {publishError.length > 0 && (
            <div role="alert" className="flex flex-col gap-0.5 rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">
              {publishError.map((m) => <span key={m}>{m}</span>)}
            </div>
          )}
          <Btn kind="primary" className="self-start" busy={publish.isPending} whyDisabled={publishWhy} onClick={() => publish.mutate()}>
            {publish.isPending ? 'Publishing…' : 'Publish'}
          </Btn>
        </>
      )}

      {status === 'PUBLISHED' && (
        <>
          <p className="m-0 text-sm text-ink-2">Candidates can see and start this test.</p>
          <Btn kind="danger" className="self-start" whyDisabled={hint} onClick={() => setDialog('unpublish')}>Unpublish…</Btn>
        </>
      )}

      {status === 'ARCHIVED' && (
        <>
          <p className="m-0 text-sm text-ink-2">An archived test is hidden from candidates and kept for history. Restore it to work on it again.</p>
          <Btn kind="primary" className="self-start" busy={restore.isPending} whyDisabled={hint} onClick={() => restore.mutate()}>Restore as draft</Btn>
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Btn whyDisabled={hint} onClick={() => { setCopyTitle(`${title} (copy)`); setDialog('duplicate'); }}>Duplicate…</Btn>
        {status !== 'ARCHIVED' && <Btn kind="danger" whyDisabled={hint} onClick={() => setDialog('archive')}>Archive…</Btn>}
        <Btn
          kind="danger"
          whyDisabled={hint ?? (status === 'PUBLISHED' ? 'Unpublish or archive it first. A published test cannot be deleted.' : undefined)}
          onClick={() => {
            setTypedTitle('');
            setDialog('delete');
          }}
        >
          Delete permanently…
        </Btn>
      </div>

      <ActionDialog
        open={dialog === 'unpublish'}
        onClose={() => setDialog(null)}
        title={`Unpublish ${title}?`}
        confirmLabel="Unpublish"
        kind="danger"
        reasonHint="Say why it is being taken down."
        submit={(reason) => unpublishTest(testId, reason)}
        onDone={() => {
          toast({ text: `${title} is a draft again. Candidates no longer see it.` });
          void refresh();
        }}
        errors={{ not_published: 'This test is not published.' }}
      >
        <p className="m-0">Candidates stop seeing this test, in the catalogue and by its link. Attempts that are already running keep going, and everyone’s results and history are kept.</p>
        {consequences.isPending ? <p className="m-0 text-sm text-muted">Counting attempts…</p> : consequence ? (
          <p className="m-0 font-semibold text-ink">
            Right now {consequence.attemptsInProgress.toLocaleString('en-US')} {consequence.attemptsInProgress === 1 ? 'attempt is' : 'attempts are'} in progress and {consequence.attemptsFinished.toLocaleString('en-US')} {consequence.attemptsFinished === 1 ? 'has' : 'have'} been finished.
          </p>
        ) : null}
      </ActionDialog>

      <ActionDialog
        open={dialog === 'archive'}
        onClose={() => setDialog(null)}
        title={`Archive ${title}?`}
        confirmLabel="Archive"
        kind="danger"
        reason={false}
        note="Archiving is recorded in the audit log. You can restore the test later."
        submit={() => archiveMockTest(testId)}
        onDone={() => {
          toast({ text: `${title} is archived.` });
          void refresh();
        }}
      >
        <p className="m-0">An archived test disappears for candidates. Results and history are kept. You can restore it as a draft.</p>
      </ActionDialog>

      <ActionDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title={`Delete ${title} permanently?`}
        confirmLabel="Delete permanently"
        kind="danger"
        reasonHint="Say why it is being deleted. This is kept in the audit log."
        fields={<TextField label="Type the test’s title to confirm" value={typedTitle} onChange={(e) => setTypedTitle(e.target.value)} autoComplete="off" />}
        fieldsOk={typedTitle.trim() === title.trim()}
        fieldsError="Type the title exactly as it is shown above."
        note="This cannot be undone. The content sync will not bring the test back."
        errors={{
          published: 'Unpublish or archive this test first. A published test cannot be deleted.',
          title_mismatch: 'The title you typed does not match. Nothing was deleted.',
          has_attempts: 'Candidates have taken this test, so deleting it would erase their results. It stays archived instead, hidden from candidates.',
          has_reports: 'Candidates reported questions in this test. Close those reports first, or keep the test archived.',
          in_use: 'Something still uses this test (a result or a report). Nothing was deleted; keep it archived.',
        }}
        submit={(reason) => deleteTest(testId, typedTitle, reason)}
        onDone={() => {
          toast({ text: `${title} was deleted.` });
          void refresh();
          navigate('/admin/exams', { replace: true });
        }}
      >
        <p className="m-0">This removes the test with its sections, case studies and questions. It only works for a test no candidate has taken; otherwise archive it, which already hides it.</p>
      </ActionDialog>

      <ActionDialog
        open={dialog === 'duplicate'}
        onClose={() => setDialog(null)}
        title="Duplicate this mock test"
        confirmLabel="Duplicate"
        reason={false}
        note="The copy is a draft in the same country. It copies the sections, case studies and questions (as drafts)."
        fields={<TextField label="Title of the copy" optional value={copyTitle} onChange={(e) => setCopyTitle(e.target.value)} />}
        submit={async () => {
          const copy = await duplicateTest(testId, copyTitle.trim() || undefined);
          toast({ text: `Copied with ${copy.questions} ${copy.questions === 1 ? 'question' : 'questions'}. You are now editing the copy.` });
          void refresh();
          navigate(`/admin/exams/${copy.id}/edit`);
        }}
      />
    </section>
  );
}
