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
