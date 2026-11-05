import type { MeResponse } from '../../api/types';
import { StrokeIcon } from '../../components/StrokeIcon';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { Avatar, MenuRow, useMenuItems } from './AccountMenu';
import { useSignOut } from './useSignOut';

/**
 * The phone "Account" tab (NavPhone.dc, "Signed in: Account tab"): profile card, the same list as the desktop
 * account menu, a Sign out button and the platform line. Desktop (Account.dc, the November redesign) widens to
 * a two-column layout matching Dashboard/Pricing/Exam detail — the menu on the left, Sign out and the platform
 * line pinned to a right-hand column — instead of a narrow centred card floating in the extra width.
 */
export function AccountTabPage() {
  useDocumentTitle('Account');
  const { session } = useSession();
  return session ? <AccountTab session={session} /> : null;
}

function AccountTab({ session }: { session: MeResponse }) {
  const slug = useActiveCountrySlug();
  const signOut = useSignOut(countryPath(slug));
  const items = useMenuItems(session, slug);
  const { user } = session;

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="sr-only">Account</h1>
      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-3 p-4 outline-none md:py-8">
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 dark:border-night-border dark:bg-night-surface">
          <Avatar name={user.name} size={48} />
          <span className="flex min-w-0 flex-col">
            <strong className="truncate text-base text-heading dark:text-night-heading">{user.name}</strong>
            <span className="truncate text-[13px] text-muted dark:text-night-muted">{user.email}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <nav aria-label="Account" className="min-w-0 flex-[999_1_480px] rounded-card border border-border bg-surface p-1 dark:border-night-border dark:bg-night-surface">
            {items.map((item) => (
              <MenuRow key={item.id} item={item} />
            ))}
          </nav>
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-3">
            <button
              type="button"
              onClick={() => void signOut.request()}
              disabled={signOut.busy}
              className="flex min-h-[48px] cursor-pointer items-center justify-center gap-2.5 rounded-[14px] border border-incorrect-line bg-surface text-base font-semibold text-incorrect"
            >
              <StrokeIcon name="signOut" />
              Sign out
            </button>
            <p className="m-0 text-center text-xs text-muted">JobPrep by Nexvecta · Independent practice platform</p>
          </div>
        </div>
      </main>
      {signOut.dialog}
    </div>
  );
}
