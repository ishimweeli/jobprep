import { useEffect, useState } from 'react';

/** `true` when the media query matches (updates live). Defaults to `false` where matchMedia is missing (tests). */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** The desktop artboards (sidebar + 640px of content) fit from 880px; below 900px the phone layout is used. */
export const DESKTOP_QUERY = '(min-width: 900px)';
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
