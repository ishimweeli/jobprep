import { useSyncExternalStore } from 'react';

/** One-shot notice shown after an action that moves the user to another page ("You’re signed out. Sign in again"). */
export type NoticeKind = 'signed_out';

let current: NoticeKind | null = null;
const listeners = new Set<() => void>();

export function setNotice(next: NoticeKind | null): void {
  if (current === next) return;
  current = next;
  listeners.forEach((l) => l());
}

export function useNotice(): NoticeKind | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
