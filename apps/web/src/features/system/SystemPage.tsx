import { useEffect, useRef } from 'react';
import { Link, useLocation, useRouteError } from 'react-router-dom';
import { isApiError } from '../../api/client';
import { buttonClasses } from '../../components/Button';
import { DesktopHeader, PhoneBrandHeader } from '../../components/layout/Header';
import { setSystemState, useMaintenanceInfo, useSystemState } from '../../lib/systemState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { countryPath, useActiveCountrySlug } from '../country/hooks';
import { formatReference, maintenanceBody, SYSTEM_COPY, type SystemPageKind } from './systemModel';

/** Icon circle, optional code, title, text, optional note, buttons and the reference (the body of every system page). */
export function SystemPageBody({
  kind, reference, cta, alt, inline, body,
}: {
  kind: SystemPageKind;
  /** Replaces the default text (the maintenance message an admin wrote). */
  body?: string;
  /** Inside a page that already has its own `<main>`. */
  inline?: boolean;
  reference?: string | null;
  /** The primary action: a link (`to`) or a button (`onClick`). */
  cta: { to?: string; onClick?: () => void };
  alt?: { to: string; onClick?: () => void };
}) {
  const c = SYSTEM_COPY[kind];
  const ref = formatReference(reference);
  const primary = buttonClasses({ variant: 'primary', size: 'lg', block: true });
  const Wrap = inline ? 'div' : 'main';
  return (
    <Wrap {...(inline ? {} : { id: 'main-content', tabIndex: -1 })} className="flex flex-1 items-start justify-center bg-surface px-4 pb-6 pt-12 outline-none md:bg-page md:pb-14 md:pt-[72px]">
      <div className="flex w-full max-w-[460px] flex-col items-center gap-3.5 text-center">
        <span className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-soft text-ink">
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d={c.icon} />
          </svg>
        </span>
        {c.code && <span className="text-sm font-semibold text-muted">{c.code}</span>}
        <h1 className="m-0 text-2xl leading-[1.2] tracking-tight md:text-[28px]">{c.title}</h1>
        <p className="m-0 text-base leading-[1.55] text-ink-2">{body ?? c.body}</p>
        {c.note && <p className="m-0 rounded-[10px] bg-free-bg px-3.5 py-2.5 text-sm font-semibold text-free">{c.note}</p>}
        <div className="flex w-full flex-col gap-2">
          {cta.to ? (
            <Link to={cta.to} onClick={cta.onClick} className={primary}>
              {c.cta}
            </Link>
          ) : (
            <button type="button" onClick={cta.onClick} className={primary}>
              {c.cta}
            </button>
          )}
          {c.alt && alt && (
            <Link to={alt.to} onClick={alt.onClick} className="link p-2.5 text-[15px] font-semibold">
              {c.alt}
            </Link>
          )}
        </div>
        {ref && <p className="m-0 text-xs text-muted">Reference: {ref} — share this with support if it keeps happening.</p>}
      </div>
    </Wrap>
  );
}

/** Header + page for system pages that replace the whole screen (404, route errors, maintenance, session expired). */
export function SystemShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-ink focus:px-4 focus:py-3 focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <DesktopHeader />
      <PhoneBrandHeader minimal />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/** Unknown route: "We can’t find that page" instead of a silent redirect. */
export function NotFoundPage() {
  useDocumentTitle('Page not found');
  const slug = useActiveCountrySlug();
  return (
    <SystemShell>
      <SystemPageBody kind="not_found" cta={{ to: countryPath(slug, 'tests') }} alt={{ to: countryPath(slug) }} />
    </SystemShell>
  );
}

/** `errorElement` of the router: a screen that crashed. The reference is shown when the failure came from the API. */
export function RouteErrorPage() {
  useDocumentTitle('Something went wrong');
  const error = useRouteError();
  const slug = useActiveCountrySlug();
  const reference = isApiError(error) ? error.requestId : null;
  return (
    <SystemShell>
      <SystemPageBody kind="error" reference={reference} cta={{ onClick: () => window.location.reload() }} alt={{ to: countryPath(slug) }} />
    </SystemShell>
  );
}

/**
 * Maintenance (the API answered 503) and "Please sign in again" (a 401 while this browser was signed in) replace the
 * page until the user acts. Rendered by the root layout.
 */
export function SystemGate() {
  const kind = useSystemState();
  const { pathname, search } = useLocation();
  // The page is replaced until the user goes somewhere else.
  const shownAt = useRef<string | null>(null);
  useEffect(() => {
    if (!kind) shownAt.current = null;
    else if (shownAt.current === null) shownAt.current = pathname;
    else if (shownAt.current !== pathname) setSystemState(null);
  }, [kind, pathname]);
  const slug = useActiveCountrySlug();
  const maintenance = useMaintenanceInfo();
  useDocumentTitle(kind === 'maintenance' ? 'JobPrep is being updated' : kind === 'session_expired' ? 'Please sign in again' : undefined);
  if (!kind) return null;
  const clear = () => setSystemState(null);
  if (kind === 'maintenance') {
    return (
      <SystemShell>
        <SystemPageBody kind="maintenance" body={maintenanceBody(maintenance, SYSTEM_COPY.maintenance.body)} cta={{ onClick: () => window.location.reload() }} />
      </SystemShell>
    );
  }
  const next = pathname !== '/sign-in' ? `?next=${encodeURIComponent(`${pathname}${search}`)}` : '';
  return (
    <SystemShell>
      <SystemPageBody
        kind="session_expired"
        cta={{ to: `/sign-in${next}`, onClick: clear }}
        alt={{ to: countryPath(slug), onClick: clear }}
      />
    </SystemShell>
  );
}
