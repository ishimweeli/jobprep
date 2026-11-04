import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { getPayments, keys } from '../api/admin';
import { useAdmin } from '../features/auth/session';
import { useAdminSignOut } from '../features/auth/useAdminSignOut';
import { useAdminCountry } from '../lib/adminCountry';
import { cx } from '../lib/cx';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { initials } from '../lib/format';
import { useIsDesktop } from '../lib/useMediaQuery';
import { ADMIN_HOME, rolesLabel, visibleNav, type NavItem } from '../lib/permissions';
import { CountrySelector } from './CountrySelector';
import { Logo } from './ui';

/** The pending-payments number on the Payments item (the artboard's amber count). Only for admins who may read payments. */
function usePendingCount(enabled: boolean, country?: string): number {
  const q = useQuery({
    queryKey: [...keys.payments({ nav: true, country })],
    queryFn: () => getPayments({ pageSize: 1, country }),
    enabled,
    staleTime: 30_000,
  });
  return q.data?.summary.pendingNow ?? 0;
}

function Icon({ path, size, strokeWidth = 2 }: { path: string; size: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

/** The phone header's pill (AdminOverviewPhone.dc): dark, upper case. The desktop sidebar has its own softer "Admin" pill. */
const AdminMark = () => <span className="rounded-md bg-dark px-[7px] py-[3px] text-[11px] font-semibold text-white">ADMIN</span>;

const SIGN_OUT_ICON = 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9';

function Sidebar({ items, pending }: { items: NavItem[]; pending: number }) {
  const admin = useAdmin();
  const signOut = useAdminSignOut();
  return (
    <aside aria-label="Admin navigation" className="sticky top-0 flex h-screen w-[248px] flex-none flex-col gap-[18px] overflow-y-auto border-r border-border bg-white px-3.5 py-[18px]">
      <Link to={ADMIN_HOME} className="flex items-center gap-2.5 px-1 no-underline hover:no-underline">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-brand">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="text-lg font-semibold text-brand">JobPrep</span>
        <span className="rounded-full bg-brand-soft px-2 py-[3px] text-[11px] font-semibold text-brand">Admin</span>
      </Link>
      <CountrySelector />
      <nav aria-label="Admin" className="flex flex-col gap-0.5">
        {items.map((n) => (
          <NavLink
            key={n.key}
            to={n.to}
            end={n.to === ADMIN_HOME}
            className={({ isActive }) =>
              cx('flex min-h-[40px] items-center gap-3 rounded-[10px] px-3 text-[15px] no-underline hover:no-underline', isActive ? 'bg-brand-soft font-semibold text-brand hover:text-brand' : 'bg-transparent font-medium text-ink hover:text-ink')
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-brand' : 'text-muted'}>
                  <Icon path={n.icon} size={18} strokeWidth={1.8} />
                </span>
                <span className="flex-1">{n.label}</span>
                {n.key === 'payments' && pending > 0 && (
                  <span className="rounded-full bg-flagged-bg px-2 py-0.5 text-xs font-semibold text-flagged">
                    {pending}
                    <span className="sr-only"> pending</span>
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t border-border px-1 pt-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand">
            {initials(admin.name)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-ink">{admin.name}</span>
            <span className="text-xs text-muted">{rolesLabel(admin.roles)}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => void signOut.run()}
          disabled={signOut.busy}
          className="flex min-h-11 items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-2 text-left text-[15px] font-medium text-ink hover:bg-soft disabled:opacity-60"
        >
          <span className="text-muted"><Icon path={SIGN_OUT_ICON} size={18} strokeWidth={1.8} /></span>
          Sign out
        </button>
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
          end={n.to === ADMIN_HOME}
          className={({ isActive }) =>
            cx('flex min-h-[48px] flex-col items-center gap-0.5 py-1.5 text-[11px] no-underline', isActive ? 'font-semibold text-brand' : 'font-semibold text-muted hover:text-muted')
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
 * The chrome of every screen: the white sidebar (logo and Admin pill, the Country filter, the navigation and the signed-in admin) on desktop, the white header and the
 * bottom bar on a phone. The same pages render inside both.
 */
export function AdminShell({ title, back, headerExtra, gap = 18, children }: ShellProps) {
  const admin = useAdmin();
  const phoneSignOut = useAdminSignOut();
  const isDesktop = useIsDesktop();
  useDocumentTitle(`${title} · Admin`);
  const canPayments = admin.permissions.includes('payments:read');
  const { country } = useAdminCountry();
  const pending = usePendingCount(canPayments && isDesktop, country);
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
          <AdminMark />
          <button
            type="button"
            aria-label="Sign out"
            onClick={() => void phoneSignOut.run()}
            disabled={phoneSignOut.busy}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-[10px] border-0 bg-transparent text-muted disabled:opacity-60"
          >
            <Icon path={SIGN_OUT_ICON} size={20} />
          </button>
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
