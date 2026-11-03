# Admin progress (apps/web/src/admin)

> **One app (owner decision, 2026-11-03; DECISIONS 88).** There is one backend and one frontend. The admin screens used to be a
> separate workspace (`apps/admin`, own sign-in, own `jp_admin` cookie, port 5174). They now live in the web app:
> **`apps/web/src/admin/**`**, mounted at **`/admin/*`** as a lazily loaded route subtree (`React.lazy` + `Suspense` in
> `apps/web/src/routes.tsx`; candidates never download it). `apps/admin` is deleted. Sign-in is the normal candidate sign-in
> (email + emailed code, the normal `jp_session` cookie); one account can hold several roles; `GET /api/admin/me` returns the
> roles, permissions and country scope. The screens, their look and their behaviour are unchanged. What changed is listed here
> and in MISSING_DESIGNS **E3**.
>
> - **Files:** `admin/AdminApp.tsx` (routes, guard wiring, admin-only document state), `admin/features/auth/session.tsx` (`RequireAdmin`, `RequirePermission`), `admin/features/auth/NoAccess.tsx`, `admin/api/client.ts` (a thin wrapper over the web API client, calling `/api/admin/*`), `admin/styles/admin.css` (the three admin-only base rules, scoped to `html.admin-area`). Everything else moved as it was (`features/*`, `components/`, `lib/`, `test/fixtures.tsx`).
> - **Routes:** `/admin` (Overview), `/admin/users`, `/admin/users/:id`, `/admin/exams`, `/admin/exams/:testId`, `/admin/exams/:testId/q/:questionId`, `/admin/payments`, `/admin/countries`, `/admin/settings`, `/admin/settings/audit`. An unknown `/admin/...` goes to the first page the roles allow.
> - **Guard:** every admin page needs `GET /api/admin/me`: 401 `admin_sign_in_required` goes to `/sign-in?next=<admin page>` (and back after sign-in); 401 `admin_session_stale` (last sign-in more than 12 hours ago) goes to `/sign-in?next=<admin page>&reason=admin_stale`, which stays open although a session exists and says "Please sign in again to use the admin area"; 403 `admin_forbidden` shows the no-access page ("You don't have access to the admin area", the web app's system-page layout, no chrome). The same two 401 rules apply to any admin data call mid-session (`onSignInRequired` in `admin/api/client.ts`, unit-tested); the web client's "session expired" takeover is not used for `/admin/*` calls.
> - **Chrome:** the admin shell (sidebar, or phone header and bottom bar) is the only chrome under `/admin`; the candidate header, tab bar and footer are never rendered there. The candidate account menu and Account tab have an "Admin" entry for accounts with a role (`user.roles.length > 0`).
> - **Roles:** `roles: [{code,label}]` and `permissions[]` from `/api/admin/me`. Navigation follows `permissions` (a person with two roles gets the union); the sidebar's role slot and the team list show every role label, comma-separated.
> - **Admin sign-out:** the normal `POST /api/auth/sign-out` (the candidate account menu); the admin chrome still has no sign-out control (no design, was A1).
>
> Sections below describe the screens and are still accurate unless they say otherwise. Where they mention the old admin sign-in, port 5174 for the admin app, `jp_admin`, `/admin/auth/*`, `apps/admin` or `npm run dev:admin` / `build:admin`, read this note instead. Run the admin area with the web app: `npm run dev -w @jobprep/web`, then open `/admin`.

**Rule applied (owner):** nothing without an artboard in `docs/design/source`. A designed button whose dialog, result or API is not designed is drawn exactly as in the artboard and is inert (`aria-disabled="true"`, no handler: `InertButton` in `src/components/ui.tsx`). Everything is listed under "Missing designs" below.

## What was built (one responsive implementation per screen; desktop >= 900 px = sidebar chrome, below = phone header and bottom bar)

| Screen | Artboards | Route | Data |
|---|---|---|---|
| ~~Sign-in~~ | (removed) | | The admin sign-in screen no longer exists: admin uses the normal candidate sign-in (`/sign-in`, email + emailed code, `/api/auth/otp/request` and `/api/auth/sign-in`) and returns to the admin page through `?next=`; then `GET /api/admin/me`. |
| Overview | `AdminOverview`, `AdminOverviewPhone` | `/admin` | `GET /admin/overview?country=`: four KPIs, "Needs attention" (stuck payments -> `/admin/payments?stuck=true`; reported questions -> `/admin/exams`; top exam request -> `/admin/exams`), the 14-day chart (`role="img"` with a summary built from the real numbers, a hidden data table for screen readers, a legend: colour is not the only cue), most-taken tests, latest payments. Desktop: country select (`?country=`), search box (Enter opens Users `?q=`, or Exams for an editor), "+ New mock test" inert. |
| Users | `AdminUsers`, `AdminUsersPhone`, `AdminUserPhone` | `/admin/users`, `/admin/users/:id` | `GET /admin/users?q=&filter=&page=`, `GET /admin/users/:id`. Search, five chips, paging (all in the query string). Desktop: list + the chosen user's panel. Phone: cards, then a page per user (Profile, Attempts with "attempt n" and percent, Payments with reference, Admin history). |
| Exams & questions | `AdminExams`, `AdminExamsPhone` | `/admin/exams`, `/admin/exams/:testId`, `/admin/exams/:testId/q/:questionId` | `GET /admin/exams?q=&category=` (header totals, status badges, "N reported"), `GET /admin/mock-tests/:id`, `GET`/`PATCH /admin/questions/:id`, `GET /admin/catalog-options`. Opening a test opens its first reported question (else the first). Editor: question, options with the correct-answer radio, explanation, topic, difficulty, marks, case study (desktop), reported-by banner, "Last edited by ... · N attempts · X% answered correctly", previous/next. "Save draft" = `status: DRAFT`; "Publish change & resolve reports" = `status: PUBLISHED, resolveReports: true` (only for admins with `reports:resolve`). Only changed fields are sent. Multiple-select and case-based questions open read-only with no save buttons (A10). |
| Payments | `AdminPayments`, `AdminPaymentsPhone` | `/admin/payments` | `GET /admin/payments?status=&stuck=&provider=&q=&page=`: four stat cards (two on phone), chips with the pending count, table (cards on phone), stuck rows highlighted, notes from data (waiting minutes, access until, decline / expiry reason). **"Check status" is wired** (`POST /admin/payments/:id/check`, then the list and the Overview are refreshed and the row shows "Now paid" / "Still pending" / "Now failed"). "Grant access manually" (stuck rows) inert. |
| Settings | `AdminSettings`, `AdminSettingsPhone` | `/admin/settings`, `/admin/settings/audit` (phone) | `GET`/`PUT /admin/settings`: stuck-after minutes (saved on Enter / leaving the box, 1-240), "Show explanations on free results", "Show pass marks" save as soon as they change (optimistic, put back on error). "Free samples without an account" shown on, not changeable. Plan card shows the live price and days from `GET /admin/countries/:code` (read-only), providers with their mode, admin team (`GET /admin/team`), audit list (`GET /admin/audit?pageSize=5`, the server's `summary` sentences with actor and time). Sections show only for the permission they need (`countries:read`, `admins:manage`, `audit:read`). |
| Countries | `AdminCountries`, `AdminCountriesPhone` | `/admin/countries` | `GET /admin/countries`, `GET /admin/countries/:code`: cards with Live / Preparing / Planned chips, detail panel (status, currency, price, days, dial code, default language, payment methods and mode, languages with completion %, categories with test counts, notice, go-live checklist for countries that are not live). Phone: the cards and the "ready to launch?" checklist card. |
| Shell | all | | Sidebar with the admin's name and role (desktop), header with the ADMIN mark and bottom bar (phone), pending-payments count on Payments, skip link, `aria-current`. |

**Roles** follow `permissions[]` from `/api/admin/me` (the union over the account's roles), never the role name: System admin sees Overview, Users, Exams & questions, Payments, Countries, Settings; Content editor: Overview, Exams & questions; Support: Overview, Users, Payments. A URL the role cannot use goes to the first allowed page. A country-restricted admin sees only their countries in the Overview select. A 401 anywhere clears the admin cache and goes to the normal `/sign-in?next=...` (see the guard above).

## Test results (2026-11-02)
| Command | Result |
|---|---|
| `npm run lint` | pass (all workspaces) |
| `npm run typecheck` | pass (all workspaces) |
| `npm test` (with `TEST_DATABASE_URL=...jobprep_admin_test`) | admin **119** + api 639 + web 255 + shared 2, all pass |
| `npm run build:admin` | pass (initial JS 82 KB gzip, each page lazy) |
| `npx playwright test e2e/admin` | **88 passed, 4 skipped** (desktop-only and phone-only cases), both projects, 3.2 min |

_The table above is the last run of the **separate** admin app (before the merge). After the merge (2026-11-03): `npm run typecheck -w @jobprep/web` and `npm run lint -w @jobprep/web` clean; `npm run test -w @jobprep/web` **373 passed** (the admin tests moved with the code: client, guard, shell, users page, permissions, models; the admin sign-in tests were deleted; new ones cover the guard's 401 / 403 handling, the stale session, the Admin menu entry, multi-role navigation and the route table); `npm run build -w @jobprep/web` passes and the admin code is only in lazy chunks (`AdminApp` 3.9 KB gzip, one chunk per page). Playwright was **not** run for the merge (the backend was being changed at the same time); the admin specs were rewritten for `/admin` and still have to be run._

**Vitest (14 files in `apps/web/src/admin`):** API client (URL building, error mapping, 429 wait, network = status 0, 401 -> sign-in handler but not for `/auth/*`, 403/404 no redirect); permission -> navigation for the three roles (desktop and phone), direct-URL rules, first allowed page; filter <-> query-string sync (users, payments incl. `stuck`, exams, paging); status and badge mapping (payment / access / test / country / provider), payment notes, the ACCESS box, history sentences; money totals and date / phone formatting (Kigali time, "Today, 21:14", "Yesterday"); the chart summary and bar heights; the question-editor model (dirty state, which fields are sent, what each button sends, local checks, API error mapping, no raw codes); settings patch; Overview KPIs and alerts; country summaries; sign-in model (copied from the candidate model: `triesLeft`, expiry, lockout, 429); the admin chrome per role; the Users page (chip -> URL -> request, search -> URL, detail panel, inert actions, phone cards); the session guard (401 -> sign-in with `next`, forbidden page -> first allowed page, server error -> retry).

**Playwright (`e2e/admin-*.spec.ts`, both projects, desktop-1440 and phone-390):** the specs now exercise `/admin` inside the web app (second web dev server on 5174, see Ports) and sign in through the normal sign-in.
- `admin-signin` (rewritten): signed-out `/admin` goes to the normal sign-in and returns to the Overview after the code; a deep link (`/admin/users?filter=expired`) returns to that page; the editor types the address in capitals; a candidate with no role has no Admin entry in the account menu and `/admin` shows the no-access page (no admin chrome); a multi-role account has the Admin entry and it opens `/admin`; a stale session (the API's `admin_session_stale`, stubbed) goes to the sign-in with the notice and comes back; invalid address.
- `admin-roles`: each role (system, editor, support, and the multi-role account: the union of editor + support) sees only its navigation and is sent away from forbidden URLs; the API refuses what the navigation hides; name and role(s) in the sidebar; keyboard-only navigation of the sidebar; an ended session goes to the normal sign-in and back.
- `admin-overview`: numbers from the API (floors, the dev DB keeps moving), chart label, no "support requests" row, country select, search, inert "+ New mock test", editor's country select.
- `admin-users`: filters, search by phone, empty state, paging, filter from a link, detail (access, days left, payment reference, inert actions), roles.
- `admin-exams`: list, search, category; a guest reports a question through `POST /attempts/:id/reports`; "Save draft" hides it from candidates (checked through the public attempt API); "Publish change & resolve reports" shows the new text to candidates and closes the report; local checks and the API's `correct_not_an_option` inline; keyboard-only editing; previous / next; multiple-select read-only. The question is put back in `finally`.
- `admin-payments`: stat cards, chips, columns, a payment created as a candidate and settled with `POST /api/test/payments/:id/simulate {deliver:false}` is checked from the admin UI (Pending -> Paid); stuck filter from the Overview link (stuck-after set to 1 minute, restored in `finally`), stuck highlight, inert "Grant access manually".
- `admin-settings`: stuck minutes and both switches save and read back after reload, invalid value caught, everything restored and re-read; "free samples" locked; plan card, inert Save plan / Invite / role select; audit list; links.
- `admin-countries`: list, chips, summaries, Kenya's checklist (and Rwanda without), inert actions, roles.
- `admin-a11y`: axe (WCAG 2 A/AA) on all six screens, the user detail, the editor (editable and read-only) and the phone audit page, at both sizes; focus ring, target sizes, no sideways scroll at 390 and 360.

*(Superseded by DECISIONS 88: admin sign-in is the normal sign-in, so the limit applies to purpose `SIGN_IN`; there are no `ADMIN_SIGN_IN` rows.)* Sign-in codes are limited (a wait between codes per email, and a cap an hour), so the specs share one session per role (kept in the OS temp folder; a cached session older than 12 hours is replaced, because admin calls refuse it; `e2e/admin-helpers.ts`) and wait out the cooldown. If a dev DB has used up the hour, delete the `OtpCode` rows of that email.

Ports (data isolation kept): a separate API instance on 4001 (`PORT=4001 npm run start -w @jobprep/api`; set `ADMIN_E2E_DATABASE_URL` to give it its own reseeded database such as `jobprep_admin_test`) and a **second instance of the web dev server** on 5174 whose Vite proxy targets 4001 (`WEB_PORT=5174 API_URL=http://localhost:4001 npm run dev -w @jobprep/web`, read by `apps/web/vite.config.ts`); both are `webServer` entries in `playwright.config.ts`. The candidate specs keep 4000 / 5173. The admin specs call the API through the page's own origin (`http://localhost:5174/api`).

## Browser pass
Every screen opened with the Playwright MCP browser at 1440x900 and 390x844, and at 360 for sideways scroll; console errors, failed requests and page errors checked (none); fixed along the way: HydrateFallback warning, the screen-reader chart table widening the page at 360, the detail panel not staying in view, switches saving a tick late, content hidden behind the phone bar (`scroll-padding-bottom`).

## Screenshots (`docs/screenshots/`)
`admin-{sign-in, overview, users, user, exams, exam-editor, payments, settings, countries}-{desktop,phone}.png`, `admin-sign-in-code-error-{desktop,phone}.png` (wrong code, "4 tries left"), `admin-audit-phone.png`. Phone pages are full-page captures, so the sticky bottom bar appears in the middle of them.

## Inert (drawn as in the artboard, does nothing) and the design each waits for
| Control | Where | Waits for |
|---|---|---|
| Grant / extend 30 days | user detail | **A2** dialog (country, days, required reason, summary, result) |
| Send login code | user detail | **A5** confirmation and result ("too soon, wait N s") |
| View as candidate | user detail | **A5** read-only candidate banner (also no API, DECISIONS #82) |
| Suspend account | user detail | **A3** suspend / un-suspend dialogs and the suspended state |
| Export CSV | Users | **A16** exports (no API either) |
| Grant access manually | Payments, stuck rows | **A4** dialog (transaction id, reason) |
| Export for accounting | Payments | **A16** |
| Import questions (CSV) | Exams | **A6** import flow |
| + New mock test | Overview, Exams | **A9** mock-test form |
| Save plan, price and days fields | Settings | **A14** (a price change needs a reason the design has no field for); fields are read-only |
| Invite, Invite admin, role selects | Settings | **A13** dialogs |
| Save country, Preview as candidate, + Add country, + Language, Copy structure from Rwanda, status / currency / price / days / prefix / language / notice fields, payment-method checkboxes | Countries | **A14** and A7 (no API for most); fields are read-only |
| "Free samples without an account" | Settings | not a missing design: a product rule, shown on and not changeable |
| Question editor for multiple-select and case-based questions | Exams | **A10** (read-only, no save buttons) |

## Missing designs (master list `docs/MISSING_DESIGNS.md`, section A) hit
- **A1 Admin sign-in:** gone. Admin uses the normal candidate sign-in (one app, MISSING_DESIGNS **E3**). **Admin sign-out has no control in the admin chrome** (no menu is drawn); sign-out is the candidate account menu's. The "session expired" case is the normal sign-in with the notice "Please sign in again to use the admin area" (E3).
- **A2, A3, A4, A5:** user and payment action dialogs (above).
- **A6, A9, A10:** CSV import, mock-test form, question types and translations.
- **A7, A8:** category / section / topic editors, case-study editor (not reachable, no screen).
- **A11 Reports queue:** reports are reached through "Needs attention" -> Exams and the reported-by banner; there is no queue screen.
- **A12 Audit log screen:** only the short list on Settings (phone: one card behind the "Audit log" link).
- **A13, A14, A15, A16:** team dialogs, country actions, demand views ("Plan exam" goes to the Exams list, as drawn), exports.
- **A17 Restricted-role states:** no designed "no access" screen for a role that lacks a page, no disabled buttons with explanations. A forbidden URL goes to the first allowed page; navigation items are removed, not disabled. (A person with no role at all gets the plain no-access page, E3.)
- **A18 Loading, empty, error, saving, unsaved-changes:** the plainest possible versions are used (grey bars, one line, an alert with "Try again"); there is no unsaved-changes warning in the editor.
- **Overview "support requests" row:** no data source (there is no support-request feature); omitted.
- **Phone Exams list** (the phone artboard draws only the editor page) and **phone previous / next arrows**: see deviations.

## Deviations from the artboards (to confirm)
1. **Sign-in:** none of its own any more: the candidate sign-in is used as it is (with its header, links and country chip), see E3.
2. **Overview search** opens the Users list with `?q=` (the Exams list for an editor); it has no results page of its own.
3. **Pagination controls** (Previous / Next) are added to Users and Payments (the artboards draw only "Page 1 of 528" as text, and the phone list has none); the owner's brief asked for paging.
4. **Phone Exams list:** the desktop list card is used inside the phone chrome ("Exams" header); opening a test opens the editor page, whose back arrow returns to the list (the artboard's goes to the Overview). Previous / next arrows are shown on the phone editor too (not drawn there); the phone editor omits "Case study" and "Last edited by", as drawn.
5. **Desktop user panel** also shows "Admin history" (only the phone page draws it) so that history is visible on both.
6. **Settings on phone** also shows the stuck-after box and "Show pass marks" (not drawn on the phone artboard) so every setting can be changed there; the "Audit log" link opens `/settings/audit` (the artboard links to the desktop Settings page that holds the list).
7. **Save feedback** (no design): a small green line "Saved as a draft." / "Published." under the editor, a hidden `role="status"` "Saved" on Settings, an error line when a setting could not be saved or the stuck-after value is outside 1-240, and a line under "Check status" ("Still pending", "Now paid", "Now failed").
8. **Needs attention** shows "Nothing needs attention right now." when empty; the Payments page's "Grant access manually" is drawn for stuck rows only, next to "Check status" (the artboard shows one or the other).
9. **Country cards on phone** are buttons (the artboard draws a fixed Kenya card) so any country's checklist can be opened; cards and the detail use the API's wording (checklist labels have no currency).
10. **Numbers the artboard fixes** come from data: price and providers from the countries API, "Waiting N min", "Access until", provider mode (Sandbox / Live / Off), the stuck threshold in the alert title; "callbacks healthy" and "SMS shows paid" are not shown (no data).
11. Provider rows keep the artboard's "Collections API" caption.
12. A hidden data table follows the chart for screen readers (not visible).

## API gaps
Appended to `docs/API_GAPS.md`, section "Admin": audit sentence for sign-ins reads "admin sign_in"; "reported questions" counts reports; the user detail has no tests-taken count; no plan / provider summary on the Payments list for Support; the country list has no provider names; settings need `settings:write` to be read; admin sign-in code limits; the checklist labels carry no currency; the category filter is by slug.

## Known gaps
- The whole-suite `npx playwright test` was **not** run after the merge into the web app (see the test table). Before it, only the admin specs had been run, with their own servers on 4001 and 5174.
- Unsaved edits are dropped silently when moving to another question or test (no design for the warning).
