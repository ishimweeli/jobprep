import { ChevronDown } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo } from '../Logo';
import { StrokeIcon } from '../StrokeIcon';
import { primaryNav } from './navItems';
import { cx } from '../../lib/cx';
import { countryPath, useActiveCountry } from '../../features/country/hooks';
import { useSession } from '../../features/auth/session';

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'flex min-h-[40px] items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] no-underline hover:bg-soft hover:text-ink dark:hover:bg-night-soft',
    isActive
      ? 'bg-brand-soft font-semibold text-brand dark:bg-night-brand-soft dark:text-night-brand'
      : 'font-medium text-ink-2 dark:text-night-ink',
  );

/**
 * Signed-in desktop sidebar (232px, fixed to the left of the content). Logo, the country display, primary nav
 * (Dashboard / Mock tests / Pricing / Account) and a Support section (Help and support). Language, the account
 * name/email and Sign out live only in the top bar's profile menu (TopBar.tsx / AccountMenu.tsx) — not duplicated here.
 */
export function Sidebar() {
  const { slug, country } = useActiveCountry();
  const code = (country?.code ?? slug).toUpperCase();
  const name = country?.name ?? code;

  const { session } = useSession();
  const { pathname, search } = useLocation();
  const items = primaryNav(slug, { interviewPrep: session?.features?.interviewPrep });

  return (
    <nav
      aria-label="Main"
      className="hidden w-[232px] flex-none flex-col gap-5 border-r border-border bg-surface px-4 py-5 md:flex dark:border-night-border dark:bg-night-surface"
    >
      <Logo to={countryPath(slug)} size="md" />

      <Link
        to="/choose-country"
        aria-label={`Country: ${code} ${name}. Change country`}
        className="flex items-center gap-2.5 rounded-[12px] bg-surface-subtle px-2.5 py-2 no-underline hover:text-ink dark:bg-night-soft"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-border bg-surface text-[11px] font-bold text-ink dark:border-night-border dark:bg-night-surface dark:text-night-heading"
        >
          {code}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-semibold text-heading dark:text-night-heading">{name}</span>
          <span className="truncate text-[12px] text-muted dark:text-night-muted">Public-service exams</span>
        </span>
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" className="flex-none text-muted dark:text-night-muted" />
      </Link>

      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              to={item.to}
              className={navLink({ isActive: item.isActive(pathname, search) })}
              aria-current={item.isActive(pathname, search) ? 'page' : undefined}
            >
              <StrokeIcon name={item.icon} size={18} className="flex-none" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <div aria-hidden="true" className="h-px bg-border dark:bg-night-border" />
        <span className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted dark:text-night-muted">Support</span>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          <li>
            <NavLink to="/help" className={navLink}>
              <StrokeIcon name="help" size={18} className="flex-none" />
              Help and support
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
}
