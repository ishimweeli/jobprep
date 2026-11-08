import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useMatches } from 'react-router-dom';
import { isLocale } from '@jobprep/shared';
import { StrokeIcon } from '../StrokeIcon';
import { cx } from '../../lib/cx';
import { languageOwnName } from '../../lib/format';
import { useLocale, useOfferedLanguages, useSetLocale } from '../../lib/i18n';
import { useSetTheme } from '../../lib/theme';
import { useSession } from '../../features/auth/session';
import { AccountMenu } from '../../features/account/AccountMenu';
import { countryPath, useActiveCountrySlug } from '../../features/country/hooks';
import type { RouteHandle } from './SiteLayout';

const iconButton =
  'flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-[10px] border border-border bg-surface text-ink hover:bg-soft dark:border-night-border dark:bg-night-surface dark:text-night-ink dark:hover:bg-night-soft';

function DarkModeToggle() {
  const { theme, toggle } = useSetTheme();
  return (
    <button type="button" aria-label="Dark mode" aria-pressed={theme === 'dark'} onClick={toggle} className={iconButton}>
      <StrokeIcon name="moon" size={18} />
    </button>
  );
}

function LanguageButton() {
  const offered = useOfferedLanguages().filter(isLocale);
  const locale = useLocale();
  const { setLocale, pending } = useSetLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (offered.length < 2) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex h-10 flex-none cursor-pointer items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-soft dark:border-night-border dark:bg-night-surface dark:text-night-ink dark:hover:bg-night-soft"
      >
        <StrokeIcon name="country" size={16} />
        {languageOwnName(locale)}
        <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Language"
          className="absolute right-0 top-[calc(100%+6px)] z-40 flex min-w-[160px] flex-col gap-0.5 rounded-[10px] border border-border bg-surface p-1.5 shadow-[0_16px_40px_rgba(20,30,50,0.16)] dark:border-night-border dark:bg-night-surface"
        >
          {offered.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitem"
              aria-current={l === locale ? 'true' : undefined}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={cx(
                'flex min-h-[36px] cursor-pointer items-center rounded-[8px] border-0 px-2.5 text-left text-sm',
                l === locale ? 'bg-brand-soft font-semibold text-brand dark:bg-night-brand-soft dark:text-night-brand' : 'bg-transparent text-ink hover:bg-soft dark:text-night-ink dark:hover:bg-night-soft',
              )}
            >
              {languageOwnName(l)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The account chip opens the real dropdown (AccountMenu.dc) — the chevron promises a menu, not a page. */
function AccountChip() {
  const { session } = useSession();
  const slug = useActiveCountrySlug();
  if (!session) return null;
  return <AccountMenu session={session} slug={slug} />;
}

/**
 * Desktop top bar: the page title (or, on the exam-detail page, a back arrow + "Mock test"), dark-mode toggle,
 * language button and account chip. Sits above the content, to the right of the sidebar (see SiteShell).
 */
export function TopBar() {
  const matches = useMatches();
  const slug = useActiveCountrySlug();
  const handle = [...matches].reverse().map((m) => m.handle as RouteHandle | undefined).find((h) => h?.title || h?.backTo);

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-7 py-3 dark:border-night-border dark:bg-night-surface">
      {handle?.backTo ? (
        <Link
          to={countryPath(slug, handle.backTo)}
          aria-label={handle.backLabel ?? 'Back to mock tests'}
          className="flex h-8 items-center gap-2 text-[15px] font-semibold text-heading no-underline hover:text-heading dark:text-night-heading"
        >
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border border-border bg-surface dark:border-night-border dark:bg-night-surface">
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
          </span>
          {handle.title ?? 'Mock test'}
        </Link>
      ) : (
        <span className="text-[15px] font-semibold text-heading dark:text-night-heading">{handle?.title}</span>
      )}
      <div className="flex-1" />
      <DarkModeToggle />
      <LanguageButton />
      <AccountChip />
    </header>
  );
}
