import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createSection, deleteSection, patchSection } from '../../api/admin';
import { reorderSections } from '../../api/content';
import type { MockTestDetailFull } from '../../api/types';
import { ActionDialog } from '../../components/ActionDialog';
import { TextField } from '../../components/forms';
import { EmptyState } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Btn } from '../../components/ui';
import { describeAdminError } from '../../lib/apiErrors';
import { plural } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { useAdmin } from '../auth/session';
import { blockedByCounts, checkName, guarded, idsAfterMove, movedAnnouncement } from './catalogModel';

type Section = MockTestDetailFull['sections'][number];
const DEFAULT_LABEL = 'Multiple choice';

/** The sections of a test (A7): add, rename with the question-type label, reorder, delete with the "used by N questions" guard. */
export function SectionsPanel({ testId, sections }: { testId: string; sections: Section[] }) {
  const admin = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const hint = denyHint(admin.permissions, 'exams:write', 'change sections');
  const [order, setOrder] = useState(sections);
  const [live, setLive] = useState('');
  const [edit, setEdit] = useState<null | { id?: string; name: string; label: string }>(null);
  const [del, setDel] = useState<Section | null>(null);
  const errors = useRef<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  useEffect(() => setOrder(sections), [sections]);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'mock-test'] }), qc.invalidateQueries({ queryKey: ['admin', 'exams'] })]);

  const move = async (i: number, to: number) => {
    const ids = idsAfterMove(order, i, to);
    const before = order;
    const byId = new Map(order.map((s) => [s.id, s]));
    setOrder(ids.map((id) => byId.get(id)!));
    try {
      await reorderSections(testId, ids);
      setLive(movedAnnouncement(before[i]!.name, to + 1, before.length));
      void refresh();
    } catch (e) {
      setOrder(before);
      toast({ tone: 'error', text: describeAdminError(e) });
    }
  };

  const nameProblem = edit && tried ? checkName(edit.name) : undefined;
  const labelProblem = edit && tried ? checkName(edit.label, 2, 80) : undefined;

  return (
    <section aria-labelledby="mt-sections" className="flex flex-col gap-3 rounded-[16px] border border-border bg-white p-5 max-[899px]:rounded-[14px] max-[899px]:p-4">
      <div className="flex items-center justify-between gap-2.5">
        <h2 id="mt-sections" className="m-0 text-[17px]">Sections</h2>
        <Btn kind="outline-brand" size="sm" whyDisabled={hint} onClick={() => { setTried(false); setEdit({ name: '', label: DEFAULT_LABEL }); }}>+ Add a section</Btn>
      </div>
      <p className="m-0 text-[13px] text-muted">Questions are grouped in sections, in this order. The label tells candidates what kind of questions the section holds.</p>
      <p role="status" className="sr-only">{live}</p>
      {order.length === 0 ? (
        <EmptyState title="No sections yet" hint="Add one before adding questions: every question belongs to a section." className="p-4" />
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {order.map((s, i) => {
            const blocked = blockedByCounts({ questions: s.questionCount }, 'section', 'Move or archive its questions first.');
            return (
              <li key={s.id} className="flex flex-col gap-2 border-t border-soft py-3 first:border-t-0 min-[600px]:flex-row min-[600px]:items-center">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{i + 1}. {s.name}</span>
                  <span className="text-[13px] text-muted">{s.questionTypeLabel} · {plural(s.questionCount, 'question')}</span>
                </span>
                {!hint && (
                  <span className="flex flex-wrap gap-1.5">
                    <Btn size="sm" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => void move(i, i - 1)}>↑</Btn>
                    <Btn size="sm" aria-label={`Move ${s.name} down`} disabled={i === order.length - 1} onClick={() => void move(i, i + 1)}>↓</Btn>
                    <Btn size="sm" aria-label={`Rename ${s.name}`} onClick={() => { setTried(false); setEdit({ id: s.id, name: s.name, label: s.questionTypeLabel }); }}>Edit</Btn>
                    <Btn size="sm" kind="danger" aria-label={`Delete ${s.name}`} whyDisabled={blocked} onClick={() => { errors.current = {}; setDel(s); }}>Delete</Btn>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <ActionDialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit section' : 'Add a section'}
        confirmLabel={edit?.id ? 'Save section' : 'Add section'}
        reason={false}
        note={null}
        fieldsOk={!!edit && !checkName(edit.name) && !checkName(edit.label, 2, 80)}
        fieldsError="Fill in both fields."
        fields={edit && (
          <>
            <TextField label="Section name" value={edit.name} error={nameProblem} onChange={(e) => { setTried(true); setEdit({ ...edit, name: e.target.value }); }} />
            <TextField label="Question type label" value={edit.label} error={labelProblem} hint="For example Multiple choice or Case study." onChange={(e) => { setTried(true); setEdit({ ...edit, label: e.target.value }); }} />
          </>
        )}
        errors={{ section_exists: 'A section with that name already exists in this test.' }}
        submit={async () => {
          if (!edit) return;
          if (edit.id) await patchSection(edit.id, { name: edit.name.trim(), questionTypeLabel: edit.label.trim() });
          else await createSection(testId, { name: edit.name.trim(), questionTypeLabel: edit.label.trim() });
        }}
        onDone={() => {
          toast({ text: edit?.id ? 'Section saved.' : 'Section added.' });
          void refresh();
        }}
      />

      <ActionDialog
        open={!!del}
        onClose={() => setDel(null)}
        title={`Delete the section “${del?.name ?? ''}”?`}
        confirmLabel="Delete section"
        kind="danger"
        reason={false}
        errors={errors.current}
        note="Deleting is recorded in the audit log. A section that still has questions cannot be deleted."
        submit={() => guarded(errors.current, 'section_in_use', 'section', 'Move or archive its questions first.', () => deleteSection(del!.id))}
        onDone={() => {
          toast({ text: 'Section deleted.' });
          void refresh();
        }}
      >
        <p className="m-0">The section is removed from this test. It has no questions.</p>
      </ActionDialog>
    </section>
  );
}
