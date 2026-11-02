import { NavLink } from 'react-router-dom';
import { countryPath, useActiveCountrySlug } from '../../features/country/hooks';
import { cx } from '../../lib/cx';
import { StrokeIcon, type IconName } from '../StrokeIcon';

/**
 * Signed-in phone navigation (NavPhone.dc): Home, Tests, Progress, Account. It replaces the older three-tab bar.
 * Home is the country home page, Progress is the dashboard.
 */
export function PhoneTabBar() {
  const slug = useActiveCountrySlug();
  const tabs: { to: string; label: string; icon: IconName; end?: boolean }[] = [
    { to: countryPath(slug), label: 'Home', icon: 'home', end: true },
    { to: countryPath(slug, 'tests'), label: 'Tests', icon: 'tests' },
    { to: countryPath(slug, 'progress'), label: 'Progress', icon: 'progress' },
    { to: '/account', label: 'Account', icon: 'user' },
  ];
  return (
    <nav aria-label="Main" className="sticky bottom-0 z-30 mt-auto grid grid-cols-4 border-t border-border bg-surface px-1 pb-2 pt-1 md:hidden">
      {tabs.map((t) => (
        <NavLink
          key={t.label}
          to={t.to}
          end={t.end ?? false}
          className={({ isActive }) =>
            cx(
              'flex min-h-[52px] flex-col items-center gap-0.5 py-1.5 text-xs no-underline',
              isActive ? 'font-bold text-brand hover:text-brand' : 'font-semibold text-muted hover:text-muted',
            )
          }
        >
          <StrokeIcon name={t.icon} size={22} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
