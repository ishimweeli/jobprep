import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getAudit, getCountries, getCountry, getSettings, getTeam, keys, putSettings } from '../../api/admin';
import type { AdminSettings, AuditEntry, CountryDetail, SettingsPatch, TeamMember } from '../../api/types';
import { AdminShell } from '../../components/AdminShell';
import { ErrorBox, Skeleton } from '../../components/states';
import { InertButton, Pill } from '../../components/ui';
import { MODE_TONE, PROVIDER_SWATCH } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { amountFromLabel, formatDateTime } from '../../lib/format';
import { hasSeveralRoles, teamRoleLabel } from '../../lib/permissions';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { parseStuckMinutes, settingsPatch, STUCK_MAX, STUCK_MIN } from './settingsModel';

const checkbox = (phone: boolean) => cx('flex-none accent-brand', phone ? 'h-[22px] w-[22px]' : 'h-5 w-5');
const numberInput = (phone: boolean) => cx('rounded-[10px] border border-input-border bg-white px-3 font-normal text-ink', phone ? 'h-[46px] text-base' : 'h-11 text-[15px]');

function Card({ id, title, phone, aside, children }: { id: string; title: string; phone: boolean; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cx('flex flex-col bg-white border border-border', phone ? 'gap-3 rounded-[14px] p-4' : 'gap-3.5 rounded-[16px] p-[22px]')}>
      {aside ? (
        <div className="flex items-center justify-between">
          <h2 id={id} className="m-0 text-[17px]">{title}</h2>
          {aside}
        </div>
      ) : (
        <h2 id={id} className="m-0 text-[17px]">{title}</h2>
      )}
      {children}
    </section>
  );
}

/** The three switches and the stuck-minutes box save as soon as they change (the artboards draw no Save button for them). */
function useSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: keys.settings, queryFn: getSettings });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const m = useMutation({
    mutationFn: (patch: SettingsPatch) => putSettings(patch),
    onMutate: (next) => {
      setError(null);
      const prev = qc.getQueryData<AdminSettings>(keys.settings);
      if (prev) qc.setQueryData(keys.settings, { ...prev, ...next }); // the switch moves at once
      void qc.cancelQueries({ queryKey: keys.settings });
      return { prev };
    },
    onError: (_e, _n, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.settings, ctx.prev);
      setError('This setting could not be saved. It was put back as it was.');
    },
    onSuccess: () => setSaved('Saved'),
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.settings }),
  });
  return {
    q,
    // Only what changed is sent, worked out here (not inside the mutation, which runs after the switch has moved).
    save: (next: Partial<AdminSettings>) => {
      const patch = q.data ? settingsPatch(q.data, next) : {};
      if (Object.keys(patch).length > 0) m.mutate(patch);
    },
    error,
    saved,
    setError,
  };
}

function ProviderRows({ detail, phone }: { detail: CountryDetail; phone: boolean }) {
  return (
    <>
      {detail.paymentMethods.map((p) => {
        const tone = MODE_TONE[p.mode];
        return (
          <div key={p.provider} className={cx('flex items-center', phone ? 'gap-2.5' : 'gap-3 border-t border-soft py-3')}>
            <span aria-hidden="true" className={cx('flex-none', phone ? 'h-[26px] w-[26px] rounded-[7px]' : 'h-7 w-7 rounded-lg')} style={{ background: PROVIDER_SWATCH[p.provider] ?? '#CDD4DE' }} />
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">{p.label}</span>
              {!phone && <span className="text-[13px] text-muted">Collections API</span>}
            </span>
            <Pill tone={tone}>{tone.label}</Pill>
          </div>
        );
      })}
    </>
  );
}

/** The role slot of a person with several roles shows their labels, comma-separated (no design for it: E3). */
const MULTI_ROLE = 'MULTIPLE';

function Team({ team, phone }: { team: TeamMember[]; phone: boolean }) {
  return (
    <>
      {team.map((t) =>
        phone ? (
          <div key={t.id} className="flex items-center justify-between gap-2.5">
            <span className="text-[15px] font-semibold">{t.name}</span>
            <span className="text-[13px] text-ink-2">{teamRoleLabel(t)}</span>
          </div>
        ) : (
          <div key={t.id} className="flex items-center gap-3 border-t border-soft py-2.5">
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">{t.name}</span>
              <span className="break-all text-[13px] text-muted">{t.email}</span>
            </span>
            {/* Changing a role needs a reason and a confirmation, which have no design yet (A13): drawn, does nothing. */}
            <select
              aria-label={`Role for ${t.name}`}
              aria-disabled="true"
              value={hasSeveralRoles(t) ? MULTI_ROLE : t.role}
              onChange={() => undefined}
              onMouseDown={(e) => e.preventDefault()}
              className="h-10 cursor-default rounded-[10px] border border-input-border bg-white px-2.5 text-sm text-ink"
            >
              {hasSeveralRoles(t) && <option value={MULTI_ROLE}>{teamRoleLabel(t)}</option>}
              <option value="SYSTEM_ADMIN">System admin</option>
              <option value="CONTENT_EDITOR">Content editor</option>
              <option value="SUPPORT">Support</option>
            </select>
          </div>
        ),
      )}
    </>
  );
}

export function AuditList({ items }: { items: AuditEntry[] }) {
  return (
    <>
      {items.map((l) => (
        <div key={l.id} className="flex flex-col gap-0.5 border-t border-soft py-2.5">
          <span className="text-sm"><strong>{l.actor?.name ?? 'System'}</strong> {l.summary}</span>
          <span className="text-xs text-muted">{formatDateTime(l.at)}</span>
        </div>
      ))}
      {items.length === 0 && <p className="m-0 text-sm text-muted">Nothing has been recorded yet.</p>}
    </>
  );
}

export function SettingsPage() {
  const isDesktop = useIsDesktop();
  const phone = !isDesktop;
  const admin = useAdmin();
  const can = (p: (typeof admin.permissions)[number]) => admin.permissions.includes(p);
  const s = useSettings();
  const [stuck, setStuck] = useState('');
  useEffect(() => {
    if (s.q.data) setStuck(String(s.q.data.stuckAfterMinutes));
  }, [s.q.data?.stuckAfterMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const countries = useQuery({ queryKey: keys.countries, queryFn: getCountries, enabled: can('countries:read'), staleTime: 60_000 });
  const live = countries.data?.countries.find((c) => c.status === 'LIVE') ?? countries.data?.countries[0];
  const country = useQuery({ queryKey: keys.country(live?.code ?? ''), queryFn: () => getCountry(live!.code), enabled: !!live, staleTime: 60_000 });
  const team = useQuery({ queryKey: keys.team, queryFn: getTeam, enabled: can('admins:manage') });
  const audit = useQuery({ queryKey: keys.audit(5), queryFn: () => getAudit(5), enabled: can('audit:read') && isDesktop });

  const settings = s.q.data;
  const commitStuck = () => {
    if (!settings) return;
    const n = parseStuckMinutes(stuck);
    if (n === null) {
      s.setError(`Enter a whole number from ${STUCK_MIN} to ${STUCK_MAX}.`);
      setStuck(String(settings.stuckAfterMinutes));
      return;
    }
    if (n !== settings.stuckAfterMinutes) s.save({ stuckAfterMinutes: n });
  };

  const plan = country.data?.plan;
  const cur = country.data?.country.currencyCode ?? '';
  const planCard = country.data && (
    <Card id="st-plan" title={`Full Access plan · ${country.data.country.name}`} phone={phone}>
      <div className={cx('grid grid-cols-2', phone ? 'gap-2.5' : 'gap-3')}>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Price ({cur})
          <input type="number" readOnly value={amountFromLabel(plan?.priceLabel)} placeholder="Set price" className={numberInput(phone)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {phone ? 'Days' : 'Access length (days)'}
          <input type="number" readOnly value={plan?.durationDays ?? ''} className={numberInput(phone)} />
        </label>
      </div>
      <label className={cx('flex items-center gap-2.5 text-[15px]', phone && 'min-h-10')}>
        <input type="checkbox" checked readOnly onChange={() => undefined} aria-disabled="true" className={checkbox(phone)} />
        {phone ? 'Covers every mock test' : 'Covers every mock test in every category'}
      </label>
      <label className={cx('flex items-center gap-2.5 text-[15px]', phone && 'min-h-10')}>
        <input type="checkbox" checked={plan?.autoRenew ?? false} readOnly onChange={() => undefined} aria-disabled="true" className={checkbox(phone)} />
        {phone ? 'Auto-renew (off)' : 'Auto-renew (off — candidates pay once)'}
      </label>
      {!phone && (
        <p className="m-0 text-[13px] text-muted">
          Each country has its own price and currency — set them in <Link to="/admin/countries">Countries</Link>. A price change applies to new payments only. Active Full Access is never shortened.
        </p>
      )}
      <InertButton kind="primary" sizeClass={phone ? 'min-h-12 rounded-[10px] text-base font-semibold' : 'h-11 self-start rounded-[10px] px-4 text-[15px] font-semibold'}>
        Save plan
      </InertButton>
    </Card>
  );

  const stuckBox = (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      Mark a pending payment as stuck after (minutes)
      <input
        type="number"
        min={STUCK_MIN}
        max={STUCK_MAX}
        inputMode="numeric"
        value={stuck}
        onChange={(e) => setStuck(e.target.value)}
        onBlur={commitStuck}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
        className={cx(numberInput(phone), 'max-w-40')}
      />
    </label>
  );

  const providers = (
    <Card id={phone ? 'sp-pay' : 'st-pay'} title="Payment providers" phone={phone}>
      {country.data && <ProviderRows detail={country.data} phone={phone} />}
      {stuckBox}
    </Card>
  );

  const toggle = (label: string, checked: boolean, onChange?: (v: boolean) => void) => (
    <label className={cx('flex items-center gap-2.5 text-[15px]', phone && 'min-h-10')}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange ? (e) => onChange(e.target.checked) : () => undefined}
        aria-disabled={onChange ? undefined : 'true'}
        className={checkbox(phone)}
      />
      {label}
    </label>
  );
  const free = settings && (
    <Card id={phone ? 'sp-free' : 'st-free'} title="Free access" phone={phone}>
      {/* A product rule, shown on and not changeable (DECISIONS #82). */}
      {toggle(phone ? 'Free samples without an account' : 'Free sample tests open without an account', settings.freeSamplesOpenWithoutAccount)}
      {toggle(phone ? 'Explanations on free results' : 'Show explanations on free sample results', settings.showExplanationsOnFreeResults, (v) => s.save({ showExplanationsOnFreeResults: v }))}
      {toggle('Show pass marks (only where an official source is entered)', settings.showPassMarks, (v) => s.save({ showPassMarks: v }))}
    </Card>
  );

  const teamCard = can('admins:manage') && (
    <Card
      id={phone ? 'sp-team' : 'st-team'}
      title="Admin team"
      phone={phone}
      aside={phone ? undefined : <InertButton kind="outline-brand" sizeClass="h-10 rounded-[10px] px-3.5 text-sm font-semibold">Invite</InertButton>}
    >
      {team.isPending ? <Skeleton label="Loading the team…" /> : team.isError ? <ErrorBox error={team.error} onRetry={() => void team.refetch()} /> : <Team team={team.data} phone={phone} />}
      {phone && <InertButton kind="outline-brand" sizeClass="min-h-11 rounded-[10px] text-[15px] font-semibold">Invite admin</InertButton>}
      {!phone && (
        <p className="m-0 text-[13px] text-muted">System admin: everything. Content editor: exams and questions only. Support: view users, send password resets, check payments.</p>
      )}
    </Card>
  );

  const status = (
    <p role={s.error ? 'alert' : 'status'} className={cx('m-0 text-sm', s.error ? 'font-semibold text-incorrect' : 'sr-only')}>
      {s.error ?? s.saved}
    </p>
  );

  if (settings === undefined && s.q.isError) {
    return (
      <AdminShell title="Settings">
        <ErrorBox error={s.q.error} onRetry={() => void s.q.refetch()} />
      </AdminShell>
    );
  }
  if (!settings) {
    return (
      <AdminShell title="Settings">
        {!phone && <h1 className="m-0 text-[28px] tracking-[-0.02em]">Settings</h1>}
        <Skeleton label="Loading settings…" />
      </AdminShell>
    );
  }

  if (phone) {
    const c = countries.data?.counts;
    return (
      <AdminShell title="Settings">
        {status}
        {planCard}
        {providers}
        {free}
        {teamCard}
        {can('countries:read') && (
          <Link to="/admin/countries" className="flex items-center justify-between rounded-[14px] border border-border bg-white p-4 text-ink no-underline hover:text-ink">
            <span className="flex flex-col">
              <span className="text-base font-semibold">Countries</span>
              {c && <span className="text-[13px] text-muted">{c.live} live · {c.preparing} preparing · {c.planned} planned</span>}
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        )}
        {can('audit:read') && <Link to="/admin/settings/audit" className="p-3 text-center text-[15px] font-semibold">Audit log</Link>}
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Settings">
      <h1 className="m-0 text-[28px] tracking-[-0.02em]">Settings</h1>
      {status}
      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-[18px]">
          {planCard}
          {providers}
          {free}
        </div>
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-[18px]">
          {teamCard}
          {can('audit:read') && (
            <Card id="st-log" title="Audit log" phone={false}>
              {audit.isPending ? <Skeleton label="Loading the audit log…" /> : audit.isError ? <ErrorBox error={audit.error} onRetry={() => void audit.refetch()} /> : <AuditList items={audit.data.results} />}
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
