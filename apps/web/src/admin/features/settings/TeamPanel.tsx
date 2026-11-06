import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getTeam, keys } from '../../api/admin';
import type { TeamMember, TeamMemberRole } from '../../api/types';
import { EmptyState, ErrorBox, Loader } from '../../components/states';
import { Btn, Pill } from '../../components/ui';
import { cx } from '../../lib/cx';
import { formatLastActive } from '../../lib/format';
import { useAdmin } from '../auth/session';
import { EditRoleDialog, InviteDialog, RoleActiveDialog } from './TeamDialogs';
import { assignments, scopeLabel } from './teamModel';

type Pick = { member: TeamMember; a: TeamMemberRole } | null;

/** "Last active Today, 21:14" or "Never signed in"; nothing when the API does not send it. */
const lastActive = (m: TeamMember): string | null => (m.lastActiveAt === undefined ? null : m.lastActiveAt ? `Last active ${formatLastActive(m.lastActiveAt, new Date())}` : 'Never signed in');

function Person({ m, phone, me, onEdit, onToggle }: { m: TeamMember; phone: boolean; me: string; onEdit: (a: TeamMemberRole) => void; onToggle: (a: TeamMemberRole) => void }) {
  const list = assignments(m);
  const seen = lastActive(m);
  return (
    <div className={cx('flex flex-col gap-2 border-t border-soft py-3', phone && 'first:border-t-0')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{m.name}{m.id === me && <span className="font-normal text-muted"> (you)</span>}</span>
        {seen && <span className="text-xs text-muted">{seen}</span>}
      </div>
      <span className="break-all text-[13px] text-muted">{m.email}</span>
      {list.map((a) => (
        <div key={a.code} className="flex flex-wrap items-center gap-2">
          <span className="flex min-w-0 flex-1 flex-col text-sm">
            <span className="font-semibold">{a.label}</span>
            <span className="text-[13px] text-ink-2">{scopeLabel(a.countryScope)}</span>
          </span>
          {!a.active && <Pill tone={{ bg: '#EEF1F5', ink: '#3A3F4A' }}>Removed</Pill>}
          {a.active && <Btn size="sm" onClick={() => onEdit(a)} aria-label={`Change ${a.label} role of ${m.name}`}>Change</Btn>}
          <Btn size="sm" kind={a.active ? 'danger' : 'secondary'} onClick={() => onToggle(a)} aria-label={`${a.active ? 'Deactivate' : 'Restore'} ${a.label} role of ${m.name}`}>
            {a.active ? 'Deactivate' : 'Restore'}
          </Btn>
        </div>
      ))}
    </div>
  );
}

/** The "Admin team" card of Settings (A13): the people with roles, invite, change a role or its countries, deactivate. */
export function TeamPanel({ phone }: { phone: boolean }) {
  const admin = useAdmin();
  const team = useQuery({ queryKey: keys.team, queryFn: getTeam });
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState<Pick>(null);
  const [toggle, setToggle] = useState<Pick>(null);
  const id = phone ? 'sp-team' : 'st-team';
  return (
    <section aria-labelledby={id} className={cx('flex flex-col border border-border bg-white', phone ? 'gap-3 rounded-[14px] p-4' : 'gap-3.5 rounded-[16px] p-[22px]')}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="m-0 text-[17px]">Admin team</h2>
        {!phone && <Btn kind="outline-brand" size="sm" onClick={() => setInvite(true)}>Invite</Btn>}
      </div>
      {team.isPending ? (
        <Loader label="Loading the team…" />
      ) : team.isError ? (
        <ErrorBox error={team.error} onRetry={() => void team.refetch()} />
      ) : team.data.length === 0 ? (
        <EmptyState title="No one has an admin role yet." />
      ) : (
        <div className="flex flex-col">
          {team.data.map((m) => <Person key={m.id} m={m} phone={phone} me={admin.id} onEdit={(a) => setEdit({ member: m, a })} onToggle={(a) => setToggle({ member: m, a })} />)}
        </div>
      )}
      {phone && <Btn kind="outline-brand" onClick={() => setInvite(true)}>Invite admin</Btn>}
      <p className="m-0 text-[13px] text-muted">System admin: everything. Content editor: exams and questions only. Support: view users, send password resets, check payments. A role can be limited to some countries.</p>
      <InviteDialog open={invite} onClose={() => setInvite(false)} />
      <EditRoleDialog member={edit?.member ?? null} assignment={edit?.a ?? null} onClose={() => setEdit(null)} />
      <RoleActiveDialog member={toggle?.member ?? null} assignment={toggle?.a ?? null} onClose={() => setToggle(null)} />
    </section>
  );
}
