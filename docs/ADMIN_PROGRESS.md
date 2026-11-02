# Admin progress (apps/admin)

React 18 + Vite 8 + TypeScript (strict) + Tailwind 3 (`@jobprep/shared/tailwind-preset`) + react-router 6 + TanStack Query 5, in the new workspace `apps/admin`. Dev server on **5174**, `/api` proxied to the API (`ADMIN_API_URL`, default `http://localhost:4000`) so the `jp_admin` cookie (SameSite=Strict) is same-origin. Run: `npm run dev:admin`; build: `npm run build:admin`.

**Rule applied (owner):** nothing without an artboard in `docs/design/source`. A designed button whose dialog, result or API is not designed is drawn exactly as in the artboard and is inert (`aria-disabled="true"`, no handler: `InertButton` in `src/components/ui.tsx`). Everything is listed under "Missing designs" below.

## What was built (one responsive implementation per screen; desktop >= 900 px = sidebar chrome, below = phone header and bottom bar)

| Screen | Artboards | Route | Data |
|---|---|---|---|
| Sign-in | `SignIn`, `SignInPhone` (reuse, A1) | `/sign-in` | `POST /admin/auth/otp/request`, `POST /admin/auth/sign-in`, `GET /admin/auth/me`. Same copy and error states as the candidate sign-in; every number from the API (`expiresInSeconds` -> "It works for 5 minutes", `cooldownSeconds` -> resend countdown, `triesLeft`, `code_expired`, `too_many_attempts`, 429 `retryAfterSeconds`). After sign-in: `?next=` (same-site only) or the first page the role may use. |
| Overview | `AdminOverview`, `AdminOverviewPhone` | `/` | `GET /admin/overview?country=`: four KPIs, "Needs attention" (stuck payments -> `/payments?stuck=true`; reported questions -> `/exams`; top exam request -> `/exams`), the 14-day chart (`role="img"` with a summary built from the real numbers, a hidden data table for screen readers, a legend: colour is not the only cue), most-taken tests, latest payments. Desktop: country select (`?country=`), search box (Enter opens Users `?q=`, or Exams for an editor), "+ New mock test" inert. |
| Users | `AdminUsers`, `AdminUsersPhone`, `AdminUserPhone` | `/users`, `/users/:id` | `GET /admin/users?q=&filter=&page=`, `GET /admin/users/:id`. Search, five chips, paging (all in the query string). Desktop: list + the chosen user's panel. Phone: cards, then a page per user (Profile, Attempts with "attempt n" and percent, Payments with reference, Admin history). |
| Exams & questions | `AdminExams`, `AdminExamsPhone` | `/exams`, `/exams/:testId`, `/exams/:testId/q/:questionId` | `GET /admin/exams?q=&category=` (header totals, status badges, "N reported"), `GET /admin/mock-tests/:id`, `GET`/`PATCH /admin/questions/:id`, `GET /admin/catalog-options`. Opening a test opens its first reported question (else the first). Editor: question, options with the correct-answer radio, explanation, topic, difficulty, marks, case study (desktop), reported-by banner, "Last edited by ... · N attempts · X% answered correctly", previous/next. "Save draft" = `status: DRAFT`; "Publish change & resolve reports" = `status: PUBLISHED, resolveReports: true` (only for admins with `reports:resolve`). Only changed fields are sent. Multiple-select and case-based questions open read-only with no save buttons (A10). |
| Payments | `AdminPayments`, `AdminPaymentsPhone` | `/payments` | `GET /admin/payments?status=&stuck=&provider=&q=&page=`: four stat cards (two on phone), chips with the pending count, table (cards on phone), stuck rows highlighted, notes from data (waiting minutes, access until, decline / expiry reason). **"Check status" is wired** (`POST /admin/payments/:id/check`, then the list and the Overview are refreshed and the row shows "Now paid" / "Still pending" / "Now failed"). "Grant access manually" (stuck rows) inert. |
| Settings | `AdminSettings`, `AdminSettingsPhone` | `/settings`, `/settings/audit` (phone) | `GET`/`PUT /admin/settings`: stuck-after minutes (saved on Enter / leaving the box, 1-240), "Show explanations on free results", "Show pass marks" save as soon as they change (optimistic, put back on error). "Free samples without an account" shown on, not changeable. Plan card shows the live price and days from `GET /admin/countries/:code` (read-only), providers with their mode, admin team (`GET /admin/team`), audit list (`GET /admin/audit?pageSize=5`, the server's `summary` sentences with actor and time). Sections show only for the permission they need (`countries:read`, `admins:manage`, `audit:read`). |
| Countries | `AdminCountries`, `AdminCountriesPhone` | `/countries` | `GET /admin/countries`, `GET /admin/countries/:code`: cards with Live / Preparing / Planned chips, detail panel (status, currency, price, days, dial code, default language, payment methods and mode, languages with completion %, categories with test counts, notice, go-live checklist for countries that are not live). Phone: the cards and the "ready to launch?" checklist card. |
| Shell | all | | Sidebar with the admin's name and role (desktop), header with the ADMIN mark and bottom bar (phone), pending-payments count on Payments, skip link, `aria-current`. |

**Roles** follow `permissions[]` from `/admin/auth/me`, never the role name: System admin sees Overview, Users, Exams & questions, Payments, Countries, Settings; Content editor: Overview, Exams & questions; Support: Overview, Users, Payments. A URL the role cannot use goes to the first allowed page. A country-restricted admin sees only their countries in the Overview select. A 401 anywhere clears the cache and goes to `/sign-in?next=...`.

## Test results (2026-11-02)
| Command | Result |
|---|---|
| `npm run lint` | pass (all workspaces) |
| `npm run typecheck` | pass (all workspaces) |
| `npm test` (with `TEST_DATABASE_URL=...jobprep_admin_test`) | admin **119** + api 639 + web 255 + shared 2, all pass |
| `npm run build:admin` | pass (initial JS 82 KB gzip, each page lazy) |
| `npx playwright test e2e/admin` | **88 passed, 4 skipped** (desktop-only and phone-only cases), both projects, 3.2 min |

**Vitest (14 files in `apps/admin`):** API client (URL building, error mapping, 429 wait, network = status 0, 401 -> sign-in handler but not for `/auth/*`, 403/404 no redirect); permission -> navigation for the three roles (desktop and phone), direct-URL rules, first allowed page; filter <-> query-string sync (users, payments incl. `stuck`, exams, paging); status and badge mapping (payment / access / test / country / provider), payment notes, the ACCESS box, history sentences; money totals and date / phone formatting (Kigali time, "Today, 21:14", "Yesterday"); the chart summary and bar heights; the question-editor model (dirty state, which fields are sent, what each button sends, local checks, API error mapping, no raw codes); settings patch; Overview KPIs and alerts; country summaries; sign-in model (copied from the candidate model: `triesLeft`, expiry, lockout, 429); the admin chrome per role; the Users page (chip -> URL -> request, search -> URL, detail panel, inert actions, phone cards); the session guard (401 -> sign-in with `next`, forbidden page -> first allowed page, server error -> retry).

**Playwright (`e2e/admin-*.spec.ts`, both projects, desktop-1440 and phone-390):**
- `admin-signin`: system admin, content editor and support sign in through the UI with the code from `/api/test/otp`; wrong code says "4 tries left" then "3"; a number that is not an admin gets the same answer and has no code; invalid number; signed-out visit keeps `next`.
- `admin-roles`: each role sees only its navigation and is sent away from forbidden URLs; the API refuses what the navigation hides; name and role in the sidebar; keyboard-only navigation of the sidebar; an ended session goes to sign-in and back.
- `admin-overview`: numbers from the API (floors, the dev DB keeps moving), chart label, no "support requests" row, country select, search, inert "+ New mock test", editor's country select.
- `admin-users`: filters, search by phone, empty state, paging, filter from a link, detail (access, days left, payment reference, inert actions), roles.
- `admin-exams`: list, search, category; a guest reports a question through `POST /attempts/:id/reports`; "Save draft" hides it from candidates (checked through the public attempt API); "Publish change & resolve reports" shows the new text to candidates and closes the report; local checks and the API's `correct_not_an_option` inline; keyboard-only editing; previous / next; multiple-select read-only. The question is put back in `finally`.
- `admin-payments`: stat cards, chips, columns, a payment created as a candidate and settled with `POST /api/test/payments/:id/simulate {deliver:false}` is checked from the admin UI (Pending -> Paid); stuck filter from the Overview link (stuck-after set to 1 minute, restored in `finally`), stuck highlight, inert "Grant access manually".
- `admin-settings`: stuck minutes and both switches save and read back after reload, invalid value caught, everything restored and re-read; "free samples" locked; plan card, inert Save plan / Invite / role select; audit list; links.
- `admin-countries`: list, chips, summaries, Kenya's checklist (and Rwanda without), inert actions, roles.
- `admin-a11y`: axe (WCAG 2 A/AA) on all six screens, the user detail, the editor (editable and read-only) and the phone audit page, at both sizes; focus ring, target sizes, no sideways scroll at 390 and 360.

Admin sign-in codes are limited to **5 an hour and 45 s apart per phone**, so the specs share one session per role (kept in the OS temp folder, 12 hours; `e2e/admin-helpers.ts`) and wait out the cooldown. If a dev DB has used up the hour, delete `OtpCode` rows with purpose `ADMIN_SIGN_IN`.

Ports: admin API instance on 4001 (`PORT=4001 npm run start -w @jobprep/api`), Vite on 5174; both are `webServer` entries in `playwright.config.ts` (`reuseExistingServer: true`, entries only added). The admin specs call the API through the admin app's own origin (`http://localhost:5174/api`).

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
- **A1 Admin sign-in:** no artboard. The candidate sign-in is reused with the admin endpoints, the ADMIN mark and no other new element (deviation below). **Admin sign-out has no control** (no menu is drawn; the API route exists, `signOutAdmin` is not wired), nor a "session expired" state (the user is sent to the sign-in screen).
- **A2, A3, A4, A5:** user and payment action dialogs (above).
- **A6, A9, A10:** CSV import, mock-test form, question types and translations.
- **A7, A8:** category / section / topic editors, case-study editor (not reachable, no screen).
- **A11 Reports queue:** reports are reached through "Needs attention" -> Exams and the reported-by banner; there is no queue screen.
- **A12 Audit log screen:** only the short list on Settings (phone: one card behind the "Audit log" link).
- **A13, A14, A15, A16:** team dialogs, country actions, demand views ("Plan exam" goes to the Exams list, as drawn), exports.
- **A17 Restricted-role states:** no "no access" screen, no disabled buttons with explanations. A forbidden URL goes to the first allowed page; navigation items are removed, not disabled.
- **A18 Loading, empty, error, saving, unsaved-changes:** the plainest possible versions are used (grey bars, one line, an alert with "Try again"); there is no unsaved-changes warning in the editor.
- **Overview "support requests" row:** no data source (there is no support-request feature); omitted.
- **Phone Exams list** (the phone artboard draws only the editor page) and **phone previous / next arrows**: see deviations.

## Deviations from the artboards (to confirm)
1. **Sign-in:** candidate artboards reused; no nav, country chip, "Create account" links or "New to JobPrep?" / "create an account" lines; the country chip is a static "RW +250"; no back arrow on phone (nowhere to go back to). Not shown: the artboard's "10 minutes" and "15 minutes".
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
- The whole-suite `npx playwright test` was **not** run: the other agent's web server on 5173 was not up. Only the admin specs were run (with their own servers on 4001 and 5174).
- Unsaved edits are dropped silently when moving to another question or test (no design for the warning).
