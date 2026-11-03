import type { MeResponse } from '../../api/types';
import { PhoneBackHeader } from '../../components/layout/Header';
import { StrokeIcon } from '../../components/StrokeIcon';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { Avatar, MenuRow, useMenuItems } from './AccountMenu';
import { useSignOut } from './useSignOut';

/**
 * The phone "Account" tab (NavPhone.dc, "Signed in: Account tab"): profile card, the same list as the desktop
 * account menu, a Sign out button and the platform line. Used on desktop too when someone opens /account
 * directly (centred column; no desktop artboard exists for it).
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
      <PhoneBackHeader to={countryPath(slug, 'progress')} title="Account" />
      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-3 p-4 outline-none md:py-8">
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
          <Avatar name={user.name} size={48} />
          <span className="flex min-w-0 flex-col">
            <strong className="truncate text-[17px]">{user.name}</strong>
            <span className="truncate text-[13px] text-muted">{user.email}</span>
          </span>
        </div>
        <nav aria-label="Account" className="rounded-card border border-border bg-surface p-1">
          {items.map((item) => (
            <MenuRow key={item.id} item={item} />
          ))}
        </nav>
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
      </main>
      {signOut.dialog}
    </div>
  );
}
