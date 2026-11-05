import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link, useMatches } from 'react-router-dom';
import { initials } from '../../lib/format';
import { useSession } from '../../features/auth/session';
import { PhoneMenu } from './PhoneMenu';
import type { RouteHandle } from './SiteLayout';

/**
 * Signed-in phone header (56px, fixed chrome, replaces the old bottom tab bar): hamburger (opens the PhoneMenu
 * drawer) on the left, the current page's title in the middle, the account avatar on the right.
 */
export function PhoneTopBar() {
  const matches = useMatches();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const handle = [...matches].reverse().map((m) => m.handle as RouteHandle | undefined).find((h) => h?.title);
  const title = handle?.title ?? 'JobPrep';

  return (
    <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-2 border-b border-border bg-surface px-1 md:hidden dark:border-night-border dark:bg-night-surface">
      <button
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center border-0 bg-transparent text-ink dark:text-night-ink"
      >
        <Menu size={22} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <span className="flex-1 truncate text-center text-[16px] font-semibold text-heading dark:text-night-heading">{title}</span>
      {session ? (
        <Link
          to="/account"
          aria-label={`${initials(session.user.name)} account: ${session.user.name}`}
          className="mx-0.5 flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand no-underline hover:text-brand dark:bg-night-brand-soft dark:text-night-brand"
        >
          {initials(session.user.name)}
        </Link>
      ) : (
        <span aria-hidden="true" className="h-11 w-11 flex-none" />
      )}
      <PhoneMenu open={open} onClose={() => setOpen(false)} />
    </header>
  );
}
