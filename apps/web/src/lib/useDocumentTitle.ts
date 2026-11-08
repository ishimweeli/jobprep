import { useEffect } from 'react';

const SUFFIX = 'JobPrep';

/** Finds (or creates in <head>) the element matched by `selector`, so index.html need not declare every tag. */
function ensure(selector: string, tag: 'meta' | 'link', attrs: Record<string, string>): HTMLElement {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  return el;
}

/** Sets a meta tag's content and returns a function restoring the previous value. */
export function setMetaContent(selector: string, attrs: Record<string, string>, content: string): () => void {
  const el = ensure(selector, 'meta', attrs);
  const prev = el.getAttribute('content');
  el.setAttribute('content', content);
  return () => { if (prev !== null) el.setAttribute('content', prev); };
}

/**
 * Sets `document.title` ("Page — JobPrep") while the page is mounted. With a `description` it also sets the page's
 * meta description and the matching Open Graph / Twitter tags, which is what search results and link previews show.
 * Pages without one keep the site-wide description from index.html.
 */
export function useDocumentTitle(title: string | null | undefined, description?: string | null) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    const full = `${title} — ${SUFFIX}`;
    document.title = full;
    const undo = [
      setMetaContent('meta[property="og:title"]', { property: 'og:title' }, full),
      setMetaContent('meta[name="twitter:title"]', { name: 'twitter:title' }, full),
    ];
    if (description) {
      undo.push(
        setMetaContent('meta[name="description"]', { name: 'description' }, description),
        setMetaContent('meta[property="og:description"]', { property: 'og:description' }, description),
        setMetaContent('meta[name="twitter:description"]', { name: 'twitter:description' }, description),
      );
    }
    return () => {
      document.title = prev;
      for (const u of undo) u();
    };
  }, [title, description]);
}

/** Pages with nothing for a search engine to index: signed-in areas, auth flows, live exams. */
const PRIVATE_PATH = /^\/(admin|account|sign-in|sign-up|verify-email|forgot-password|reset-password|auth|setup|choose-country)(\/|$)|^\/[^/]+\/(exam|review|results|checkout|progress|interview|interview-live)(\/|$)/;

/** Keeps the canonical URL, og:url and robots tag in step with the current route (query strings are not part of the URL). */
export function useRouteSeo(pathname: string) {
  useEffect(() => {
    const url = `${window.location.origin}${pathname === '/' ? '' : pathname.replace(/\/+$/, '')}` || window.location.origin;
    ensure('link[rel="canonical"]', 'link', { rel: 'canonical' }).setAttribute('href', url);
    ensure('meta[property="og:url"]', 'meta', { property: 'og:url' }).setAttribute('content', url);
    const robots = ensure('meta[name="robots"]', 'meta', { name: 'robots' });
    robots.setAttribute('content', PRIVATE_PATH.test(pathname) ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
  }, [pathname]);
}
