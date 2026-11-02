import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '../api/client';

/** Retry network blips and 5xx once; never retry 4xx (not found / forbidden / validation won't fix themselves). */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
    },
  });
}
