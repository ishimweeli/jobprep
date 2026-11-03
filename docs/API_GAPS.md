# API gaps found by the web app

Appended by the frontend engineer (`apps/web`). Each entry: what is needed, endpoint, why, and the workaround in the web app.

## 1. Guest session probe returns 401 (console noise on every page view)
- **Need:** `GET /api/me` for a guest should answer `200 {"user": null}` (or a separate `GET /api/session`), not `401`.
- **Why:** the session cookie is httpOnly, so the web app cannot tell whether it is signed in. Every guest page view logs a red "401 Unauthorized" console error, which fails the "no console errors" bar.
- **Workaround:** `apps/web/src/api/me.ts` only calls `/api/me` when a non-secret localStorage hint (`jobprep.session=1`, written after sign-in/up) exists; a 401 clears the hint.

## 2. Catalog filters accept one value per key
- **Need:** `difficulty` and `language` accepting several values (e.g. `difficulty=FOUNDATION,STANDARD`), and a `sort=free_first` option (or `sort` values `recommended|recent|title|free_first`).
- **Endpoint:** `GET /api/countries/:code/mock-tests`.
- **Why:** the Catalog artboards draw Difficulty and Language as checkboxes (multi-select) and Sort as "Most relevant / Newest / Free first".
- **Workaround:** single-select radios with "Any"; Sort offers Most relevant and Newest only.

## 3. Support contact
- **Need:** a per-country support number/email in `GET /api/countries/:code` (e.g. `supportContact`).
- **Why:** the Pricing FAQ artboard has a "[SUPPORT NUMBER]" placeholder.
- **Workaround:** the sentence says "contact support with your transaction ID" without a number.

## 4. Exam requests and waiting list have no designed UI
- `POST /api/countries/:code/exam-requests` and `POST /api/countries/:code/waiting-list` work, but the artboards only draw the buttons ("Request this exam", "Notify me when X opens"), not the forms. The buttons are inert until the forms are designed.

## 5. Not-live country data in the console
- `GET /api/countries/:code/landing` etc. return 404 for countries that are not live (correct). Opening `/ke` directly briefly requests them before the country list says it is not live; the browser logs the 404. Harmless, but a `status` field on a cheap public endpoint used before the page queries would avoid it.

## Part 2 (exam, results, dashboard, checkout)

### 6. Payment method hints are shorter than the artboard
- **Need:** `paymentMethods[].hint` such as "Numbers starting 078 or 079" (MTN MoMo) and "Numbers starting 072 or 073" (Airtel Money), as drawn in `Checkout.dc`. The seed says "MTN numbers" / "Airtel numbers".
- **Endpoint:** `GET /api/me/checkout`, `GET /api/countries/:code` (seed `paymentMethods`).
- **Workaround:** the web app shows the API's hint verbatim (prefixes are operator data, not hardcoded in components).

### 7. The checkout summary has no "access until" preview
- **Need:** `plan.accessUntil` (end of current coverage + duration, or now + duration) in `GET /api/me/checkout`, so "Access starts once payment is confirmed · until 1 Dec 2026" does not depend on the device clock.
- **Workaround:** computed in the browser from `session.access.current.endsAt` (or now) plus `durationDays`. It is a display estimate only; the confirmed screen uses the API's `access.endsAt`.

### 8. The dashboard goal is a category, the artboard shows a profession
- **Need:** `goal` as a profession ("Secondary Mathematics Teacher") or a `goalLabel`; `Dashboard.dc` reads "Preparing for Secondary Mathematics Teacher". The API returns the category ("Teaching positions").
- **Workaround:** the category name is shown. The score-history subtitle reads "All mock tests" (the artboard's "All teaching mock tests" would need the category filter the UI does not expose).

### 9. Greeting word per country
- **Need:** a per-country greeting (`Muraho` for Rwanda) from the API or the i18n catalogue; the web app has `Muraho` for RW and `Hello` for everything else hardcoded in `features/dashboard/dashboardModel.ts`.

### 10. Resume data
- `GET /api/attempts/in-progress` and `dashboard.resume` give answered/total/remaining only; the dashboard "Continue where you stopped" card shows the test title. A practice attempt's title is generated, fine. No change needed, noted for completeness: `resume` is only the most recent running attempt.

### 11. Autosave while the page unloads
- The web app fires a `keepalive` `PUT /api/attempts/:id/answers` on `pagehide` as a best effort. It relies on the existing idempotent, last-change-wins save; no API change needed. Browsers cap keepalive bodies at 64 KB (about 100 changes), which matches `MAX_CHANGES_PER_REQUEST`.

### 12. Unrelated working-tree changes seen earlier
- At the start of this pass `git status` showed uncommitted edits in `apps/api` (`app.ts`, `config.ts`, `http/rate-limit.ts`, `hardening.test.ts`, `rate-limit.test.ts`) that this pass did not make. If per-IP rate limits land, the e2e suites that create many OTP requests from one IP may need the limits relaxed for `ENABLE_TEST_ENDPOINTS`.

## Part 3 (Batch 1 screens: sign-in, access states, gates, multiple-select, practice)

### 13. `previousAttempts` on exam details mixes in practice sets, has no `kind`, and stops at 5
- **Need:** `GET /api/countries/:code/mock-tests/:slug` -> `previousAttempts` limited to full attempts (or carrying `kind`), plus a `previousAttemptCount` and `bestPercent`.
- **Why:** "Review last attempt · 58%" and "Attempts: 2 · best 58%" (ExamDetailUnlocked.dc) read the list. Practice sets are anchored to a mock test, so one can appear as the "last attempt"; with more than 5 attempts the count and the best score are wrong.
- **Workaround:** the page uses the first row as the last attempt, shows "Attempts: 5+" when the list is full, and "best" is the best of the rows it has.

### 14. Review items have no `choose`
- **Need:** `choose` on `GET /api/attempts/:id/review` items (as on the exam state).
- **Why:** the review says "Choose 3" (MultiSelect.dc). An explicit `choose` larger than the number of correct options would differ.
- **Workaround:** `choose` = the number of options marked correct.

### 15. The wrong-country answer (403 `country_mismatch`) does not say which test the link was
- **Need:** `{ error: 'country_mismatch', test: { title }, country: { code, name } }`.
- **Why:** CountryGate.dc says "The link you opened is **County Accountant — Mock 1** in Kenya".
- **Workaround:** the web app decides from the country list and the user's country (no API call) and writes "The link you opened is for Kenya." without the title.

### 16. The waiting list stores only a phone number
- **Need:** an optional `interest` (free text, "What are you preparing for?") on `POST /api/countries/:code/waiting-list`.
- **Why:** CountryGate.dc draws that optional field. **Workaround:** the field is left out (a field that is thrown away would mislead).

### 17. `pendingPayment` on the dashboard has no number and no time
- **Need:** `msisdn` and `createdAt` in `dashboard.pendingPayment`.
- **Why:** "We sent a prompt for RWF 2,000 to +250 788 123 456 at 21:05" (DashboardNew.dc).
- **Workaround:** one extra `GET /api/payments/:id` when a payment is pending; the number and time are left out if that call fails.

### 18. No signal for "approved but not confirmed yet", nor for "number on another network"
- `CheckoutStates.dc` draws both. **Workaround:** "Still waiting for confirmation" is shown when the user comes back through "Check payment" and the payment is still PENDING (the user is saying they approved). "Number on another network" is unreachable: there is no operator rule (DECISIONS #71), so nothing can produce it.

### 19. Not yet provided (owner input), left out of the UI
- Support phone (`[SUPPORT PHONE]`: account menu "Help and support", checkout "Still waiting"), maintenance time (`[TIME]`), per-exam scoring rule text (`[SCORING RULE]`), demonym for the waiting-list copy ("Ugandan"), the profession-style goal label (API_GAPS #8).

### 20. `recentlyCompleted` on the dashboard lists practice sets next to mock tests
- Works as designed for now (it reads "Practice set: ..."); the artboards only draw mock tests. Say if practice sets should be left out.

### 21. "Practise N more" can only use one topic
- A set built from three weak topics can be repeated for one topic only (`POST /api/countries/:code/practice {topicId}`), because there is no endpoint that takes several topic ids. The web app uses the topic with most questions in the set.

## Admin (apps/web/src/admin)
Found while building the admin screens against `/api/admin/*`. Each has a workaround in the app; nothing here changes the API.

### A-1. The audit sentence for a sign-in reads "admin sign_in" (moot since DECISIONS 88: admin sign-in is the normal sign-in and is no longer written to the audit log)
- **Need:** `describeAudit` case for `admin.sign_in` (for instance "signed in") and for any other action without a case: the default turns `admin.sign_in` into "admin sign_in".
- **Why:** the Settings audit list prints the server's `summary` after the actor's name: "Jean Bosco N. admin sign_in".
- **Workaround:** none (the server's sentence is shown as it is, as designed).

### A-2. "Needs attention" counts reports, not questions
- **Need:** `needsAttention.reportedQuestions.count` as the number of distinct questions (and, if wanted, `reports` separately).
- **Why:** the design says "4 questions reported by candidates"; the API counts open report rows, so two reports on one question read "2 questions".
- **Workaround:** the number is shown as the API gives it with the artboard's words.

### A-3. The user detail has no "tests taken" count
- **Need:** `testsTaken` in `GET /admin/users/:id` (the list has it).
- **Why:** the phone "Profile" card draws "Mock tests taken".
- **Workaround:** the number of finished attempts in the response (the API returns the latest 10), shown as "10+" when it is 10.

### A-4. No plan or provider summary on the Payments list
- **Need:** the live country's plan price and payment-method names in `GET /admin/payments`.
- **Why:** the page subtitle reads "Full Access · RWF 2,000 · MTN MoMo and Airtel Money"; Support has `payments:read` but not `countries:read`, so it cannot read them from the countries API.
- **Workaround:** System admin builds the line from `GET /admin/countries` and `/countries/:code`; Support sees no subtitle.

### A-5. The country list has no provider names and no user-facing "languages" summary
- **Need:** `paymentMethods` labels on `GET /admin/countries` rows.
- **Why:** the phone artboard writes "KES · price not set · M-Pesa" and "RWF 2,000 · MTN MoMo, Airtel".
- **Workaround:** the summary uses price, tests and users (or waiting list) from the list.

### A-6. Settings need `settings:write` even to read
- **Need:** a read permission for `GET /admin/settings` (and for the team list), or an answer for roles without it.
- **Why:** harmless today (only System admin has it) but the screen cannot show the stuck-after value to Support, who sees "Stuck" payments.
- **Workaround:** none needed now; Settings is System admin only.

### A-7. Admin sign-in codes: five an hour per email, 45 s apart (since DECISIONS 88 these are the normal sign-in codes, purpose `SIGN_IN`)
- Not a defect: it makes automated sign-in tests share one session per role (`e2e/admin-helpers.ts` keeps it in the temp directory) and wait out the cooldown.

### A-8. The checklist labels carry no currency
- **Need:** `label` such as "Set the Full Access price in KES" (the design writes the currency); the API's label is "Set the Full Access price".
- **Workaround:** the API's label is shown as it is.

### A-9. The exam list has no category id and no "reported by" totals for the header
- Minor: the category filter uses the category `slug`, so the same slug in two countries (Rwanda and Kenya both have `teaching-positions`) filters both. The select shows each name once.
