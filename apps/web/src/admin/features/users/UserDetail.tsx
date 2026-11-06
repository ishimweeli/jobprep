import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { getUser, keys } from '../../api/admin';
import type { UserDetail as UserDetailData } from '../../api/types';
import { ErrorBox, Loader } from '../../components/states';
import { Avatar, Btn, LinkButton, Pill } from '../../components/ui';
import { ACCESS_TONE, accessSummary, historySentence, paymentTone } from '../../lib/badges';
import { formatDateTime, formatDay, formatLastActive, formatDayYear, initials, languageName } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { useAdmin } from '../auth/session';
import { GrantAccessDialog, PasswordResetDialog, SuspendDialog, UnsuspendDialog } from './UserActions';

/**
 * One user (AdminUsers.dc side panel, AdminUserPhone.dc page). The four action buttons open their dialogs (A2 grant /
 * extend access, A3 suspend and un-suspend, A5 password reset) or the read-only candidate view (A5). A role that may not
 * use one sees it disabled with the reason under it (A17).
 */

const NOTE = 'Access changes ask for a reason and are recorded in the audit log.';
const VIEW_HINT = 'Opens a read-only view of what this person sees. Nothing can be changed from it, and the view is recorded in the audit log.';

type Dialog = null | 'grant' | 'suspend' | 'unsuspend' | 'reset';

function Actions({ d, phone }: { d: UserDetailData; phone: boolean }) {
  const { permissions } = useAdmin();
  const [dialog, setDialog] = useState<Dialog>(null);
  const suspended = d.user.status === 'SUSPENDED';
  const manage = denyHint(permissions, 'users:manage', 'change access or suspend accounts');
  const reset = denyHint(permissions, 'otp:resend', 'send password resets') ?? (suspended ? 'A suspended account cannot get an email. Un-suspend it first.' : undefined);
  const size = phone ? 'lg' : 'md';
  const close = () => setDialog(null);
  const who = d.user;

  const grant = <Btn kind="primary" size={size} className="w-full" whyDisabled={manage} onClick={() => setDialog('grant')}>Grant / extend 30 days</Btn>;
  const resetBtn = <Btn size={size} className="w-full" whyDisabled={reset} onClick={() => setDialog('reset')}>Send password reset</Btn>;
  const view = <LinkButton to={`/admin/users/${who.id}/view`} size={size} className="w-full" aria-describedby={`view-hint-${who.id}`}>View as candidate</LinkButton>;
  const suspend = suspended
    ? <Btn size={size} className="w-full" whyDisabled={manage} onClick={() => setDialog('unsuspend')}>Un-suspend account</Btn>
    : <Btn kind="danger" size={size} className="w-full" whyDisabled={manage} onClick={() => setDialog('suspend')}>Suspend account</Btn>;

  return (
    <>
      {phone ? (
        <div className="flex flex-col gap-2">
          {grant}
          <div className="grid grid-cols-2 gap-2">{resetBtn}{view}</div>
          {suspend}
        </div>
      ) : (
        <div className="grid grid-cols-2 items-start gap-2">{grant}{resetBtn}{view}{suspend}</div>
      )}
      <p id={`view-hint-${who.id}`} className="m-0 text-xs text-muted">{VIEW_HINT}</p>
      <p className="m-0 text-xs text-muted">{NOTE}</p>
      <GrantAccessDialog open={dialog === 'grant'} onClose={close} user={who} />
      <SuspendDialog open={dialog === 'suspend'} onClose={close} user={who} />
      <UnsuspendDialog open={dialog === 'unsuspend'} onClose={close} user={who} />
      <PasswordResetDialog open={dialog === 'reset'} onClose={close} user={who} />
    </>
  );
}

/** The suspended state (A3): a banner with the reason and the date, in the incorrect tone, with words not only colour. */
function SuspendedBanner({ d }: { d: UserDetailData }) {
  if (d.user.status !== 'SUSPENDED') return null;
  const when = d.adminHistory.find((h) => h.action === 'user.suspend')?.at;
  return (
    <div role="status" className="flex flex-col gap-0.5 rounded-[10px] border border-incorrect-line bg-incorrect-bg px-3.5 py-3">
      <span className="text-sm font-semibold text-incorrect">This account is suspended{when ? ` since ${formatDay(when)}` : ''}</span>
      <span className="text-sm text-incorrect">
        {d.user.suspendedReason ? `Reason: ${d.user.suspendedReason}. ` : ''}The person is signed out and cannot sign in until it is un-suspended.
      </span>
    </div>
  );
}

function Rows({ children, empty }: { children: ReactNode[]; empty?: string }) {
  if (children.length === 0 && empty) return <p className="m-0 text-sm text-muted">{empty}</p>;
  return <>{children}</>;
}

export function UserDetailView({ id, phone }: { id: string; phone: boolean }) {
  const q = useQuery({ queryKey: keys.user(id), queryFn: () => getUser(id) });
  if (q.isPending) return <Loader label="Loading this user…" />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  return <UserBody d={q.data} phone={phone} />;
}

function UserBody({ d, phone }: { d: UserDetailData; phone: boolean }) {
  const tone = ACCESS_TONE[d.access.state];
  const sum = accessSummary(d);
  const ini = initials(d.user.name);
  const now = new Date();
  const attemptWhen = (a: UserDetailData['attempts'][number]) => `${formatDay(a.submittedAt)}${a.attemptNumber && a.attemptNumber > 1 ? ` · attempt ${a.attemptNumber}` : ''}`;
  const score = (a: UserDetailData['attempts'][number]) => (a.percent === null ? '—' : `${Math.round(a.percent)}%`);
  // The API lists the latest 10 finished attempts; a full page means "10 or more".
  const taken = d.attempts.length >= 10 ? '10+' : String(d.attempts.length);

  if (phone) {
    const card = 'flex flex-col gap-1 rounded-[14px] border border-border bg-white p-4';
    const row = 'flex justify-between gap-2.5 border-t border-soft py-[9px] text-sm';
    return (
      <>
        <div className="flex items-center gap-3">
          <Avatar text={ini} size={56} />
          <div className="flex flex-col">
            <h2 className="m-0 text-[17px]">{d.user.name}</h2>
            <span className="break-all text-sm text-muted">{d.user.email} · joined {formatDayYear(d.user.joinedAt)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 rounded-[14px] p-4" style={{ background: tone.bg }}>
          <span className="text-xs font-semibold" style={{ color: tone.ink }}>ACCESS</span>
          <span className="text-lg font-semibold">{d.access.state === 'active' ? 'Full Access · active' : sum.line}</span>
          {sum.meta && <span className="text-sm text-ink-2">{sum.meta}</span>}
        </div>
        <SuspendedBanner d={d} />
        <Actions d={d} phone />
        <section aria-labelledby="ud-i" className={card}>
          <h3 id="ud-i" className="m-0 mb-1.5 text-base">Profile</h3>
          {[
            ['Exam goal', d.user.goal ?? '—'],
            ['Language', languageName(d.user.language)],
            ['Mock tests taken', taken],
            ['Last active', formatLastActive(d.user.lastSeenAt, now)],
          ].map(([k, v]) => (
            <div key={k} className={row}><span className="text-muted">{k}</span><span className="text-right font-semibold">{v}</span></div>
          ))}
        </section>
        <section aria-labelledby="ud-a" className={card}>
          <h3 id="ud-a" className="m-0 mb-1.5 text-base">Attempts</h3>
          <Rows empty="No attempts yet.">
            {d.attempts.map((a) => (
              <div key={a.id} className={row}>
                <span className="flex flex-col"><span className="font-semibold">{a.title}</span><span className="text-xs text-muted">{attemptWhen(a)}</span></span>
                <strong>{score(a)}</strong>
              </div>
            ))}
          </Rows>
        </section>
        <section aria-labelledby="ud-p" className={card}>
          <h3 id="ud-p" className="m-0 mb-1.5 text-base">Payments</h3>
          <Rows empty="No payments yet.">
            {d.payments.map((p) => {
              const t = paymentTone(p.status);
              return (
                <div key={p.id} className={row}>
                  <span className="flex flex-col"><span className="font-semibold">{p.priceLabel} · {p.providerLabel}</span><span className="text-xs text-muted">{formatDay(p.createdAt)}{p.reference ? ` · ${p.reference}` : ''}</span></span>
                  <Pill tone={t} className="self-center px-[9px] py-[3px]">{t.label}</Pill>
                </div>
              );
            })}
          </Rows>
        </section>
        <section aria-labelledby="ud-l" className={card}>
          <h3 id="ud-l" className="m-0 mb-1.5 text-base">Admin history</h3>
          <Rows empty="Nothing yet.">
            {d.adminHistory.map((h) => (
              <p key={h.id} className="m-0 border-t border-soft py-[9px] text-sm">{historySentence(h)} · {formatDateTime(h.at)}</p>
            ))}
          </Rows>
        </section>
      </>
    );
  }

  const sec = 'flex flex-col gap-1';
  const row = 'flex justify-between gap-2 border-t border-soft py-2 text-sm';
  return (
    <aside aria-labelledby="ud-name" className="sticky top-6 flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-[16px] border border-border bg-white p-5">
      <div className="flex items-center gap-3">
        <Avatar text={ini} size={48} />
        <div className="flex flex-col">
          <h2 id="ud-name" className="m-0 text-[17px]">{d.user.name}</h2>
          <span className="break-all text-[13px] text-muted">{d.user.email} · joined {formatDayYear(d.user.joinedAt)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 rounded-[10px] p-3.5" style={{ background: tone.bg }}>
        <span className="text-xs font-semibold" style={{ color: tone.ink }}>ACCESS</span>
        <span className="text-base font-semibold">{sum.line}</span>
        {sum.meta && <span className="text-[13px] text-ink-2">{sum.meta}</span>}
      </div>
      <SuspendedBanner d={d} />
      <Actions d={d} phone={false} />
      <section aria-labelledby="ud-att" className={sec}>
        <h3 id="ud-att" className="m-0 mb-1 text-[15px]">Recent attempts</h3>
        <Rows empty="No attempts yet.">
          {d.attempts.map((a) => (
            <div key={a.id} className={row}>
              <span className="flex flex-col"><span className="font-semibold">{a.title}</span><span className="text-xs text-muted">{attemptWhen(a)}</span></span>
              <strong className="tabular">{score(a)}</strong>
            </div>
          ))}
        </Rows>
      </section>
      <section aria-labelledby="ud-pay" className={sec}>
        <h3 id="ud-pay" className="m-0 mb-1 text-[15px]">Payments</h3>
        <Rows empty="No payments yet.">
          {d.payments.map((p) => {
            const t = paymentTone(p.status);
            return (
              <div key={p.id} className={row}>
                <span>{p.priceLabel} · {p.providerLabel} · {formatDay(p.createdAt)}{p.reference ? ` · ${p.reference}` : ''}</span>
                <Pill tone={t} className="px-2 py-0.5 self-start">{t.label}</Pill>
              </div>
            );
          })}
        </Rows>
      </section>
      <section aria-labelledby="ud-his" className={sec}>
        <h3 id="ud-his" className="m-0 mb-1 text-[15px]">Admin history</h3>
        <Rows empty="Nothing yet.">
          {d.adminHistory.map((h) => (
            <p key={h.id} className="m-0 border-t border-soft py-2 text-sm">{historySentence(h)} · {formatDateTime(h.at)}</p>
          ))}
        </Rows>
      </section>
    </aside>
  );
}

