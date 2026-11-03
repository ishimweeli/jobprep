import { useCallback, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readStorage, writeStorage } from '../../lib/storage';
import { useAdmin } from '../features/auth/session';
import { COUNTRY_NAMES } from './format';

/**
 * The admin's global country filter (the "Country" selector at the top of the sidebar, AdminOverview.dc and its siblings).
 *
 * The choice lives in the URL (`?country=RW`, the parameter the admin API endpoints accept) and in localStorage, so it
 * survives a reload and a click on another sidebar item: the URL wins when it names an allowed country, otherwise the
 * stored choice is used. "All countries" is stored as `ALL` and means no `country` parameter at all.
 */
export const COUNTRY_STORAGE_KEY = 'jobprep.admin.country';
const ALL = 'ALL';
const CHANGED = 'jobprep:admin-country';

/** Which country codes this admin may pick: their scope, or every known country for an admin without a scope. */
export function allowedCountryCodes(scope: string[]): string[] {
  return scope.length ? scope : Object.keys(COUNTRY_NAMES);
}

/** The effective filter for a URL value and a stored value: `undefined` = all countries (no filter). */
export function resolveCountry(urlValue: string | null, stored: string | null, scope: string[]): string | undefined {
  const allowed = allowedCountryCodes(scope);
  const fromUrl = urlValue?.toUpperCase();
  if (fromUrl && allowed.includes(fromUrl)) return fromUrl;
  // An admin with a single country has no "All countries": that country is the only choice.
  if (scope.length === 1) return scope[0];
  const fromStore = stored?.toUpperCase();
  if (fromStore && fromStore !== ALL && allowed.includes(fromStore)) return fromStore;
  return undefined;
}

const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGED, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener('storage', cb);
  };
};
const snapshot = () => readStorage(COUNTRY_STORAGE_KEY);

export interface AdminCountryFilter {
  /** The active country code, or `undefined` for "All countries". Pass it as the `country` query parameter. */
  country: string | undefined;
  /** Pick a country (`''` = All countries): updates the URL and remembers the choice. */
  setCountry: (code: string) => void;
  /** The countries this admin may choose between. */
  options: string[];
  /** `false` when the admin has exactly one country (nothing to choose, no "All countries"). */
  canChooseAll: boolean;
}

export function useAdminCountry(): AdminCountryFilter {
  const { countryScope } = useAdmin();
  const [sp, setSp] = useSearchParams();
  const stored = useSyncExternalStore(subscribe, snapshot, () => null);
  const country = resolveCountry(sp.get('country'), stored, countryScope);

  const setCountry = useCallback(
    (code: string) => {
      writeStorage(COUNTRY_STORAGE_KEY, code ? code.toUpperCase() : ALL);
      window.dispatchEvent(new Event(CHANGED));
      const next = new URLSearchParams(sp);
      if (code) next.set('country', code.toUpperCase());
      else next.delete('country');
      next.delete('page');
      setSp(next, { replace: true });
    },
    [sp, setSp],
  );

  return { country, setCountry, options: allowedCountryCodes(countryScope), canChooseAll: countryScope.length !== 1 };
}
