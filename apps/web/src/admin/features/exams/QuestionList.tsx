import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getMockTestFull, keys } from '../../api/admin';
import { reorderQuestions } from '../../api/questions-demand';
import { EmptyState, SaveStatus, Skeleton, type SaveState } from '../../components/states';
import { ErrorBox } from '../../components/states';
import { LinkButton, Pill } from '../../components/ui';
import { TEST_TONE } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { plural } from '../../lib/format';
import { describeAdminError } from '../../lib/apiErrors';
import { denyHint } from '../../lib/permissions';
import { useAdmin } from '../auth/session';
import { excerpt, moveId, TYPE_BADGE } from './questionForm';

/**
 * The questions of one mock test, in the order candidates meet them (A10): number, start of the question, type, status,
 * open reports, Move up / Move down (saved at once with `POST /mock-tests/:id/questions/reorder`) and "Add question".
 * Desktop: a card under the editor. Phone: a section above it that opens and closes.
 */
export function QuestionList({ testId, activeId, phone }: { testId: string; activeId?: string; phone: boolean }) {
  const admin = useAdmin();
  const qc = useQueryClient();
  const canWrite = admin.permissions.includes('exams:write');
  const why = denyHint(admin.permissions, 'exams:write', 'change the order');
  const [open, setOpen] = useState(!phone);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const test = useQuery({ queryKey: keys.mockTest(testId), queryFn: () => getMockTestFull(testId) });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderQuestions(testId, ids),
    onMutate: () => { setState('saving'); setError(''); },
    onSuccess: async () => {
      setState('saved');
      await qc.invalidateQueries({ queryKey: keys.mockTest(testId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'question'] });
    },
    onError: (e) => { setState('error'); setError(describeAdminError(e, { ids_mismatch: 'The list changed while you were working. Reload the page and try again.' })); },
  });

  const questions = test.data?.questions ?? [];
  const ids = questions.map((q) => q.id);
  const add = canWrite ? (
    <LinkButton to={`/admin/exams/${testId}/q/new`} kind="primary" size={phone ? 'lg' : 'md'}>Add question</LinkButton>
  ) : null;

  const rows = (
    <ol className="m-0 flex list-none flex-col p-0">
      {questions.map((q, i) => (
        <li key={q.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-soft px-1 py-2.5', q.id === activeId && 'bg-brand-softer')}>
          <span className="w-7 flex-none text-sm font-semibold text-muted tabular">{q.number}</span>
          <Link to={`/admin/exams/${testId}/q/${q.id}`} aria-current={q.id === activeId ? 'true' : undefined} className="min-w-[160px] flex-1 text-sm font-semibold text-ink no-underline hover:text-ink">
            {excerpt(q.stem)}
          </Link>
          <span className="flex flex-wrap items-center gap-1.5">
            <Pill tone={{ bg: '#EEF1F5', ink: '#3A3F4A' }} className="px-2 py-0.5 !text-[11px]">{TYPE_BADGE[q.type]}</Pill>
            <Pill tone={TEST_TONE[q.status]} className="px-2 py-0.5 !text-[11px]">{TEST_TONE[q.status].label}</Pill>
            {q.openReports > 0 && <Pill tone={{ bg: '#FDF1DD', ink: '#8A5300' }} className="px-2 py-0.5 !text-[11px]">{q.openReports} reported</Pill>}
          </span>
          {canWrite && (
            <span className="ml-auto flex gap-1.5">
              <button
                type="button"
                aria-label={`Move question ${q.number} up`}
                disabled={i === 0 || reorder.isPending}
                onClick={() => reorder.mutate(moveId(ids, q.id, -1))}
                className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-input-border bg-white text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move question ${q.number} down`}
                disabled={i === questions.length - 1 || reorder.isPending}
                onClick={() => reorder.mutate(moveId(ids, q.id, 1))}
                className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-input-border bg-white text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↓
              </button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );

  const content = test.isPending ? (
    <Skeleton label="Loading the questions…" />
  ) : test.isError ? (
    <ErrorBox error={test.error} onRetry={() => void test.refetch()} />
  ) : questions.length === 0 ? (
    <EmptyState title="This mock test has no questions yet." hint={canWrite ? 'Add a question here, or import many at once from a CSV file.' : undefined} action={add} />
  ) : (
    <>
      {rows}
      {error && <p role="alert" className="m-0 rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3 text-sm font-semibold text-incorrect">{error}</p>}
      <SaveStatus state={state === 'error' ? 'idle' : state} savedText="Order saved" />
      {!canWrite && why && <p className="m-0 text-xs text-muted">{why}</p>}
    </>
  );

  const title = `Questions in this test${test.data ? ` · ${plural(questions.length, 'question')}` : ''}`;
  if (phone) {
    return (
      <section aria-label="Questions in this test" className="flex flex-col gap-2 rounded-[14px] border border-border bg-white p-4">
        <button type="button" aria-expanded={open} aria-controls="ql-body" onClick={() => setOpen((o) => !o)} className="flex min-h-11 items-center justify-between gap-2 border-0 bg-transparent p-0 text-left text-base font-semibold text-ink">
          {title}
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        <div id="ql-body" hidden={!open} className="flex flex-col gap-2">
          {content}
          {questions.length > 0 && add}
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="ql-t" className="flex w-full min-w-0 flex-col gap-2 rounded-[16px] border border-border bg-white p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="ql-t" className="m-0 text-[17px]">{title}</h2>
        {questions.length > 0 && add}
      </div>
      {content}
    </section>
  );
}
