/**
 * Whether a client-side (PUSH/REPLACE) navigation has happened yet this session. A fresh load of a URL and the
 * browser's Back/Forward buttons both report as `POP`, indistinguishable from `useNavigationType()` alone — but
 * only a real in-app "back" has a PUSH before it in this flag's lifetime. Set from `RootLayout` (routes.tsx),
 * read by `CatalogPage` to tell "fresh visit to /tests" (should auto-open the preferred job) apart from
 * "browser Back out of the preferred job's page" (should not re-trigger the same redirect it's escaping).
 */
let pushedThisSession = false;

export function hasPushedThisSession(): boolean {
  return pushedThisSession;
}

export function markPushNavigation(): void {
  pushedThisSession = true;
}

/** Test-only: module state otherwise leaks across test cases. */
export function resetPushedThisSession(): void {
  pushedThisSession = false;
}
