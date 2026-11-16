import { useLocation, useMatches } from 'react-router-dom';
import { useSession } from '../../features/auth/session';
import { DarkModeToggle, LanguageButton } from './TopBar';
import type { RouteHandle } from './SiteLayout';

/** Height of the bar, so a page's own sticky header can sit just below it (`top-12`). */
export const APPEARANCE_BAR_HEIGHT = 'h-12';

/**
 * Dark mode and language on every page, in a slim bar that stays at the top of the screen (it used to float in the
 * bottom corner, where it covered the page). Signed-in pages with the app chrome already have both in their top bar
 * (desktop TopBar, phone PhoneTopBar), so nothing is shown twice there.
 * Left out on purpose: the admin area (always light), and the exam, answer review and live interview screens, which
 * use the whole screen for the timer and the answers.
 */
const HIDDEN = /^\/admin(\/|$)|^\/[^/]+\/(exam|review|interview-live)\//;

export function AppearanceControls() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const { user } = useSession();
  const hasTopBar = !!user && matches.some((m) => (m.handle as RouteHandle | undefined)?.tabs);
  if (HIDDEN.test(pathname) || hasTopBar) return null;
  return (
    <div
      role="group"
      aria-label="Appearance and language"
      className="sticky top-0 z-40 border-b border-border bg-surface print:hidden dark:border-night-border dark:bg-night-surface"
    >
      <div className={`mx-auto flex ${APPEARANCE_BAR_HEIGHT} max-w-[1200px] items-center justify-end gap-1.5 px-3 md:px-6`}>
        <DarkModeToggle />
        <LanguageButton compact />
      </div>
    </div>
  );
}
