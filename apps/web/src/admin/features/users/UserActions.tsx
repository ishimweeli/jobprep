import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { grantAccess, sendPasswordReset, suspendUser, unsuspendUser } from '../../api/admin';
import type { UserDetail } from '../../api/types';
import { getAccessPreview, upKeys } from '../../api/users-payments';
import { ActionDialog } from '../../components/ActionDialog';
import { SelectField, TextField } from '../../components/forms';
import { useToast } from '../../components/Toast';
import { allowedCountryCodes } from '../../lib/adminCountry';
import { countryName, formatDayYear, plural } from '../../lib/format';
import { useAdmin } from '../auth/session';
import { DAYS_PROBLEM, DEFAULT_DAYS, parseDays, summaryLine, USER_ERRORS } from './usersModel';

/** The dialogs behind the user detail's buttons: grant / extend access (A2), suspend and un-suspend (A3), send a password reset (A5). */

type Who = Pick<UserDetail['user'], 'id' | 'name' | 'email' | 'countryCode'>;

function useRefreshUsers() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'user'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
  };
}

/** A2: country (the person's by default), days, a required reason, and "Access will run until ..." before anything happens. */
export function GrantAccessDialog({ open, onClose, user }: { open: boolean; onClose: () => void; user: Who }) {
  const admin = useAdmin();
  const toast = useToast();
  const refresh = useRefreshUsers();
  const countries = allowedCountryCodes(admin.countryScope);
  const options = countries.includes(user.countryCode) ? countries : [user.countryCode, ...countries];
  const [country, setCountry] = useState(user.countryCode);
  const [daysText, setDaysText] = useState(String(DEFAULT_DAYS));
  const [debounced, setDebounced] = useState(DEFAULT_DAYS);
  const endsAt = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setCountry(user.countryCode);
      setDaysText(String(DEFAULT_DAYS));
      setDebounced(DEFAULT_DAYS);
    }
  }, [open, user.countryCode]);
  const days = parseDays(daysText);
  useEffect(() => {
    if (days === null) return;
    const t = setTimeout(() => setDebounced(days), 300);
    return () => clearTimeout(t);
  }, [days]);

  const preview = useQuery({
    queryKey: upKeys.accessPreview(user.id, debounced, country),
    queryFn: () => getAccessPreview(user.id, debounced, country),
    enabled: open && days !== null,
    retry: false,
    staleTime: 30_000,
  });

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={`Grant or extend Full Access for ${user.name}`}
      confirmLabel="Grant access"
      reasonHint="For example: payment problem on 1 Nov, confirmed by support."
      fieldsOk={days !== null}
      errors={USER_ERRORS}
      submit={async (reason) => {
        const r = await grantAccess(user.id, { days: days!, countryCode: country, reason });
        endsAt.current = r.endsAt;
        return r;
      }}
      onDone={() => {
        refresh();
        toast({ text: `Full Access for ${user.name} now runs until ${formatDayYear(endsAt.current)}.` });
      }}
      fields={
        <>
          <SelectField label="Country" value={country} onChange={(e) => setCountry(e.target.value)} hint="Access is per country. It is added after any access they still have there.">
            {options.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </SelectField>
          <TextField
            label="Days"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={daysText}
            onChange={(e) => setDaysText(e.target.value)}
            error={days === null ? DAYS_PROBLEM : null}
          />
          <p role="status" className="m-0 rounded-[10px] bg-brand-soft px-3.5 py-3 text-[15px] font-semibold text-brand">
            {summaryLine(days, preview.data)}
          </p>
        </>
      }
    />
  );
}

/** A3: suspend. The consequence is said before the confirm, in the destructive style. */
export function SuspendDialog({ open, onClose, user }: { open: boolean; onClose: () => void; user: Who }) {
  const toast = useToast();
  const refresh = useRefreshUsers();
  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={`Suspend ${user.name}?`}
      kind="danger"
      confirmLabel="Suspend account"
      reasonHint="The reason is kept in their admin history."
      errors={USER_ERRORS}
      submit={(reason) => suspendUser(user.id, reason)}
      onDone={() => {
        refresh();
        toast({ text: `${user.name} is suspended.` });
      }}
    >
      <p className="m-0 font-semibold text-incorrect">They will be signed out everywhere and cannot sign in.</p>
      <p className="m-0">Their access and history are kept. You can un-suspend the account at any time.</p>
    </ActionDialog>
  );
}

export function UnsuspendDialog({ open, onClose, user }: { open: boolean; onClose: () => void; user: Who }) {
  const toast = useToast();
  const refresh = useRefreshUsers();
  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={`Un-suspend ${user.name}?`}
      confirmLabel="Un-suspend account"
      errors={USER_ERRORS}
      submit={(reason) => unsuspendUser(user.id, reason)}
      onDone={() => {
        refresh();
        toast({ text: `${user.name} can sign in again.` });
      }}
    >
      <p className="m-0">They will be able to sign in again with their existing password. Their access and history are as they were.</p>
    </ActionDialog>
  );
}

/** A5: the password-reset confirmation (there is no login code any more) and its result as a toast. No reason is asked. */
export function PasswordResetDialog({ open, onClose, user }: { open: boolean; onClose: () => void; user: Who }) {
  const toast = useToast();
  const refresh = useRefreshUsers();
  const out = useRef<{ cooldownSeconds: number; expiresInSeconds: number } | null>(null);
  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title="Send a password reset email?"
      confirmLabel="Send email"
      reason={false}
      errors={USER_ERRORS}
      note="Recorded in the audit log. You never see the link."
      submit={async () => {
        out.current = await sendPasswordReset(user.id);
        return out.current;
      }}
      onDone={() => {
        refresh();
        const minutes = out.current ? Math.round(out.current.expiresInSeconds / 60) : null;
        toast({
          text: `Reset email sent to ${user.email}.${minutes ? ` The link works for ${plural(minutes, 'minute')}.` : ''}${out.current ? ` Another can be sent in ${out.current.cooldownSeconds} s.` : ''}`,
        });
      }}
    >
      <p className="m-0"><strong>{user.name}</strong> gets an email at <strong className="break-all">{user.email}</strong> with a link to choose a new password.</p>
      <p className="m-0">Earlier reset links stop working. Limits apply: one email at a time, and a few each hour.</p>
    </ActionDialog>
  );
}
