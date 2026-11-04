import type { TestStatus } from '../../api/types';
import { Btn, LinkButton, Pill } from '../../components/ui';
import { TEST_TONE } from '../../lib/badges';
import { useAdmin } from '../auth/session';
import { denyHint } from '../../lib/permissions';

/** The actions on the chosen mock test, above its questions: edit, case studies, import, and the publish shortcut (A9, A6, A8). */
export function testToolbarLinks(testId: string, status: TestStatus): { key: string; label: string; to: string; primary?: boolean }[] {
  const base = `/admin/exams/${testId}`;
  const publish = status === 'DRAFT' ? { key: 'publish', label: 'Review and publish', to: `${base}/edit#publish`, primary: true } : status === 'PUBLISHED' ? { key: 'publish', label: 'Unpublish', to: `${base}/edit#publish` } : { key: 'publish', label: 'Restore', to: `${base}/edit#publish` };
  return [{ key: 'edit', label: 'Edit test', to: `${base}/edit` }, { key: 'cases', label: 'Case studies', to: `${base}/cases` }, { key: 'import', label: 'Import', to: `${base}/import` }, publish];
}

export function TestToolbar({ testId, status, title }: { testId: string; status: TestStatus; title: string }) {
  const admin = useAdmin();
  const tone = TEST_TONE[status];
  const hint = denyHint(admin.permissions, 'exams:write', 'change this test');
  return (
    <nav aria-label={`Actions for ${title}`} className="flex w-full flex-wrap items-center gap-2 rounded-[14px] border border-border bg-white px-3.5 py-3">
      <span className="flex min-w-0 flex-[1_1_200px] items-center gap-2">
        <span className="truncate text-sm font-semibold" title={title}>{title}</span>
        <Pill tone={tone}>{tone.label}</Pill>
      </span>
      <span className="flex flex-wrap gap-2">
        {testToolbarLinks(testId, status).map((l) =>
          hint && l.key !== 'cases' && l.key !== 'edit' ? (
            <Btn key={l.key} size="sm" whyDisabled={hint}>{l.label}</Btn>
          ) : (
            <LinkButton key={l.key} to={l.to} size="sm" kind={l.primary ? 'primary' : 'secondary'}>{l.label}</LinkButton>
          ),
        )}
      </span>
    </nav>
  );
}

/** The page-level actions of Exams & questions: new test, import, categories and topics, reports, exam requests. */
export function ExamsHeaderActions({ testId }: { testId?: string; phone?: boolean }) {
  const admin = useAdmin();
  const hint = denyHint(admin.permissions, 'exams:write', 'create or import');
  const importTo = testId ? `/admin/exams/${testId}/import` : '/admin/exams/import';
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Exam actions">
      {hint ? <Btn whyDisabled={hint}>Import questions (CSV)</Btn> : <LinkButton to={importTo}>Import questions (CSV)</LinkButton>}
      <LinkButton to="/admin/exams/catalog">Categories and topics</LinkButton>
      <LinkButton to="/admin/exams/reports">Reported questions</LinkButton>
      <LinkButton to="/admin/exams/requests">Exam requests</LinkButton>
      {hint ? <Btn kind="primary" whyDisabled={hint}>+ New mock test</Btn> : <LinkButton to="/admin/exams/new" kind="primary">+ New mock test</LinkButton>}
    </div>
  );
}
