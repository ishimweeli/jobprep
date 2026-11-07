import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { readStorage, writeStorage } from './storage';

/**
 * Dark mode (the top bar's moon toggle). The choice is kept in localStorage and applied on every candidate screen,
 * before the first paint (see the small script in index.html). The admin area stays light. Colours: tokens.ts
 * `darkColors`, applied to the shared colour classes in styles/index.css.
 *
 * Same store shape as `lib/i18n.ts`'s locale: localStorage + a subscriber set, read with `useSyncExternalStore`.
 */

export type Theme = 'light' | 'dark';
const THEME_KEY = 'jobprep.theme';

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

function isTheme(v: string | null): v is Theme {
  return v === 'light' || v === 'dark';
}

export function getStoredTheme(): Theme | null {
  const v = readStorage(THEME_KEY);
  return isTheme(v) ? v : null;
}

export function setStoredTheme(theme: Theme): void {
  writeStorage(THEME_KEY, theme);
  listeners.forEach((fn) => fn());
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The active theme: the stored choice if there is one, otherwise the OS preference (defaults to light in tests/SSR). */
export function useTheme(): Theme {
  const stored = useSyncExternalStore(subscribe, getStoredTheme, () => null);
  const system = useSyncExternalStore(
    (fn) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', fn);
      return () => mql.removeEventListener('change', fn);
    },
    prefersDark,
    () => false,
  );
  return stored ?? (system ? 'dark' : 'light');
}

/** Toggles and persists the theme (an explicit choice always wins over the OS preference from then on). */
export function useSetTheme() {
  const current = useTheme();
  const setTheme = useCallback((theme: Theme) => setStoredTheme(theme), []);
  const toggle = useCallback(() => setStoredTheme(current === 'dark' ? 'light' : 'dark'), [current]);
  return { theme: current, setTheme, toggle };
}

/** Keeps `<html class="dark">` in step with the theme. Rendered once in the root layout. */
export function useDocumentTheme(enabled = true): void {
  const theme = useTheme();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', enabled && theme === 'dark');
  }, [theme, enabled]);
}
