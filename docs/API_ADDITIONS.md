# API additions for the missing-designs batch

Contract for the endpoints **added or changed** by the backend pass that built everything listed in `docs/MISSING_DESIGNS.md`
(C-list, A-list). Which item each one serves is in `docs/missing-built-backend.md`. Everything else in the API is unchanged.

Conventions (as before): JSON in and out; errors are `{ "error": "<code>", "requestId": "<8 hex>", ...extras }` (also the
`X-Request-Id` header); validation errors are 400 `validation_error` with `issues[]`. Candidate routes use the `jp_session`
cookie. **Admin routes** (`/api/admin/*`) need an active role, a sign-in no older than 12 h (401 `admin_session_stale`), and for
non-GET an `Origin` equal to the web origin. Country-scoped admins get 404 (not 403) for anything outside their countries.
Permissions named below are the existing ones (`exams:read`, `exams:write`, `reports:resolve`, `payments:read`, `countries:read`,
`countries:write`, `settings:write`, `audit:read`, `admins:manage`, `users:read`, `users:manage`). **No new permission was added**
(roles are rows in the database; a new permission string would need a data update), so the role table is unchanged:
System admin everything; Content editor exams/questions/reports; Support users/payments read.
Every state-changing admin route writes an audit row in the same transaction; "reason" means a string of 5 to 300 characters.
Dates are ISO 8601 UTC strings.

---

## Candidate and public

### GET `/api/countries/:code/mock-tests` (changed: pagination, multi filters, sort)
Query: `q`, `category` (slug), `price=free|paid`, `difficulty` (**comma list**, `FOUNDATION,STANDARD`), `language` (**comma list**, `en,rw`),
`subject` (**comma list** of topic slugs), `sort=recommended|recent|title|free_first` (new: `free_first` = free tests first, then title;
`recommended` is unchanged: category order, free first, title), `page` (1-based), `pageSize` (1 to 50, default 20).
Response adds: `hasMore` (bool), `nextPage` (number or null), `totalPages`. Existing fields (`total`, `page`, `pageSize`, `results`, `empty`,
`canRequestExam`, `facets`) unchanged. Single values still work. Use `page`+`hasMore` for "Load more".

### GET `/api/countries/:code/mock-tests/:slug` (changed: practice separated, best score)
`previousAttempts` now lists **FULL attempts only** (each row gains `kind: "FULL"`), newest first, up to 5. New `attemptStats`:
`{ count, bestPercent|null, last: { id, percent, submittedAt } | null }` (counts every finished FULL attempt of this test by the signed-in
user; `count` 0 and `last` null for guests). Use it for "Attempts: 2 · best 58%" and "Review last attempt · 58%" (`last.id` is the attempt id to review).

### 403 `country_mismatch` (changed: says what the link was)
Body now also has `requestedCountry: { code, name }`, `userCountry: { code, name }` and, on test routes, `test: { slug, title } | null`
(title is null if the slug does not exist). Applies to the catalog routes under `/api/countries/:code/*` and to starting an attempt.

### POST `/api/countries/:code/exam-requests` (changed: de-duplicated)
Body `{ query, email? }` (email defaults to the signed-in user's). Live countries only (as before). The same email address asking for the
same search (case and spacing ignored) twice is stored once; a request without an address is always stored (each counts as a person).
Response 201 `{ ok: true, alreadyRequested: false, requestCount }` or 200 `{ ok: true, alreadyRequested: true, requestCount }`.
`requestCount` = how many people asked for this search in this country (do not show it unless you want to).

### POST `/api/countries/:code/waiting-list` (changed: "already on the list", interest)
Body `{ email?, interest? }` (`email` may be left out when signed in; `interest` is the optional "What are you preparing for?", max 120 chars).
201 `{ ok: true, alreadyOnList: false }`, or **200** `{ ok: true, alreadyOnList: true }` for an address already listed for that country
(the interest is updated if one is sent). Errors as before: 404 `country_not_found`, 400 `country_already_live`, 400 validation (`email`).

### GET `/api/countries/:code` (changed) and GET `/api/countries/:code/support` (new)
`GET /api/countries/:code` gains `supportContact` (below). `GET /api/countries/:code/support` returns `{ supportContact }` (any country, public).
`supportContact = { phone: string|null, whatsapp: string|null, email: string|null, hours: string|null, people: {name,phone}[], configured: boolean, placeholder: boolean }`. `people` comes only from the `support.contact:<CC>` setting; an admin's PATCH leaves it unchanged.
`configured` false = nothing set for that country: hide the block. `placeholder` true = dev placeholder values (never shown in production data).
Values come from the admin (PATCH `/api/admin/countries/:code`, field `supportContact`), else from the env fallback `SUPPORT_PHONE|WHATSAPP|EMAIL|HOURS`.

### GET `/api/legal` and GET `/api/legal/:page` (new, public)
`:page` is `terms | privacy | refund | cookies`. Query `country=RW` (optional; picks the country's own text when an admin entered one, else the generic text).
`GET /api/legal` -> `{ pages: [{ slug, title, lastUpdated, placeholder }] }`.
`GET /api/legal/:page` -> `{ slug, title, lastUpdated, placeholder: boolean, intro, sections: [{ id, heading, paragraphs: string[] }],
country: { code, name, disclaimer } | null }`. **While `placeholder` is true the text is a placeholder** written by engineering, not legal text:
show the page with a clearly visible note ("Placeholder text, pending legal review"). The table of contents is `sections[].id/heading`.
404 `legal_page_not_found`, 404 `country_not_found`.

### GET `/api/status` (new, public)
`{ ok: true, maintenance: { enabled: boolean, message: string|null, backAt: string|null } }`. The web app can show the maintenance page when `enabled`.
The API itself keeps answering (maintenance is a banner/page switch, not a block). Set by an admin in Settings (below).

### GET `/api/me/recommended-tests` (new) and the dashboard (fixed: level and subject)
`GET /api/me/recommended-tests?limit=3` -> `{ basis: { goal: {id,name}|null, level: string|null, subject: string|null },
tests: [{ slug, title, isFree, durationMinutes, questionCount, matchedSubject: bool, matchedLevel: bool, reason: 'subject_level'|'subject'|'level'|'goal' }] }`.
Tests in the goal category (the featured category when there is no goal) that match the person's **subject** and **level** come first
(text match on title, profession and topic names; the code in brackets of a level, "S4–S6", ranks above the word "Secondary"), tests already completed come last, free before paid on a tie. Nothing is hidden: it only ranks.
`GET /api/me/dashboard` uses the same ranking for `startHere` and `suggestedTests` (both fields keep their old shape). The dashboard's `pendingPayment` also gains `msisdn` and `createdAt` (API_GAPS 17), and the review items gain `choose` (API_GAPS 14, "Choose N" as the exam showed it).

### PATCH `/api/me` (changed: more fields)
Body (any subset): `name`, `goalCategoryId` (null clears), `language` (must be one of the country's languages, else 400 `language_not_available`),
**`level`**, **`subject`** (string 1 to 80 or null), **`examDate`** (`YYYY-MM-DD` or null). Returns `{ user }` (the same `user` object as GET `/api/me`).
Errors: 400 `invalid_goal` (not a category of the user's country).

### POST `/api/me/password` (new)
Body `{ currentPassword?, newPassword }` (8 to 128 chars). `currentPassword` is required when the account already has a password;
a Google-only account (no password yet) may leave it out and so sets its first password. Other sessions of the person are signed out; this one stays.
200 `{ ok: true }`. Errors: 400 `invalid_current_password`, 400 `current_password_required`, 429 `too_many_attempts` (+ `retryAfterSeconds`; wrong current passwords count towards the same 5-in-a-row lock as sign-in), validation errors for the new password.

### POST `/api/me/email-change` and POST `/api/me/email-change/verify` (new)
Step 1 `POST /api/me/email-change` body `{ email, password? }` (`password` = current password, required when the account has one):
emails a 6-digit code to the **new** address (same limits as verification codes: 45 s apart, 5 an hour). 200 `{ ok: true, cooldownSeconds, expiresInSeconds }`.
Step 2 `POST /api/me/email-change/verify` body `{ email, code }`: on success the account's email changes and is marked verified; 200 `{ user }`.
Errors: 409 `email_taken`, 400 `invalid_email`/validation, 400 `invalid_code` (+`triesLeft`), 400 `code_expired`, 400 `too_many_attempts`, 429 `otp_cooldown`/`otp_hourly_limit` (+`retryAfterSeconds`), 400 `invalid_current_password`, 400 `same_email`.

### GET `/api/me/country-change?to=KE` (changed)
Adds `clearsGoal: boolean` (true when the person has a goal that the switch would clear), `currentGoal: { id, name } | null`,
`goalWillBeAskedAgain: true`. Rest unchanged.

### GET `/api/me/payments` and GET `/api/me/payments/:id` (new): payment history and receipt
`GET /api/me/payments?page=1&pageSize=20` -> `{ total, page, pageSize, hasMore, payments: [row] }`, newest first, only the signed-in user's own.
`row = { id, createdAt, status: PENDING|SUCCESSFUL|DECLINED|FAILED|EXPIRED, providerLabel, priceLabel, amountMinor, currencyCode, countryCode, transactionId|null, accessUntil|null, canCheck: boolean }`.
`canCheck` is true for PENDING (and recently EXPIRED): call the existing `POST /api/payments/:id/check` ("Check payment").
`GET /api/me/payments/:id` -> `{ payment: <the same object as GET /api/payments/:id>, receipt: { number, issuedTo: { name, email }, country: { code, name }, plan: { name, durationDays }, paidAt|null, accessStartsAt|null, accessEndsAt|null } | null }`.
`receipt` is null unless the payment is SUCCESSFUL; `receipt.number` is the transaction id, else the provider reference, else `JP-<id prefix>`. This GET does **not** ask the operator (no polling). 404 `payment_not_found` for someone else's payment.

### POST `/api/me/claim-attempts` (changed: outcome states for "Save my result")
Body unchanged `{ guestTokens: [..] }`. Response:
`{ claimed, alreadyYours, otherCountry, belongsToSomeoneElse, unknown, attemptIds: string[], outcome: 'saved' | 'already_saved' | 'nothing_to_save' }`.
`outcome`: `saved` = at least one attempt moved to the account (`attemptIds` = those); `already_saved` = nothing new but the attempt is already on this account;
`nothing_to_save` = the token matched nothing claimable (unknown token, someone else's attempt, or another country: neutral message, no error tone).
Sign-in and verify-email responses keep `claimedAttempts` (a number).

### GET `/api/attempts/:id` (changed) and review/state language
**Finished attempt reopened (C9):** the state gains `reopen` (null while the attempt runs): `{ ended: true, autoSubmitted, canStartNew: boolean, startNewReason: string|null, mockTestSlug, countryCode }`.
`canStartNew` is false for practice sets and when the test needs Full Access the viewer does not have (`startNewReason: 'needs_full_access' | 'practice'`).
**Translations:** `GET /api/attempts/:id?lang=rw` and `GET /api/attempts/:id/review?lang=rw` overlay the Kinyarwanda/Kiswahili text of the stem, options and explanation
(questions and case studies without a translation stay in English). When `lang` is sent, both responses gain `language: { requested, served: 'en'|'rw'|'sw', translatedQuestions, totalQuestions }` (absent without `lang`; in the review, `totalQuestions` counts the questions of the current filter).
When `translatedQuestions < totalQuestions` show the note "This test is available in English only" (or "partly translated"). Without `lang`, nothing changes.

### GET `/api/attempts/:id/result` (changed: edge states)
Adds `edge: { noneAnswered: boolean, perfect: boolean, noWeakAreas: boolean, allTopicsStrong: boolean }`
(`noWeakAreas` is true when the attempt has topic results and none is below 60%; the existing `canPractice` is its inverse for the button).
`attempt.kind`, `attempt.autoSubmitted` and `isGuest` already existed.

---

## Admin: governance, content and support

### GET `/api/admin/country-options` (new, any admin)
`{ countries: [{ code, name, status }] }`: only the countries the admin may see (their scope), for the country filters in every admin screen.
Works for Content editor and Support (who lack `countries:read`).

### Reports queue

**GET `/api/admin/reports`** (`exams:read`, changed). Query: `status=OPEN|RESOLVED|DISMISSED` (default OPEN), `country`, `page`, `pageSize`,
**`group=question`** (new). Without `group` the shape is as before, each row gains `reporter: { name, email } | null` and `resolutionNote`.
With `group=question` the list is one row per reported question: `{ total, page, status, results: [{ question: { id, number, stem }, mockTest: { id, title, countryCode }, count, latestMessage, latestAt, messages: [{ id, message, createdAt }] (newest 5) }] }`, most reports first.
**POST `/api/admin/reports/:id/resolve`** and **`/dismiss`** (`reports:resolve`, changed): body `{ reason }`. `reason` is **required for dismiss** (400 `reason_required`) and optional for resolve; it is stored on the report as `resolutionNote` and in the audit row. 409 `report_already_closed` as before.
**POST `/api/admin/questions/:id/reports/close`** (`reports:resolve`, new): body `{ status: 'RESOLVED'|'DISMISSED', reason }` closes **all** open reports of one question (the grouped queue's "Dismiss all" / "Resolve all"). `reason` required for DISMISSED. 200 `{ ok: true, closed: n }`; 404 `question_not_found`.
"Publish change & resolve reports" is the existing `PATCH /api/admin/questions/:id` with `resolveReports: true`.

### Mock test lifecycle

**GET `/api/admin/mock-tests/:id/checklist`** (`exams:read`, new) -> `{ canPublish: boolean, items: [{ key, label, ok, blocking, detail? }] }` with keys `hasQuestions` (blocking: at least one published question), `title` (blocking), `freeSample` (not blocking: the category has a published free test, or this test is free; a paid test in a category with no free sample publishes with a warning), `instructions` (not blocking: at least one instruction line), `translations` (not blocking: detail lists missing translation counts per language).
**POST `/api/admin/mock-tests/:id/publish`** (changed): same blocking rule as before (409 `publish_blocked` + `problems[]`), response gains `warnings: string[]` (keys of non-blocking items that are not ok) and `checklist`. Re-publishing an archived test is not allowed (409 `archived`: restore it first).
**POST `/api/admin/mock-tests/:id/unpublish`** (`exams:write`, new): body `{ reason }` (required). PUBLISHED -> DRAFT. Candidates stop seeing it; attempts in progress keep running; history is kept. 200 `{ ok, status: 'DRAFT', consequences: { attemptsInProgress, attemptsFinished } }`. 409 `not_published`. Audit `mock_test.unpublish`.
**GET `/api/admin/mock-tests/:id/consequences`** (`exams:read`, new) -> `{ attemptsInProgress, attemptsFinished, status }` to show "what unpublishing does" before the confirm.
**POST `/api/admin/mock-tests/:id/restore`** (`exams:write`, new): ARCHIVED -> DRAFT. 409 `not_archived`.
**POST `/api/admin/mock-tests/:id/duplicate`** (`exams:write`, new): body `{ title? }` (default "<title> (copy)"). Copies the test (as DRAFT), its sections, case studies and **non-archived** questions (as DRAFT, with translations). 201 `{ id, slug, status: 'DRAFT', questions }`. Audit `mock_test.duplicate`.
**GET `/api/admin/mock-tests/:id`** (changed): `mockTest` gains `exam: { id, name }`, `profession: { id, name }`, `authority: { id, shortName, name } | null`, `attemptCount`; `cases` rows are unchanged (`{ id, title }`; use the list below for counts).
**GET `/api/admin/mock-tests/:id/cases`** (`exams:read`, new) -> `{ cases: [{ id, title, questions, translations: ['rw'] }] }`.

### Question editor: reorder, translations
**POST `/api/admin/mock-tests/:id/questions/reorder`** (`exams:write`): body `{ ids: [questionId, ...] }` (every non-archived question of the test, exactly once). 200 `{ ok }`; 400 `ids_mismatch`.
**GET `/api/admin/questions/:id`** (changed): `question` gains `translations: [{ language, stem, optionTexts: {A: ".."}, explanation }]` and `translationStatus: [{ language, state: 'complete'|'partial'|'missing' }]` for the test's non-first languages (`complete` = stem, explanation and every option translated).
**PUT `/api/admin/questions/:id/translations/:lang`** (`exams:write`, `:lang` = `rw|sw|en` and one of the test's languages): body `{ stem, optionTexts: { A, B, ... }, explanation }` (option keys must be exactly the question's). 200 `{ ok, state }`. Bumps the question `version`. 400 `language_not_in_test`, 400 `option_keys_mismatch`. **DELETE** same path removes it.
Candidates see translations via `?lang=` on the attempt state/review (above).

### Case studies
**GET `/api/admin/cases/:id`** (changed): `case` gains `translations: [{ language, title, passage, tables, notes }]` and `attachedQuestions: [{ id, number, stem }]` (number = position in the test).
**PUT `/api/admin/cases/:id/translations/:lang`** (`exams:write`): body `{ title, passage: string[], tables: [..same shape..], notes: string[] }`. **DELETE** removes. 400 `language_not_in_test`.
**POST `/api/admin/cases/:id/attach`** (`exams:write`): body `{ questionIds: [..] }` attaches non-archived single-choice questions of the same test to this case (they become CASE_BASED); 400 `question_not_in_test`, 400 `exactly_one_correct_answer` for multiple-select questions (a case question must be single-answer). `POST .../detach` same body removes the link (they become SINGLE_CHOICE again).

### Categories, sections, topics: reorder and "used by N"
**POST `/api/admin/categories/reorder`** (`exams:write`): body `{ countryCode, ids: [..] }` (all categories of that country, once each). 400 `ids_mismatch`.
**POST `/api/admin/mock-tests/:id/sections/reorder`**: body `{ ids: [..] }` (all sections of the test). 400 `ids_mismatch`.
**Delete guards now say how many:** the 409s `category_in_use`, `section_in_use`, `topic_in_use`, `case_in_use` carry `usedBy: { mockTests?, topics?, professions?, users?, questions? }` (only the counts that apply). `GET /api/admin/topics` rows already have `questions`; `GET /api/admin/categories` rows have `mockTests`, `topics`, `professions`.

### CSV import (changed: mapping, preview, error file, template)
**POST `/api/admin/mock-tests/:id/import`** body gains `columnMap?: { section?, topic?, stem?, option_a?, ... option_f?, correct?, explanation?, marks?, difficulty?, scoring?, choose? }`
(logical column -> the header text in the uploaded file; unmapped columns keep their own name, case-insensitive). Response (dry run, success, and the 409s) gains:
`headers: string[]` (the file's header row), `missingColumns: string[]`, `preview: [{ row, section, topic, stem, options, correct }]` (first 5 valid rows), `errorCsv: string` (CSV text of the rows that had problems, with a final `problems` column; empty string when none; the web app offers it as a download).
A file with columns missing is still 400 `missing_columns:<list>` but the body now also has `headers` and `missingColumns` so the mapping step can ask. Problem codes in `problems[].problem`: `missing_section`, `unknown_section:<x>`, `missing_topic`, `unknown_topic:<x>`, `missing_stem`, `explanation_too_short`, `needs_at_least_two_options`, `options_must_be_consecutive_from_A`, `missing_correct`, `correct_not_an_option:<k>`, `invalid_marks`, `invalid_difficulty:<x>`, `invalid_scoring`, `invalid_choose`, `duplicate_question`.
**GET `/api/admin/import-template`** (`exams:read`, new) -> `{ columns: [{ name, required, help }], csv: "<header + one example row>" }`.

### Audit log
**GET `/api/admin/audit`** (`audit:read`, changed): extra filter `q` (matches the action, the reason and the actor's name, case-insensitive). Rows are as before.
**GET `/api/admin/audit/filters`** (new) -> `{ actions: [..], entityTypes: [..], actors: [{ id, name }] }` (what exists in the log, for the filter dropdowns).
**GET `/api/admin/audit/:id`** (new) -> `{ entry: { id, at, actor: {id,name,email}|null, action, entityType, entityId, countryCode, reason, metadata, summary } }`. `metadata` carries the before/after values (e.g. `from`/`to`). 404 `audit_entry_not_found`.
**GET `/api/admin/audit/export`** (new): same filters as the list (without paging), `text/csv` attachment, at most 5,000 newest rows, columns `time,actor,action,entityType,entityId,country,reason,summary`. Writes an `audit.export` row. Declared before `/:id`, so `export` is not an id.

### Team
**GET `/api/admin/team`** (changed): each row gains `lastActiveAt` (the person's last seen time or null). Invite/role change/deactivate are the existing `POST /api/admin/team` and `PATCH /api/admin/team/:id` (unchanged; invite sends no email, the person signs in with that address).

### Countries
**GET `/api/admin/countries/:code`** (changed): `paymentMethods[]` rows gain `providerStatus: { adapter: 'pawapay'|'direct'|'fake', credentialsConfigured: boolean, callbackUrl: string, lastPaymentAt|null, lastSuccessAt|null }`
(`callbackUrl` is the webhook URL **without** its secret token; no secret or key is ever returned). The response also gains `supportContact` and `legal: { reviewed: boolean, pages: [{ slug, overridden }] }`.
**PATCH `/api/admin/countries/:code`** (`countries:write`, changed): accepts `supportContact: { phone?, whatsapp?, email?, hours? }` (strings or null; max 80 chars; email must look like one). Audit `country.support.set`. Nothing else changed: go-live is `{ status: 'LIVE', reason, force? }` (409 `go_live_blocked` + `checklist` when the list is not complete), moving back is `{ status: 'PREPARING', reason }`, price is `PATCH .../plan` `{ priceMinor, durationDays?, reason }`.
**GET `/api/admin/countries/:code/status-impact?to=PREPARING`** (`countries:read`, new) -> `{ from, to, users, activeAccessGrants, attemptsInProgress, publishedTests, checklist, readyToLaunch }`, the numbers for the confirmation dialog.
**PUT `/api/admin/legal/:page`** (`settings:write`, new): body `{ countryCode?, title?, lastUpdated?, intro?, sections: [{ id?, heading, paragraphs: string[] }] }` saves real text (placeholder flag off) for all countries or one; **DELETE** same path (query `country=`) removes the override. **GET `/api/admin/legal`** lists `{ pages: [{ slug, title, overrides: [country codes or '*'] }] }`. Audit `legal.update` / `legal.reset`.
**GET/PUT `/api/admin/settings`** (changed): also `maintenance: { enabled: boolean, message: string|null, backAt: string|null }` (PUT any subset; audit `settings.update`).

### Demand: exam requests and waiting list
Permission: exam requests read `exams:read`, write `exams:write`; waiting list `countries:read` / `countries:write`. Country scope applies.
**GET `/api/admin/demand/exam-requests`** query `status=open|done` (default open), `country`, `q`, `page`, `pageSize`
-> `{ total, page, results: [{ key, query, countryCode, count, withEmail, firstAt, lastAt, status: 'OPEN'|'DONE', doneAt, doneNote, doneBy }] }` grouped by search (case and spacing ignored; `query` is the most common spelling), most requested first.
**POST `/api/admin/demand/exam-requests/done`** (`exams:write`): body `{ countryCode, query, reason?, notify?: boolean, mockTestId? }`. Marks every open request of that search done. With `notify: true` emails each requester who left an address ("the test you asked for was added"; at most 500 per call) and says how many went out. 200 `{ ok, marked, notified }`. Audit `demand.exam_request.done`. 404 `request_not_found`.
**GET `/api/admin/demand/waiting-list`** query `country` (required for `entries`), `page`, `pageSize` -> `{ countries: [{ code, name, status, count, notified }], total, entries: [{ id, email, interest, createdAt, notifiedAt }] }` (`entries` only when `country` is given).
**GET `/api/admin/demand/waiting-list/export?country=KE`** (`countries:read`): `text/csv` (`email,interest,joined,notified`), audit `export.waiting_list`.
**POST `/api/admin/demand/waiting-list/notify`** (`countries:write`): body `{ countryCode, reason }`; only when the country is LIVE (409 `country_not_live`); emails the not-yet-notified entries ("{country} is open") and sets `notifiedAt`. 200 `{ ok, notified }`. Audit `demand.waiting_list.notify`.
**Overview** `needsAttention.examRequests` now ignores requests already marked done.

### Payments
**GET `/api/admin/payments/export`** (`payments:read`, new): query `from`, `to` (dates `YYYY-MM-DD`, inclusive, UTC; both optional), `country`, `status=all|paid|pending|failed` (as the list tabs; default `paid`), `provider`. `text/csv` attachment, at most 20,000 rows, columns
`date,payment_id,country,currency,amount,status,provider,payer_number_masked,customer_name,customer_email,operator_reference,transaction_id,confirmed_at,access_until` (amount in major units, e.g. `2000` or `1500.00`; payer number masked to its last 4 digits). Writes `export.payments`. 400 `invalid_range` if `to` < `from`.
**GET `/api/admin/payments/:id`** (changed): `payment` gains `stuck`, `waitingMinutes`, `canCheck`, `canManualGrant` (what the buttons may do) and `ageMinutes`.

### Users: support
**GET `/api/admin/users/:id/candidate-view`** (`users:read`, new) -> `{ readOnly: true, user, country, access, dashboard, attempts: [{ id, kind, title, status, percent, submittedAt }] (latest 20), payments: [row as in /me/payments, without canCheck] }`: what the person sees on their dashboard and lists, read only, no session switch. `dashboard` is the same object as `GET /api/me/dashboard`. Audit `user.view_as_candidate` (the person is not told). 404 `user_not_found` (also outside the admin's countries).
**GET `/api/admin/users/:id/access-preview?days=30&countryCode=RW`** (`users:read`, new) -> `{ days, startsAt, endsAt, currentEndsAt|null }`: "Access will run until ..." before the grant is confirmed. The grant itself is the existing `POST /api/admin/users/:id/access` (`{ days?, countryCode?, reason }`, 201 `{ grantId, endsAt, access }`).

### Not built (and why)
See `docs/missing-built-backend.md`: admin Overview "support requests" count (no support-request feature exists), a topic reorder (topics have no order, they sort by name), "not listed? tell us your country" capture, IP geolocation for "Detected from your connection".
