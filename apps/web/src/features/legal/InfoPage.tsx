import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PhoneBackHeader } from '../../components/layout/Header';
import { SiteShell } from '../../components/layout/SiteLayout';
import { cx } from '../../lib/cx';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import type { TocItem } from './legalModel';

/**
 * The page template of the legal and help pages (C25): title, last-updated line, a table of contents on desktop and a
 * readable body (max 70 characters wide). On phone the contents list is left out and the sections just follow.
 * Not drawn; built from the existing header, card and type styles.
 */
export function InfoPage({
  title, updated, notice, toc, children, footer, wide,
}: { title: string; updated?: string | null; notice?: ReactNode; toc: TocItem[]; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const slug = useActiveCountrySlug();
  return (
    <SiteShell>
      <PhoneBackHeader to={countryPath(slug)} label="Back to home" title={title} />
      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-4 px-4 pb-10 pt-5 outline-none md:flex-row md:items-start md:gap-10 md:px-6 md:pb-16 md:pt-10">
        {toc.length > 0 && (
          <nav aria-label="On this page" className="hidden w-[240px] flex-none flex-col gap-1 md:sticky md:top-6 md:flex">
            <span className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted">On this page</span>
            {toc.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="inline-flex min-h-[36px] items-center rounded-[8px] px-2 text-[15px] text-ink-2 no-underline hover:bg-soft hover:text-ink">
                {t.heading}
              </a>
            ))}
          </nav>
        )}
        <div className={cx('flex min-w-0 flex-1 flex-col gap-4', !wide && 'max-w-[70ch]')}>
          <div className="flex flex-col gap-1.5">
            <h1 className={cx('m-0 text-2xl leading-[1.2] tracking-tight md:text-[32px]', wide && 'font-bold text-heading')}>{title}</h1>
            {updated && <p className="m-0 text-sm text-muted">{updated}</p>}
          </div>
          {notice}
          {children}
          {footer}
          <p className="m-0 border-t border-border pt-4 text-sm text-muted">
            <Link to="/help" className="link">
              Help and support
            </Link>
            {' · '}
            <Link to="/terms" className="link">
              Terms of use
            </Link>
            {' · '}
            <Link to="/privacy" className="link">
              Privacy policy
            </Link>
            {' · '}
            <Link to="/refund" className="link">
              Refund policy
            </Link>
          </p>
        </div>
      </main>
    </SiteShell>
  );
}

/** The amber "this is placeholder text" box. */
export function PlaceholderBox({ children }: { children: ReactNode }) {
  return (
    <p role="note" data-testid="placeholder-note" className="m-0 rounded-[10px] border border-flagged-line bg-flagged-bg px-3.5 py-3 text-[15px] font-semibold text-flagged-ink">
      {children}
    </p>
  );
}
