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
