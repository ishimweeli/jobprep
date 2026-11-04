import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { inviteAdmin, keys, patchTeamMember } from '../../api/admin';
import type { AdminRole, TeamMember, TeamMemberRole } from '../../api/types';
import { ActionDialog } from '../../components/ActionDialog';
import { CheckField, FieldGroup, TextField } from '../../components/forms';
import { useToast } from '../../components/Toast';
import { COUNTRY_NAMES } from '../../lib/format';
import { allowedCountryCodes } from '../../lib/adminCountry';
import { useAdmin } from '../auth/session';
import { canScope, editPatch, emptyInvite, inviteBody, removePatch, restorePatch, ROLE_CHOICES, scopeLabel, TEAM_ERRORS, validateInvite, type InviteForm } from './teamModel';

function RoleRadios({ value, onChange, name }: { value: AdminRole; onChange: (r: AdminRole) => void; name: string }) {
  return (
    <FieldGroup legend="Role">
      {ROLE_CHOICES.map((r) => (
        <label key={r.value} className="flex min-h-11 items-start gap-2.5 rounded-[10px] border border-border-strong p-2.5 text-[15px] has-[:checked]:border-brand has-[:checked]:bg-brand-softer">
          <input type="radio" name={name} value={r.value} checked={value === r.value} onChange={() => onChange(r.value)} className="mt-1 h-5 w-5 flex-none accent-brand" />
          <span className="flex flex-col"><span className="font-semibold">{r.label}</span><span className="text-[13px] text-muted">{r.help}</span></span>
        </label>
      ))}
    </FieldGroup>
  );
}

/** "All countries" (nothing ticked) or a list of countries. Only the admin's own countries are offered. */
function CountryChecks({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { countryScope } = useAdmin();
  const codes = allowedCountryCodes(countryScope);
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <FieldGroup legend="Countries" hint="Leave all unticked for every country.">
      <div className="flex flex-wrap gap-x-4">
        {codes.map((c) => <CheckField key={c} label={COUNTRY_NAMES[c] ?? c} checked={value.includes(c)} onChange={() => toggle(c)} />)}
      </div>
    </FieldGroup>
  );
}

export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<InviteForm>(emptyInvite);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (open) { setF(emptyInvite); setTried(false); }
  }, [open]);
  const problems = validateInvite(f);
  const ok = !problems.name && !problems.email;
  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title="Invite an admin"
      confirmLabel="Give access"
      reasonHint="Why this person needs this role."
      fieldsOk={ok}
      fieldsError="Fill in the name and a valid email address."
      errors={TEAM_ERRORS}
      fields={
        <>
          <TextField label="Name" value={f.name} error={tried ? (problems.name ?? null) : null} onChange={(e) => { setTried(true); setF({ ...f, name: e.target.value }); }} autoComplete="off" />
          <TextField label="Email address" type="email" value={f.email} error={tried ? (problems.email ?? null) : null} hint="Nothing is emailed. The person signs in with this address (a new account is made if there is none)." onChange={(e) => { setTried(true); setF({ ...f, email: e.target.value }); }} autoComplete="off" />
          <RoleRadios name="invite-role" value={f.role} onChange={(role) => setF({ ...f, role })} />
          {canScope(f.role) && <CountryChecks value={f.countries} onChange={(countries) => setF({ ...f, countries })} />}
        </>
      }
      submit={(reason) => inviteAdmin(inviteBody(f, reason))}
      onDone={() => {
        void qc.invalidateQueries({ queryKey: keys.team });
        void qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
        toast({ text: `${f.name.trim()} now has the ${ROLE_CHOICES.find((r) => r.value === f.role)?.label} role.` });
      }}
    >
      <p className="m-0">Roles decide what a person sees in the admin area. You can change or remove a role later.</p>
    </ActionDialog>
  );
}

/** Change a person's role or the countries it covers. One dialog per role assignment. */
export function EditRoleDialog({ member, assignment, onClose }: { member: TeamMember | null; assignment: TeamMemberRole | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState<AdminRole>('SUPPORT');
  const [countries, setCountries] = useState<string[]>([]);
  useEffect(() => {
    if (assignment) { setRole(assignment.code); setCountries(assignment.countryScope); }
  }, [assignment]);
  const open = !!member && !!assignment;
  const noChange = !!assignment && editPatch(assignment, { role, countries }, 'xxxxx') === null;
  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={member ? `Change role of ${member.name}` : 'Change role'}
      confirmLabel="Save change"
      fieldsOk={!noChange}
      fieldsError="Nothing has changed yet."
      errors={TEAM_ERRORS}
      fields={
        <>
          <RoleRadios name="edit-role" value={role} onChange={setRole} />
          {canScope(role) && <CountryChecks value={countries} onChange={setCountries} />}
        </>
      }
      submit={(reason) => {
        const patch = editPatch(assignment!, { role, countries }, reason);
        if (!patch) return Promise.reject(new Error('nothing_to_change'));
        return patchTeamMember(member!.id, patch);
      }}
      onDone={() => {
        void qc.invalidateQueries({ queryKey: keys.team });
        void qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
        toast({ text: `${member?.name} updated.` });
      }}
    >
      {member && assignment && <p className="m-0">Now: {assignment.label}, {scopeLabel(assignment.countryScope).toLowerCase()}. The change applies at once, on the person’s next request.</p>}
    </ActionDialog>
  );
}

/** Remove a role (the person keeps their account and any other role) or bring it back. */
export function RoleActiveDialog({ member, assignment, onClose }: { member: TeamMember | null; assignment: TeamMemberRole | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const restore = !!assignment && !assignment.active;
  return (
    <ActionDialog
      open={!!member && !!assignment}
      onClose={onClose}
      title={restore ? `Restore ${assignment?.label} for ${member?.name}` : `Deactivate ${assignment?.label} for ${member?.name}`}
      confirmLabel={restore ? 'Restore role' : 'Deactivate'}
      kind={restore ? 'primary' : 'danger'}
      errors={TEAM_ERRORS}
      submit={(reason) => patchTeamMember(member!.id, restore ? restorePatch(assignment!, reason) : removePatch(assignment!, reason))}
      onDone={() => {
        void qc.invalidateQueries({ queryKey: keys.team });
        void qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
        toast({ text: restore ? `${member?.name} has the role again.` : `${member?.name} no longer has the ${assignment?.label} role.` });
      }}
    >
      {restore ? (
        <p className="m-0">They can use the pages of this role again from their next request.</p>
      ) : (
        <p className="m-0">They lose the pages of this role at once. Their account, their history and any other role stay. You can restore the role later.</p>
      )}
    </ActionDialog>
  );
}
