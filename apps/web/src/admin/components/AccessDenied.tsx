import { useAdmin } from '../features/auth/session';
import { firstAllowedItem, rolesLabel } from '../lib/permissions';
import { AdminShell } from './AdminShell';
import { LinkButton } from './ui';

/**
 * A page this role may not use, reached by its address (A17). It says so, names the role and the way out instead of
 * silently moving the person elsewhere. Inside the admin chrome (the role keeps its own navigation). Not designed:
 * built in the style of the no-access system page.
 */
export function AccessDenied() {
  const admin = useAdmin();
  const home = firstAllowedItem(admin.permissions);
  return (
    <AdminShell title="No access">
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-start gap-3 rounded-[16px] border border-border bg-white p-6">
        <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-flagged-bg text-flagged">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
        <h1 className="m-0 text-[22px] tracking-[-0.01em]">You do not have access to this</h1>
        <p className="m-0 text-[15px] text-ink-2">
          Your role ({rolesLabel(admin.roles) || 'none'}) does not include this page. If you need it, ask a System admin to change your role.
        </p>
        {home && (
          <LinkButton to={home.to} kind="primary">Go to {home.label}</LinkButton>
        )}
      </div>
    </AdminShell>
  );
}
