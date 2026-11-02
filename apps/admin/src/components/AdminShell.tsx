import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { getPayments, keys } from '../api/admin';
import { useAdmin } from '../features/auth/session';
import { cx } from '../lib/cx';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useIsDesktop } from '../lib/useMediaQuery';
import { ROLE_LABEL, visibleNav, type NavItem } from '../lib/permissions';
import { Logo } from './ui';

/** The pending-payments number on the Payments item (the artboard's amber count). Only for admins who may read payments. */
function usePendingCount(enabled: boolean): number {
  const q = useQuery({
    queryKey: [...keys.payments({ nav: true })],
    queryFn: () => getPayments({ pageSize: 1 }),
    enabled,
    staleTime: 30_000,
  });
  return q.data?.summary.pendingNow ?? 0;
}

function Icon({ path, size }: { path: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const AdminMark = ({ dark }: { dark?: boolean }) => (
  <span className={cx('rounded-md px-[7px] py-[3px] text-[11px] font-bold', dark ? 'bg-ink text-white' : 'bg-[#3F3F46] text-[#E4E4E7]')}>ADMIN</span>
);

function Sidebar({ items, pending }: { items: NavItem[]; pending: number }) {
  const admin = useAdmin();
  return (
    <aside aria-label="Admin navigation" className="sticky top-0 flex h-screen w-60 flex-none flex-col gap-5 overflow-y-auto bg-ink px-3.5 py-5 text-white">
      <div className="flex items-center gap-2.5 px-2">
        <Logo size={30} />
        <span className="text-lg font-extrabold">JobPrep</span>
        <AdminMark />
      </div>
      <nav aria-label="Admin" className="flex flex-col gap-1">
        {items.map((n) => (
          <NavLink
            key={n.key}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              cx('flex items-center gap-3 rounded-[10px] px-3 py-[11px] text-[15px] font-semibold no-underline hover:text-white', isActive ? 'bg-[#3F3F46] text-white' : 'bg-transparent text-[#D4D4D8]')
            }
          >
            <Icon path={n.icon} size={20} />
            <span className="flex-1">{n.label}</span>
            {n.key === 'payments' && pending > 0 && (
              <span className="rounded-full bg-[#F59E0B] px-[7px] py-0.5 text-xs font-bold text-ink">
                {pending}
                <span className="sr-only"> pending</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-[#3F3F46] p-3">
        <span className="text-sm font-semibold">{admin.name}</span>
        <span className="text-[13px] text-[#A1A1AA]">{ROLE_LABEL[admin.role]}</span>
      </div>
    </aside>
  );
}

function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Admin" className="sticky bottom-0 z-10 grid border-t border-border bg-white px-0.5 pb-2 pt-1" style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}>
      {items.map((n) => (
        <NavLink
          key={n.key}
          to={n.to}
          end={n.to === '/'}
          className={({ isActive }) =>
            cx('flex min-h-[52px] flex-col items-center gap-0.5 py-1.5 text-[11px] no-underline', isActive ? 'font-bold text-brand' : 'font-semibold text-muted hover:text-muted')
          }
        >
          <Icon path={n.phoneIcon} size={22} />
          {n.phoneLabel}
        </NavLink>
      ))}
    </nav>
  );
}

interface ShellProps {
  /** The page heading: the h1 of the phone header; desktop pages draw their own h1 in the content. */
  title: string;
  /** Phone only: a back arrow instead of the logo. */
  back?: string;
  /** Phone only: more header content under the title row (search, chips). */
  headerExtra?: ReactNode;
  /** Vertical gap between the desktop sections (22 on the Overview, 18 elsewhere). */
  gap?: 18 | 22;
  children: ReactNode;
}

/**
 * The chrome of every screen: the dark sidebar with the admin's name on desktop, the white header and the
 * bottom bar on a phone. The same pages render inside both.
 */
export function AdminShell({ title, back, headerExtra, gap = 18, children }: ShellProps) {
  const admin = useAdmin();
  const isDesktop = useIsDesktop();
  useDocumentTitle(`${title} · Admin`);
  const canPayments = admin.permissions.includes('payments:read');
  const pending = usePendingCount(canPayments && isDesktop);
  const items = visibleNav(admin.permissions, isDesktop ? 'desktop' : 'phone');

  const skip = (
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:font-semibold">
      Skip to main content
    </a>
  );

  if (isDesktop) {
    return (
      <div className="flex min-h-screen bg-page text-ink">
        {skip}
        <Sidebar items={items} pending={pending} />
        <main id="main-content" tabIndex={-1} className={cx('flex min-w-0 flex-1 flex-col px-8 pb-12 pt-7 outline-none', gap === 22 ? 'gap-[22px]' : 'gap-[18px]')}>
          {children}
        </main>
      </div>
    );
  }
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page text-ink">
      {skip}
      <header className="sticky top-0 z-10 flex flex-col gap-2.5 border-b border-border bg-white px-4 pb-2.5 pt-2">
        <div className="flex min-h-[44px] items-center gap-2.5">
          {back ? (
            <Link to={back} aria-label="Back" className="-ml-3 inline-flex h-11 w-11 items-center justify-center text-[20px] text-ink no-underline hover:text-ink">
              ←
            </Link>
          ) : (
            <Logo size={26} />
          )}
          <h1 className="m-0 flex-1 text-[19px]">{title}</h1>
          <AdminMark dark />
        </div>
        {headerExtra}
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col gap-3.5 px-4 pb-5 pt-3.5 outline-none">
        {children}
      </main>
      <BottomNav items={items} />
    </div>
  );
}
