import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MeResponse } from '../../api/types';
import { StrokeIcon } from '../../components/StrokeIcon';
import { cx } from '../../lib/cx';
import { initials } from '../../lib/format';
import { accountMenuItems, type AccountMenuItem } from './accountMenuModel';
import { useSignOut } from './useSignOut';

/** Avatar circle with the user's initials. */
export function Avatar({ name, size = 40 }: { name: string; size?: 40 | 44 | 48 }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-flex flex-none items-center justify-center rounded-full bg-brand-soft font-extrabold text-brand-hover', size === 40 ? 'h-10 w-10' : size === 44 ? 'h-11 w-11' : 'h-12 w-12')}
    >
      {initials(name)}
    </span>
  );
}

const itemBase = 'flex min-h-[48px] items-center gap-3 rounded-[10px] px-3 py-3 text-ink no-underline hover:bg-soft hover:text-ink';

/** One row of the list: icon, label and the grey second line. Inert rows (no designed follow-up) are `aria-disabled`. */
export function MenuRow({ item, role, onNavigate }: { item: AccountMenuItem; role?: 'menuitem'; onNavigate?: () => void }) {
  const body = (
    <>
      <StrokeIcon name={item.icon} className="flex-none" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">{item.label}</span>
        {item.secondary && <span className="text-[13px] text-muted">{item.secondary}</span>}
      </span>
    </>
  );
  if (!item.to) {
    return (
      <span role={role} aria-disabled="true" className={cx(itemBase, 'cursor-default hover:bg-transparent')}>
        {body}
      </span>
    );
  }
  return (
    <Link to={item.to} role={role} tabIndex={role ? -1 : undefined} onClick={onNavigate} className={itemBase}>
      {body}
    </Link>
  );
}

export function useMenuItems(session: MeResponse, slug: string) {
  return accountMenuItems({ slug, countryName: session.country.name, access: session.access, languages: session.country.languages, roles: session.user.roles });
}

/** Desktop header avatar + account menu (AccountMenu.dc). */
export function AccountMenu({ session, slug }: { session: MeResponse; slug: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const items = useMenuItems(session, slug);
  const signOut = useSignOut(`/${slug}`);
  const user = session.user;

  const rows = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  useEffect(() => {
    if (!open) return;
    rows()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = rows();
      const i = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next]?.focus();
    }
  };

  return (
    <div className="relative" onKeyDown={onKeyDown}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // The name starts with the visible initials (WCAG 2.5.3 label in name).
        aria-label={`${initials(user.name)} account menu for ${user.name}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-brand-soft p-0 font-extrabold text-brand-hover"
      >
        {initials(user.name)}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+10px)] z-40 flex w-[340px] flex-col rounded-card border border-border bg-surface p-2 shadow-[0_16px_40px_rgba(24,24,27,0.16)]"
        >
          <div className="flex items-center gap-3 p-3">
            <Avatar name={user.name} size={44} />
            <span className="flex min-w-0 flex-col">
              <strong className="truncate text-base">{user.name}</strong>
              <span className="truncate text-[13px] text-muted">{user.email}</span>
            </span>
          </div>
          <div className="my-1 h-px bg-border" />
          {items.map((item) => (
            <MenuRow key={item.id} item={item} role="menuitem" onNavigate={() => setOpen(false)} />
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              void signOut.request();
            }}
            className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[10px] border-0 bg-transparent px-3 py-3 text-left text-[15px] font-semibold text-red-800 hover:bg-red-50"
          >
            <StrokeIcon name="signOut" className="flex-none" />
            Sign out
          </button>
        </div>
      )}
      {signOut.dialog}
    </div>
  );
}
