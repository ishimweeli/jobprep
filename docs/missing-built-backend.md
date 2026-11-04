# Missing designs: what the backend already had and what was added

Audit of `docs/MISSING_DESIGNS.md` (C1 to C37, A2 to A18, the E3/E4/E5 undesigned items and the "new gaps") against the API.
"Already there" = built and tested before this pass. "Added" = new in this pass (contract in `docs/API_ADDITIONS.md`).
"Not needed" = frontend or copy only, no API work. Nothing here has a design: every added endpoint was built without one
and is listed so the designer can see it.

## Candidate (C)

| Item | Backend status |
|---|---|
| C1 practice runner | Already there: `POST /countries/:code/practice`, `/attempts/:id/practice`, `/attempts/:id/check` (untimed, DECISIONS 69) |
| C2 practice results | Already there: `GET /attempts/:id/result` with `attempt.kind = PRACTICE`, no comparison |
| C3 / C5 multiple-select, partly correct | Already there: `multiple`, `choose`, `partial` status and marks in state/review/result |
| C4 case passage in review | Already there: `GET /attempts/:id/review` returns `cases` with `questionNumbers` |
| C6 results edge states | Added: `result.edge` (`noneAnswered`, `perfect`, `noWeakAreas`, `allTopicsStrong`). `autoSubmitted`, `isGuest`, `canPractice` already existed |
| C7 / C8 time up, offline | Already there: submit counts, `timer`, late save refused (409 `attempt_closed`). Frontend only |
| C9 finished-attempt reopen | Added: `reopen` block on `GET /attempts/:id` (`canStartNew`) |
| C10 request this exam | Partly there (store). Added: de-duplication, `alreadyRequested`, admin demand list (A15) |
| C11 notify me when country opens | Partly there. Added: `alreadyOnList` (200 on repeat), `interest` field, admin waiting list (A15) |
| C12 / C13 sign-in, header menu | Already there (E4 password + Google; `GET /me`) |
| C14 account page, edit profile | Partly there (`PATCH /me` name, goal, language). Added: `level`, `subject`, `examDate` on `PATCH /me`; `POST /me/password`; `POST /me/email-change` + verify (E4 "no way to edit the email / password") |
| C15 change goal | Already there (`PATCH /me` `goalCategoryId`, `PATCH /me/onboarding`, `user.onboarding.nextStep` after a country switch) |
| C16 dashboard states | Already there (Batch 1). Fixed: recommended/start-here tests now respect level and subject; added `GET /me/recommended-tests` |
| C17 guest taps a paid test | Not needed (frontend; checkout already needs an account) |
| C18 save my result | Added: `claim-attempts` outcome states (`saved`, `already_saved`, `nothing_to_save`, `attemptIds`) |
| C19 checkout desktop | Not needed (frontend) |
| C20 checkout edge states | Already there (`checkout_unavailable`, `provider_error`, `POST /payments/:id/check`, `newAccessEndsAt`, late success) |
| C21 payment history and receipts | Added: `GET /me/payments`, `GET /me/payments/:id` (receipt). "Check payment" is the existing `POST /payments/:id/check` |
| C22 language switcher | Partly there (`PATCH /me` language, country `languages`). Added: `?lang=` overlay of translations on attempt state/review with `language.translatedQuestions/totalQuestions` |
| C23 country gate / wrong country | Partly there. Added: `country_mismatch` now names the requested country, the user's country and the test |
| C24 Kenya desktop, KES, price not set | Not needed (data-driven already: `priceLabel`, `checkoutAvailable`, `disclaimer`) |
| C25 legal and help pages | Added: `GET /legal`, `GET /legal/:page` (placeholder text clearly flagged, last-updated date, per-country override), admin `PUT /admin/legal/:page` |
| C26 404 / error / maintenance / session expired | Request id already there (`requestId`, `X-Request-Id`, DECISIONS 72). Added: `GET /status` (maintenance flag, admin-settable). 404 and session-expired are frontend (401 `unauthorized`) |
| C27 SMS copy | Not needed (emails now; copy only) |
| C28 error catalogue | Not needed (copy; every code is stable) |
| C29 phone navigation | Not needed (frontend) |
| C30 unlocked details, review last attempt | Added: `previousAttempts` limited to FULL attempts + `attemptStats` (count, best, last) (API_GAPS 13: the practice/mock separation bug) |
| C31 catalog pagination | Partly there (`page`, `pageSize`, `total`). Added: `hasMore`, `nextPage`, `totalPages` |
| C32 catalog filters and sort | Partly there. Added: multi-value `difficulty`, `language`, `subject` (comma lists), `sort=free_first` (API_GAPS 2) |
| C33 landing language toggle | Not needed (country `languages` already returned) |
| C34 "Detected from your connection" | Not built: needs IP geolocation, and the design should drop the line |
| C35 switch-country note about the goal | Added: `clearsGoal`, `currentGoal` on `GET /me/country-change` |
| C36 support contact | Added: `supportContact` on `GET /countries/:code`, `GET /countries/:code/support`; set by an admin per country, env fallback |
| C37 interim multi-select | Not needed (behaviour only) |
| New gap: request id on errors | Already there (DECISIONS 72) |
| New gap: country gate "What are you preparing for?" storage | Added (`interest` on the waiting list) |
| New gap: wrong-country page names the test | Added (`country_mismatch.test`) |
| New gap: review last attempt / best score need practice/mock separation | Added (see C30) |
| E4 guest attempts not claimed via Google | Already there: `POST /me/claim-attempts` after the callback; now with outcome states |
| E4 "Not listed? Tell us your country" | Not built: no design, no screen, no store (listed under "not built") |
| E3 / E4 maintenance, suspended etc. | Already there |

## Admin (A)

| Item | Backend status |
|---|---|
| A2 grant / extend access | Already there: `POST /admin/users/:id/access`. Added: `GET /admin/users/:id/access-preview` ("Access will run until") |
| A3 suspend / un-suspend | Already there (reason required, audited, signs the person out) |
| A4 manual grant, check payment, detail, stuck | Already there (`/payments/:id`, `/check`, `/manual-grant`, `stuck` filter). Added: `stuck`, `waitingMinutes`, `canCheck`, `canManualGrant`, `ageMinutes` on the detail |
| A5 send login code, view as candidate | "Send password reset" already there (`POST /users/:id/send-password-reset`). Added: `GET /admin/users/:id/candidate-view` (read-only data, audited, no session switch) |
| A6 CSV import | Partly there (dry run, problem list, all-or-nothing or valid rows). Added: `columnMap`, `headers`, `missingColumns`, `preview`, `errorCsv`, `GET /admin/import-template` |
| A7 category / section / topic editors | Already there (CRUD with in-use guards). Added: reorder for categories and sections, `usedBy` counts in the 409s. Topics have no order (sorted by name): reorder not built |
| A8 case study editor | Partly there (CRUD, `caseId` on questions). Added: `GET /mock-tests/:id/cases`, attached questions, attach/detach, translations (CaseTranslation) |
| A9 mock test form and publishing | Partly there (create, edit, publish, archive). Added: checklist, unpublish (with consequences and reason), restore, duplicate, exam/profession/authority/attemptCount on the detail |
| A10 question editor, translations | Partly there (all three types, partial credit, choose, marks). Added: question translations with completeness, reorder |
| A11 reports queue | Partly there (list, resolve, dismiss). Added: grouped view (count, latest message), reason on dismiss/resolve (`resolutionNote`), close all of a question, reporter |
| A12 audit log | Partly there (list with filters). Added: entry detail, export CSV, filter options, `q` search |
| A13 team invite / edit | Already there. Added: `lastActiveAt` |
| A14 country actions | Already there (go-live with checklist and force, price with reason, payment mode, back to preparing). Added: provider status without secrets, `status-impact`, support contact, legal text |
| A15 demand views | Added: exam requests grouped by search, mark done/notify, waiting list per country, export, notify |
| A16 exports | Added: `GET /admin/payments/export` (CSV; date range, country, status, provider) and audit/waiting-list exports |
| A17 restricted-role states | Already there (`GET /admin/me` permissions and scope, 403 `admin_forbidden`, 404 outside scope). Added: `GET /admin/country-options` for scoped filters |
| A18 loading / empty / error states | Not needed (frontend) |
| Overview "support requests" count | Not built: there is no support-request feature or data to count |

## Built without a design (for the designer)
Receipt content, payment history rows, the legal page structure and placeholder text, the maintenance message, the support-contact block,
password change, email change, the grouped reports view, the audit detail, the demand lists, the waiting-list "notify" email, the
exam-request "done" email, the candidate-view payload. Each is data only; layouts are the frontend's plainest version.

## Also closed from docs/API_GAPS.md in this pass
- Gap 2 (multi-value filters, `sort=free_first`), gap 3 (support contact), gap 13 (practice sets mixed into previous attempts, best score), gap 14 (`choose` on review items), gap 15 (`country_mismatch` names the test), gap 16 (waiting-list `interest`), gap 17 (`pendingPayment.msisdn`, `createdAt`).
- Still open there: gaps 1, 5 to 12 and 18 (no API work asked for, or no data: "approved but not confirmed yet", operator mismatch).

## Test coverage added
`test/integration/missing-candidate.test.ts` (30 tests) and `test/integration/missing-admin.test.ts` (36 tests), plus 33 new rows in the permission matrix of `admin-permissions.test.ts` (every new admin route as every role). Existing tests changed because behaviour changed on purpose: waiting list repeat is 200, dismissing a report needs a reason, a missing-columns CSV answer carries the headers, the settings read includes `maintenance`.
