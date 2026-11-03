import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { authKeys, getProviders, googleStartUrl } from '../../api/auth';
import { catalogKeys, getMockTest } from '../../api/catalog';
import { getStoredCountry } from '../../lib/country';
import { paidTestFromNext } from '../../lib/next';

/** Is "Continue with Google" set up on the server? An error means no. */
export function useGoogleAvailable(): boolean {
  const q = useQuery({ queryKey: authKeys.providers, queryFn: getProviders, staleTime: 5 * 60_000, retry: false });
  return q.data?.google === true;
}

/** Leave for Google; it comes back to `/auth/callback?next=`. */
export function startGoogle(next: string | null): void {
  const country = getStoredCountry();
  window.location.assign(googleStartUrl({ next, countryCode: country }));
}

export const GOOGLE_UNAVAILABLE = 'Google sign-in isn’t available yet. Use your email instead.';

/**
 * The designed "Continue with Google" button is always drawn. Pressed, it leaves for Google when the server has it set up;
 * otherwise it stays here and `notice` says so.
 */
export function useGoogleButton(next: string | null) {
  const available = useGoogleAvailable();
  const [notice, setNotice] = useState<string | null>(null);
  return {
    notice,
    onClick: () => {
      if (available) startGoogle(next);
      else setNotice(GOOGLE_UNAVAILABLE);
    },
  };
}

/** The title of the paid test a guest tapped (from `next`), for the "payment for <test>" lines. `null` when `next` is not a payment or is loading. */
export function usePaidTestTitle(next: string | null): string | null {
  const paid = paidTestFromNext(next);
  const q = useQuery({
    queryKey: catalogKeys.detail(paid?.country ?? '', paid?.testSlug ?? ''),
    queryFn: () => getMockTest(paid!.country, paid!.testSlug),
    enabled: !!paid,
    staleTime: 60_000,
    retry: false,
  });
  return paid ? (q.data?.title ?? null) : null;
}
