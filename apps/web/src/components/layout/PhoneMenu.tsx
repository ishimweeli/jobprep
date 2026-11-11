import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { isLocale } from '@jobprep/shared';
import { focusableIn } from '../Dialog';
import { Logo } from '../Logo';
import { StrokeIcon } from '../StrokeIcon';
import { primaryNav } from './navItems';
import { cx } from '../../lib/cx';
import { initials, languageOwnName } from '../../lib/format';
import { useLocale, useOfferedLanguages, useSetLocale } from '../../lib/i18n';
import { useSetTheme } from '../../lib/theme';
import { useSession } from '../../features/auth/session';
import { useSignOut } from '../../features/account/useSignOut';
import { countryPath, useActiveCountry } from '../../features/country/hooks';

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'flex min-h-[44px] items-center gap-3 rounded-[10px] px-2.5 text-[15px] no-underline hover:bg-soft hover:text-ink dark:hover:bg-night-soft',
    isActive ? 'bg-brand-soft font-semibold text-brand dark:bg-night-brand-soft dark:text-night-brand' : 'font-medium text-ink-2 dark:text-night-ink',
  );

/**
 * Signed-in phone drawer menu (MenuMobile.dc): opened by the hamburger in PhoneTopBar. Mirrors the desktop
 * sidebar's nav, plus a Settings section (Language, Dark mode, Help) and the pinned account block + Sign out.
 * Closes on a backdrop tap, the X, Escape, or navigating to a new route.
 */
export function PhoneMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { slug, country } = useActiveCountry();
  const { session } = useSession();
  const signOut = useSignOut(countryPath(slug));
  const { theme, toggle: toggleTheme } = useSetTheme();
  const offered = useOfferedLanguages().filter(isLocale);
  const locale = useLocale();
  const { setLocale } = useSetLocale();
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Close whenever the route changes (navigating from a nav link already calls onClose, this is the backstop).
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      root?.removeAttribute('inert');
      document.body.style.overflow = prevOverflow;
      const el = returnFocusRef.current;
      if (el && document.contains(el)) el.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = focusableIn(panel);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const items = primaryNav(slug, { interviewPrep: session?.features?.interviewPrep });

  const nextLocale = () => {
    if (offered.length < 2) return;
    const i = offered.indexOf(locale);
    setLocale(offered[(i + 1) % offered.length]!);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex"
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      data-testid="phone-menu-overlay"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(20,24,31,0.45)]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        className="relative flex h-full w-[300px] max-w-[85vw] flex-col gap-4 overflow-y-auto bg-surface p-4 outline-none dark:bg-night-surface"
      >
        <div className="flex items-center justify-between">
          <Logo to={countryPath(slug)} size="sm" />
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-ink dark:text-night-ink"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <Link
          to="/choose-country"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-[12px] bg-surface-subtle px-2.5 py-2 no-underline hover:text-ink dark:bg-night-soft"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-border bg-surface text-[11px] font-bold text-ink dark:border-night-border dark:bg-night-surface dark:text-night-heading"
          >
            {(country?.code ?? slug).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-semibold text-heading dark:text-night-heading">{country?.name ?? slug.toUpperCase()}</span>
            <span className="truncate text-[12px] text-muted dark:text-night-muted">Public-service exams</span>
          </span>
        </Link>

        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {items.map((item) => (
            <li key={item.label}>
              <Link
                to={item.to}
                onClick={onClose}
                className={navLink({ isActive: item.isActive(location.pathname, location.search) })}
                aria-current={item.isActive(location.pathname, location.search) ? 'page' : undefined}
              >
                <StrokeIcon name={item.icon} size={20} className="flex-none" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div aria-hidden="true" className="h-px bg-border dark:bg-night-border" />

        <div className="flex flex-col gap-0.5">
          <span className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted dark:text-night-muted">Settings</span>
          {offered.length > 1 && (
            <button
              type="button"
              onClick={nextLocale}
              className="flex min-h-[44px] cursor-pointer items-center justify-between rounded-[10px] border-0 bg-transparent px-2.5 text-[15px] font-medium text-ink-2 hover:bg-soft dark:text-night-ink dark:hover:bg-night-soft"
            >
              Language
              <span className="text-[13px] font-semibold text-ink dark:text-night-heading">{languageOwnName(locale)}</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex min-h-[44px] cursor-pointer items-center justify-between rounded-[10px] border-0 bg-transparent px-2.5 text-[15px] font-medium text-ink-2 hover:bg-soft dark:text-night-ink dark:hover:bg-night-soft"
          >
            Dark mode
            <span className="text-[13px] font-semibold text-ink dark:text-night-heading">{theme === 'dark' ? 'On' : 'Off'}</span>
          </button>
          <NavLink to="/help" onClick={onClose} className={navLink}>
            <StrokeIcon name="help" size={20} className="flex-none" />
            Help and support
          </NavLink>
        </div>

        {session && (
          <div className="mt-auto flex flex-col gap-2.5 border-t border-border pt-4 dark:border-night-border">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-hover dark:bg-night-brand-soft dark:text-night-brand"
              >
                {initials(session.user.name)}
              </span>
              <span className="flex min-w-0 flex-col">
                <strong className="truncate text-[13px] font-semibold text-heading dark:text-night-heading">{session.user.name}</strong>
                <span className="truncate text-[12px] text-muted dark:text-night-muted">{session.user.email}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => void signOut.request()}
              disabled={signOut.busy}
              aria-label="Sign out"
              className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[10px] border border-incorrect-line bg-surface px-2.5 text-[13px] font-semibold text-incorrect dark:border-incorrect-line dark:bg-night-surface"
            >
              <StrokeIcon name="signOut" size={16} className="flex-none" />
              Sign out
            </button>
            {signOut.dialog}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
