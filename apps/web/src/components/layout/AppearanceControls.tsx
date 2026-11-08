import { useLocation, useMatches } from 'react-router-dom';
import { useSession } from '../../features/auth/session';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { DarkModeToggle, LanguageButton } from './TopBar';
import type { RouteHandle } from './SiteLayout';

/**
 * Dark mode and language on every page. The signed-in desktop top bar already has both (so nothing is shown twice
 * there); everywhere else (the landing page, sign-in and sign-up, checkout, setup, legal and help pages, the phone
 * layouts) this small control floats in the bottom corner, above the sticky bars.
 * Left out on purpose: the admin area (always light), and the exam, answer review and live interview screens, where
 * a floating control would sit on top of the timer and the answer buttons.
 */
const HIDDEN = /^\/admin(\/|$)|^\/[^/]+\/(exam|review|interview-live)\//;

export function AppearanceControls() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const { user } = useSession();
  const desktop = useIsDesktop();
  const hasTopBar = !!user && desktop && matches.some((m) => (m.handle as RouteHandle | undefined)?.tabs);
  if (HIDDEN.test(pathname) || hasTopBar) return null;
  return (
    <div
      role="group"
      aria-label="Appearance and language"
      className="fixed bottom-24 right-3 z-30 flex items-center gap-1 rounded-pill border border-border bg-surface p-1 shadow-[0_8px_24px_rgba(20,30,50,0.16)] md:bottom-4 md:right-4 print:hidden dark:border-night-border dark:bg-night-surface"
    >
      <DarkModeToggle />
      <LanguageButton menuAbove compact />
    </div>
  );
}
