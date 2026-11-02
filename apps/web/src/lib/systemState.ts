import { useSyncExternalStore } from 'react';

/**
 * App-wide "system" conditions that replace the page (SystemPages.dc): the session ran out while the user was
 * signed in, or the service is down for maintenance (503). Set by the API client, read by `SystemGate`.
 */
export type SystemKind = 'session_expired' | 'maintenance';

let current: SystemKind | null = null;
const listeners = new Set<() => void>();

export const getSystemState = () => current;

export function setSystemState(next: SystemKind | null): void {
  if (current === next) return;
  current = next;
  listeners.forEach((l) => l());
}

export function subscribeSystemState(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSystemState(): SystemKind | null {
  return useSyncExternalStore(subscribeSystemState, getSystemState, getSystemState);
}

/** A 503, or a gateway error (502 / 504) that did not come from the API itself (it has no JSON `error` code). */
export function isMaintenanceResponse(status: number, hasApiErrorCode: boolean): boolean {
  if (status === 503) return true;
  return (status === 502 || status === 504) && !hasApiErrorCode;
}
