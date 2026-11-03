import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { getAudit, keys } from '../../api/admin';
import { AdminShell } from '../../components/AdminShell';
import { ErrorBox, Skeleton } from '../../components/states';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { AuditList } from './SettingsPage';

/**
 * Phone: the "Audit log" link at the end of Settings (AdminSettingsPhone.dc) points to the desktop Settings page,
 * which has the list. The list is shown here as one card with the same rows. The full audit screen (filters,
 * entry detail, export) is not designed (A12).
 */
export function AuditPage() {
  const isDesktop = useIsDesktop();
  const q = useQuery({ queryKey: keys.audit(50), queryFn: () => getAudit(50), enabled: !isDesktop });
  if (isDesktop) return <Navigate to="/admin/settings" replace />;
  return (
    <AdminShell title="Audit log" back="/admin/settings">
      <section aria-labelledby="al-t" className="flex flex-col gap-3 rounded-[14px] border border-border bg-white p-4">
        <h2 id="al-t" className="m-0 text-[17px]">Audit log</h2>
        {q.isPending ? <Skeleton label="Loading the audit log…" /> : q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : <AuditList items={q.data.results} />}
      </section>
    </AdminShell>
  );
}
