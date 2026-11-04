import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_LOCALE, isLocale, t as translate, type Locale } from '@jobprep/shared';
import { ApiError } from '../api/client';
import { meKeys, patchMe } from '../api/me';
import { useSession } from '../features/auth/session';
import { useActiveCountrySlug, useCountryDetail } from '../features/country/hooks';
import { LANGUAGE_KEY } from './country';
import { readStorage, writeStorage } from './storage';

/**
 * UI language (C22 / C33). The catalogues live in `@jobprep/shared` (English is the source; untranslated keys fall
 * back to English key by key). The choice is kept in localStorage for guests and in the account (`PATCH /me
 * {language}`) for signed-in people. Only the languages the country offers can be chosen.
 */

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function getStoredLocale(): Locale | null {
  const v = readStorage(LANGUAGE_KEY);
  return v && isLocale(v) ? v : null;
}

export function setStoredLocale(locale: Locale): void {
  writeStorage(LANGUAGE_KEY, locale);
  listeners.forEach((fn) => fn());
}

/** The language to show: the account's, else the stored one, else English; never one the country does not offer. Pure. */
export function resolveLocale(input: { userLanguage?: string | null; stored?: string | null; offered?: string[] | null }): Locale {
  const ok = (v: string | null | undefined): v is Locale => !!v && isLocale(v) && (!input.offered || input.offered.length === 0 || input.offered.includes(v));
  if (ok(input.userLanguage)) return input.userLanguage;
  if (ok(input.stored)) return input.stored;
  return DEFAULT_LOCALE;
}

/** The languages the active country offers (own names come from `languageName`). English first. */
export function useOfferedLanguages(): string[] {
  const slug = useActiveCountrySlug();
  const { session } = useSession();
  const detail = useCountryDetail(slug);
  const own = session && session.country.code.toLowerCase() === slug ? session.country.languages : null;
  const list = own ?? detail.data?.languages ?? [];
  return list.length > 0 ? list : [DEFAULT_LOCALE];
}

export function useLocale(): Locale {
  const stored = useSyncExternalStore(subscribe, getStoredLocale, () => null);
  const { user } = useSession();
  const offered = useOfferedLanguages();
  return resolveLocale({ userLanguage: user?.language, stored, offered });
}

/** `t(key, vars)` in the current language. */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const locale = useLocale();
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}

/** Keeps `<html lang>` in step with the language. Rendered once in the root layout. */
export function useDocumentLanguage(): void {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}

/** Changes the language: remembered on this device and, when signed in, saved to the account. */
export function useSetLocale() {
  const qc = useQueryClient();
  const { user } = useSession();
  const m = useMutation({
    mutationFn: async (locale: Locale) => {
      setStoredLocale(locale);
      if (user) await patchMe({ language: locale });
      return locale;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: meKeys.session }),
  });
  return {
    setLocale: (locale: Locale) => m.mutate(locale),
    pending: m.isPending,
    error: m.isError ? (m.error instanceof ApiError && m.error.code === 'language_not_available' ? 'That language is not available in your country.' : 'We could not save your language. Try again.') : null,
  };
}

/** True when the test is not offered in the chosen language (it then stays in English): "This test is available in English only". */
export function untranslatedFor(locale: Locale, testLanguages: string[]): boolean {
  return locale !== DEFAULT_LOCALE && testLanguages.length > 0 && !testLanguages.includes(locale);
}

/** What to say about a translated attempt or review: nothing, "English only" (no question translated) or "partly translated". */
export function translationNote(l: { requested: string; translatedQuestions: number; totalQuestions: number } | null | undefined): 'english_only' | 'partial' | null {
  if (!l || l.requested === DEFAULT_LOCALE || l.totalQuestions <= 0) return null;
  if (l.translatedQuestions <= 0) return 'english_only';
  return l.translatedQuestions < l.totalQuestions ? 'partial' : null;
}
