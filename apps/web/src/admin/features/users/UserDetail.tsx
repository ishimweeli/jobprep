import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getUser, keys } from '../../api/admin';
import type { UserDetail as UserDetailData } from '../../api/types';
import { ErrorBox, Skeleton } from '../../components/states';
import { Avatar, InertButton, Pill } from '../../components/ui';
import { ACCESS_TONE, accessSummary, historySentence, paymentTone } from '../../lib/badges';
import { formatDateTime, formatDay, formatLastActive, formatDayYear, initials, languageName } from '../../lib/format';

/**
 * One user (AdminUsers.dc side panel, AdminUserPhone.dc page). The four action buttons are drawn as in the
 * artboards and do nothing yet: their dialogs and results are not designed (A2, A3, A5).
 */

const NOTE = 'Access changes ask for a reason and are recorded in the audit log.';

function Actions({ phone }: { phone: boolean }) {
  if (phone) {
    return (
      <div className="flex flex-col gap-2">
        <InertButton kind="primary" sizeClass="min-h-12 rounded-[10px] text-base font-semibold">Grant / extend 30 days</InertButton>
        <div className="grid grid-cols-2 gap-2">
          <InertButton kind="secondary" sizeClass="min-h-12 rounded-[10px] text-[15px] font-semibold">Send password reset</InertButton>
          <InertButton kind="secondary" sizeClass="min-h-12 rounded-[10px] text-[15px] font-semibold">View as candidate</InertButton>
        </div>
        <InertButton kind="danger" sizeClass="min-h-12 rounded-[10px] text-[15px] font-semibold">Suspend account</InertButton>
        <p className="m-0 text-xs text-muted">{NOTE}</p>
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <InertButton kind="primary" sizeClass="min-h-11 rounded-[10px] text-sm font-semibold">Grant / extend 30 days</InertButton>
        <InertButton kind="secondary" sizeClass="min-h-11 rounded-[10px] text-sm font-semibold">Send password reset</InertButton>
        <InertButton kind="secondary" sizeClass="min-h-11 rounded-[10px] text-sm font-semibold">View as candidate</InertButton>
        <InertButton kind="danger" sizeClass="min-h-11 rounded-[10px] text-sm font-semibold">Suspend account</InertButton>
      </div>
      <p className="m-0 text-xs text-muted">{NOTE}</p>
    </>
  );
}

function Rows({ children, empty }: { children: ReactNode[]; empty?: string }) {
  if (children.length === 0 && empty) return <p className="m-0 text-sm text-muted">{empty}</p>;
  return <>{children}</>;
}

export function UserDetailView({ id, phone }: { id: string; phone: boolean }) {
  const q = useQuery({ queryKey: keys.user(id), queryFn: () => getUser(id) });
  if (q.isPending) return <Skeleton label="Loading this user…" />;
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
        <Actions phone />
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
      <Actions phone={false} />
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

