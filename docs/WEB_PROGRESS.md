# Web progress (apps/web)

React 18 + Vite 8 + TypeScript (strict) + Tailwind 3 (`@jobprep/shared/tailwind-preset`) + react-router 6 + TanStack Query 5. Dev server on 5173, `/api` proxied to the API on 4000 so the `jp_session` cookie is same-origin. Run: `npm run dev -w @jobprep/web`.

**Rule applied (owner, mid-task):** no screen, route, dialog, form, menu or component without an artboard in `docs/design/source`. Where a designed button has no designed follow-up, it is drawn as in the artboard and left inert (`aria-disabled`, no navigation) via `ActionLink` and the flags in `src/lib/routesReady.ts`. Everything that had been invented earlier was removed (see "Removed" below).

## What was built (desktop + phone, one responsive implementation each)

| Screen | Artboards | Route | Notes |
|---|---|---|---|
| Landing | Main, MainPhone, MainKenyaPhone | `/:country` | Fully data-driven from `GET /api/countries/:code/landing` (+ `/countries/:code` for payment methods and disclaimer). Hero, search form, popular chips (API), 6 category cards (Teaching highlighted via `featured`), featured tests, 4 steps, recently added, pricing summary, footer disclaimer from the API. Desktop-only hero exam preview. |
| Exam discovery | Catalog, CatalogPhone | `/:country/tests` | Filters live in the query string (`q, category, price, difficulty, language, subject, sort`), debounced search, category chips, desktop sidebar filters, phone bottom-sheet filters (dialog semantics), result cards (one View test link, stretched over the card on phone), skeletons, empty state, error with retry. |
| Exam details | ExamDetail (free + paid), ExamDetailPhone | `/:country/tests/:slug` | Facts, section table (desktop) / list (phone), instructions from the API, pass-mark rule (note unless the API returns percent + source), previous attempts, access card; phone fixed bottom CTA bar. Price/duration/currency only from the API. |
| Pricing | Pricing, PricingPhone | `/:country/pricing` | From `GET /api/countries/:code/pricing`: free samples, Full Access (name, days, price, paid once), Mobile Money providers, FAQ (durations from the API). |
| Country picker | CountryPicker, CountryPickerPhone | `/choose-country` | Modal over a dimmed skeleton on desktop, full page on phone. Live countries first. Non-live: "Coming soon" + inert "Notify me when X opens". |
| Sign-up | SignUp, SignUpPhone | `/sign-up` | Country, name + phone (dial-code prefix), 6-digit code (resend countdown from `cooldownSeconds`, 429 `Retry-After`), job goal (country categories). Guest tokens from `jobprep.guestTokens` are sent. Friendly copy for invalid_code, too_many_attempts, otp_cooldown, otp_hourly_limit, account_exists, invalid_phone, account_suspended. Header "Sign in" leads here (as in the artboards). |
| Account + change country | ChangeCountryPhone | `/account` (phone only) | Name, phone, exam country row -> country picker -> "Switch to X?" sheet (`GET /me/country-change`, `POST /me/country`). |
| System states | States | shared components | Skeletons, empty, error with retry, used everywhere. |
| Shell | all | — | Desktop header (landing: + country chip, Teaching exams, Try a free test; other screens: logo, nav, Sign in / avatar), phone landing header, back headers, landing footer, skip link. |

Country is in the URL and remembered in localStorage (`jobprep.country`, try/catch). A signed-in user opening another country's URL is redirected to their own (API `country_mismatch`).

## Admin area inside the web app (2026-11-03, owner: one backend, one frontend)

The admin screens live in `apps/web/src/admin/**` and are served at `/admin/*`. `routes.tsx` mounts them as a lazily loaded subtree (`React.lazy` + `Suspense`, route `/admin/*`; static segments outrank `/:country`, covered by `routes.test.tsx`), so candidates never download admin code (the main chunk has none of it). It reuses the web client (`api/client.ts`: same origin, `jp_session`, one `ApiError`; `/admin/*` 401s are left to the admin guard instead of the "session expired" page), the query client, `lib/cx` and `lib/useDocumentTitle`, Tailwind and the shared tokens. Admin-only base CSS is `admin/styles/admin.css`, scoped to `html.admin-area` (set while the admin area is mounted) so it never changes a candidate page. Its sign-in is `/sign-in` (with `?next=`, and `&reason=admin_stale` for "Please sign in again to use the admin area"); the account menu and Account tab show an "Admin" row when `user.roles` is not empty; a person with no role gets the `no_access` system page. Details and file list: [ADMIN_PROGRESS.md](ADMIN_PROGRESS.md); undesigned parts: MISSING_DESIGNS **E3**.

## Removed after the owner's "no invented screens" rule
Placeholder pages (exam start, checkout, my progress), 404/generic error pages (unknown paths redirect to `/` or the picker), sign-in screen, "Request this exam" form, "Notify me" waiting-list form and the "not open yet" sheet, account/sign-out menu (desktop and phone menu), phone hamburger menu, mobile tab bar, desktop account page, account extras (job goal, access, sign out), catalog pagination, phone-sheet Subject/Language controls, copy that is not in an artboard (e.g. the free-sample caption, the "job goal is cleared" bullet).

## Missing designs (not built; list for the design owner)
Owner's list: practice-set runner with answer + explanation after each question; "Request this exam" form (only the button exists); "Notify me when X opens" form (only the button); account page on desktop and profile editing; "Change goal" screen; header account/sign-out menu; Terms / Privacy / Refund / Help pages and cookie notice; 404 and generic error pages; desktop checkout (design is phone-first only); empty dashboard for a new user; desktop Time-up screen.

Found while building:
1. **Sign-in screen** (phone + OTP for existing users). SignUp artboards only draw sign-up; "Already have an account? Sign in" is drawn but inert. Existing users currently have no way in through the UI.
2. **Sign-out** control anywhere (no artboard), and the desktop/phone account menu.
3. **Phone hamburger menu contents** (button is drawn on the landing phone header, inert).
4. **Signed-in variants** of landing/catalog/pricing/details (only Dashboard artboards show the avatar header and the Mock tests / My progress / Access tab bar). Desktop shows a static avatar; no tab bar is rendered.
5. **Catalog pagination / load-more** (catalog shows up to 50 results, no paging UI).
6. **Phone filter sheet Subject and Language controls** (desktop sidebar draws them; the phone sheet draws only Price and Difficulty). Phone users cannot filter by subject or language.
7. **Catalog "Free first" sort** and **multi-select Difficulty/Language checkboxes** are drawn but the API supports one value / no free-first sort (single-select radios with "Any" are used; sort offers Most relevant and Newest). See API_GAPS.
8. **Landing language toggle** (drawn on the Kenya phone artboard, absent on Rwanda; no rule for when it shows). Not built.
9. **Country picker "Detected from your connection: Rwanda"** (needs a geo/IP source; not available). Last-used country, then the browser region, then the first live country is used silently.
10. **Switch sheet note that the job goal is cleared** (API clears it; the artboard's three bullets do not say so).
11. **Exam details for a test the user already unlocked** (only the States "Unlocked · N days left" tag is drawn; used as the card text).
12. **Exam details "Review last attempt"** (Review artboards exist; the attempts API does not) and the attempts list's follow-up.
13. **Support contact** for the pricing FAQ ("[SUPPORT NUMBER]" placeholder in the artboard) and the Kenya price placeholder.
14. **Account page for a user in a non-live country picker choice** (switch sheet for a country that is not live): nothing is shown.
15. **Dashboard / My progress** (artboards exist, later phase): "My progress" in nav is drawn but inert.

Destinations whose artboards exist but belong to later phases (buttons are drawn and inert until `ROUTES_READY` flips): exam start (`Exam`, `ExamMobile`), checkout (`CheckoutKenyaPhone`, `Checkout`), dashboard.

## Test results (2026-11-02)
| Command | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | 252 API + 47 web + 2 shared, all pass (web: 9 files — API client error mapping and session hint, catalog filter <-> query string, OTP input/step incl. resend countdown + 429, country persistence and resolution, price/pass-mark display rules, phone/format/error-copy, Dialog focus trap, access card, change-country sheet) |
| `npx playwright test` | 136 passed, 10 skipped (phone-only / desktop-only cases), both projects, incl. the backend's specs |
| `npm run build -w @jobprep/web` | pass |

Web e2e specs (`e2e/web-*.spec.ts`, desktop-1440 + phone-390): landing (data from API, search, chips, header, 360px no-scroll, API-down retry), catalog (list, search, chips, price/difficulty/URL sync, empty state, error retry), exam details (free, paid, API price change, pass mark, unlocked, phone CTA bar), pricing, country picker, sign-up (full flow reading the OTP from `/api/test/otp`, guest tokens, wrong code, validation, existing account, rate limits, back), account + switch sheet (phone), and accessibility (axe WCAG A/AA on 7 pages x 2 viewports, focus ring, skip link, filter sheet and modal focus trap/Esc/return focus, touch targets).

Browser pass: every screen opened at 1440x900 and 390x844 (and 360 for scroll) with the Playwright MCP browser; console errors, failed requests and horizontal scroll checked.

## Screenshots (`docs/screenshots/`)
`landing-{desktop,phone}`, `catalog-{desktop,phone}`, `catalog-empty-{desktop,phone}`, `catalog-filters-phone`, `exam-free-{desktop,phone}`, `exam-paid-{desktop,phone}`, `pricing-{desktop,phone}`, `choose-country-{desktop,phone}`, `sign-up-1-country`, `sign-up-2-phone`, `sign-up-3-code`, `sign-up-4-goal` (each `-desktop` / `-phone`), `account-phone`, `account-change-country-phone` (preview mocked: Kenya is not live in the seed). Older `sign-up-{desktop,phone}.png` are step 1.

## Performance (production build, `vite preview`, Lighthouse mobile, headless Chrome)
| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/rw` landing | 100 | 100 | 100 | 91 | 0.8 s | 0 ms | 0 |
| `/rw/tests` catalog | 99 | 100 | 100 | 91 | 2.0 s | 0 ms | 0 |

SEO 91: the only miss was `robots.txt` (the SPA fallback served HTML); `public/robots.txt` was added afterwards (not re-run). Remaining notes: unused JS ~26 KiB (shared vendor chunk), render-blocking CSS 150 ms.

Bundle (gzip): landing route initial JS = vendor/shared chunk 78.1 KB + entry 10.4 KB + landing 5.9 KB + tiny shared chunks ~2 KB = about **96 KB**; CSS 7.0 KB; Inter latin variable font 48 KB (only the latin subset is requested). Catalog route adds 5.0 KB, details 3.1 KB, sign-up 5.5 KB (all lazy).

## Assumptions
- Sessions: the cookie is httpOnly, so a non-secret hint `jobprep.session=1` in localStorage (written after sign-up) decides whether to call `/api/me` (API_GAPS #1). Clearing site data without cookies shows a guest until the next sign-up.
- Desktop nav shows Teaching exams only on the landing header (as drawn); the country chip only on the landing headers (as drawn) — elsewhere the picker is reached from the landing chip or `/choose-country`.
- The OTP step auto-advances boxes and supports paste/autofill; verify is explicit (button).
- Catalog loads up to 50 results (no paging UI is designed).
- Phone numbers are sent as dial code + 9 national digits (API accepts E.164).

## API gaps
See `docs/API_GAPS.md` (guest session probe 401, multi-value filters, free-first sort, waiting-list/exam-request not usable without designs, support contact).

## Known gaps
- (Superseded by Part 2 below: exam start, checkout and the dashboard are now built and their buttons are live.)
- `/ke` (not live) redirects to the picker; the API correctly 404s its data, which logs a resource error in the console if the URL is opened before the country list arrives.
- Language switching UI is absent (UI catalogues are almost empty).

---

# Part 2: exam, results, review, dashboard, checkout

Built from the artboards `Exam`, `ExamMobile`, `CaseExam`, `CaseExamPhone`, `TimeUp`, `States` (resume prompt, payment not completed), `Results`, `ResultsPhone`, `Review`, `ReviewPhone`, `Dashboard`, `DashboardPhone`, `Checkout`, `CheckoutKenyaPhone`, `PayDone`. One responsive implementation per screen (artboard copy and inline styles; desktop 1440, phone 390). The owner's rule still applies: nothing without an artboard; undesigned follow-ups are drawn as in the artboard and left inert (`lib/routesReady.ts`).

## What was built

| Screen | Route | Notes |
|---|---|---|
| Start / resume | `/:country/tests/:slug/start` | `POST /countries/:code/mock-tests/:slug/attempts` (starts or resumes), keeps the guest token in `localStorage jobprep.guestTokens` (JSON array, newest first; sign-up already forwards it) and sends `X-Guest-Token` on every API call. A paid test without access goes to checkout (402) or to sign-up (401). |
| Mock exam | `/:country/exam/:attemptId` | Header (title, "All answers saved" / "Saved" on phone, `role="timer"`, Submit), large question, A-D buttons, Flag for review, Previous/Next, progress bar, navigator grid (answered / not answered / flagged with corner mark / current ring). Phone: header progress bar, bottom controls, "All questions · N/50" bottom sheet (dialog). Submit dialog with answered / unanswered / flagged, time left, "Go to first unanswered question", "Submit now", "Keep working". |
| Case-based questions | same route | Desktop split view (case passage, table, notes left; question right; case mini-navigator, "Case question 2 of 10 · topic", marks). Phone: "Question / Case study" switch, "Based on: ... case" button, "Back to question N". |
| Time is up | same route | Shown when the server closes the attempt while the page is open: "Your exam was submitted automatically with N of M questions answered. Nothing you answered was lost." + "See my results". Counts come from a fresh `GET /attempts/:id` after the last queued answers were sent. Desktop: the same phone layout centred in one column (C7). |
| Offline | same route | Amber "No connection..." banner, "N answers waiting to save" in the header, "The timer keeps running while offline..." under the options. Submit is hidden while offline, as drawn. |
| Resume prompt | exam details | "You have a test in progress ... Resume / Submit as it is" (States artboard), above the details of the test that has a running attempt (`GET /attempts/in-progress`). |
| Results | `/:country/results/:attemptId` | Score ring, counts, time spent, change vs previous ("Up N points ... (62% on 24 Oct)"), performance by topic with "Weak area", comparison (bars on desktop, two boxes on phone), "Review these first", pass-mark note only as the API says. Review Answers, Try Another Mock Test, "Save my result" (guests, opens sign-up with `?next=` back to the result). "Practice Weak Areas" is drawn and inert. |
| Answer review | `/:country/review/:attemptId` | Filters Incorrect / Flagged / Unanswered / All with counts, check / cross text labels, topic, explanation. Desktop: jump grid + every question in the filter. Phone: one question at a time with Previous / Next. `?q=7` jumps to a question. |
| Dashboard | `/:country/progress` | Greeting, goal, resume card, recommended practice (inert), score-history chart, strong / needs-work topics, recently completed, My access. Phone: bottom tab bar (Mock tests, My progress, Access) and the dashboard phone header. Guests go to sign-up and come back. |
| Checkout | `/:country/checkout?test=slug` | Order summary, provider, number, "Pay {price}", "Approve on your phone" (polls `GET /payments/:id` every 3 s; "Send again" = `POST /payments/:id/resend`; "Use a different number" = resend with the new number), then "Payment confirmed" (`PayDone`) or "Payment not completed ... You were not charged." (declined, failed, expired) with "Try again". A late approval after expiry (the API honours it) turns the screen into "Payment confirmed". Rwanda and Kenya variants are driven by the API's country data (national number field vs `+254` chip, KES, `KES [PRICE]` and a disabled pay button when no price is set). Never asks for a PIN. Phone-first; desktop = the same column centred (C19). A guest is sent to the existing sign-up and returns to checkout. |

Shared changes: `Dialog` got `titleClassName` and `desktopPanelClassName` props; headings are bold by default again (the artboards rely on the browser default, Tailwind preflight resets it); `ROUTES_READY` now has `examStart / checkout / progress / results / review / resume / tryAnother = true`, while `practice` and `changeGoal` stay `false`; `AccessCard` links carry `?test=` to checkout; `SignUpPage` honours a same-site `?next=`; `api/client.ts` sends `X-Guest-Token` and supports PUT and `keepalive`; `PhoneBrandHeader` / `CountryChip` got `menu` / `nameOnly` options for the dashboard header.

## Exam engine (all in `features/exam/`)
- **The server owns time.** `timer.ts` / `useExamTimer.ts`: the clock is `deadlineAt - serverNow` from the last sync, counted down with `performance.now()`; the device wall clock is never used (a spec shifts `Date.now` by a year and the clock is unchanged). Re-sync every 30 s, on tab focus, on `visibilitychange` and when the browser comes back online; at 0 it asks the server (which closes the attempt) and keeps asking every 3 s while offline. Red under 5 minutes (`data-low`).
- **Autosave.** `saveEngine.ts` + `queue.ts`: every answer and flag change is written to IndexedDB (`jobprep-exam` / `queues`, one record per attempt id, memory fallback) first, then sent after 300 ms in `PUT /attempts/:id/answers` with `at` = when the user did it. One entry per question and field (a flag and an answer keep their own times). An entry leaves the queue only when the response says `saved` or `stale` and it was not changed again meanwhile; `rejected` entries stay out of the retry loop and the count; retries back off 1 s to 30 s; the browser's `online` event retries at once; 409 `attempt_closed` (or 404) stops everything and shows Time is up; a `pagehide` keepalive send is a best-effort extra. Sending the same change twice is safe.
- **Resume.** The server state is always loaded first (`GET /attempts/:id`), then the unsent local queue is merged on top by timestamp. The question position is kept per attempt in `sessionStorage`.
- **Submit.** `POST /attempts/:id/submit` with anything still queued (chunks of 100 are saved before). Offline it fails with an alert in the dialog and the queue stays.
- **Multiple-select (C3/C37, interim).** The same option buttons toggle several keys on and off; all are sent; no new element or text. Seed: Secondary Mathematics S1-S3, "Select ALL the prime numbers".
- **Accessibility.** Dialog semantics (focus trap, Esc, focus returns) for the submit dialog and the phone navigator sheet; `role="timer"` (implicit `aria-live=off`, so it does not announce every second); header status is `role="status"`; icon buttons have aria-labels; navigator cells read "Question 5, answered, flagged, current"; touch targets 44 px or more on the exam; no animation; scrollable case panels are keyboard-reachable.

## Missing designs (hit in this pass; none was built)
Master list: `docs/MISSING_DESIGNS.md`. What each gap looks like in the app today:
- **C1 Practice runner and practice results (C2).** "Practice Weak Areas" (results; shown only when the API says `canPractice`), "Practise weak areas" (review header), "Start practice" and "Practise" (dashboard) are drawn and inert (`aria-disabled`, no navigation).
- **C3 / C37 Multiple-select.** Interim behaviour above. Review marks every correct option "Correct answer" and every pick "Your answer".
- **C4 Case passage in the review**, **C5 "Partly correct"** (a partly correct answer shows as Incorrect with the cross mark and is listed under Incorrect, no marks line).
- **C6 Results edge states.** No "submitted automatically" line; no weak areas gives no "Practice Weak Areas" button and no weakest-topic sentence; nothing wrong leaves out "Review these first"; zero answered and perfect score use the same layout; signed-in users simply have no "Save my result" banner.
- **C7 / C8 Desktop Time is up and offline.** Phone layout centred; the offline banner is full width at the top, copy as in the artboard with "device" instead of "phone" on desktop (the wording in MISSING_DESIGNS C8). Extra states not drawn: saving, sync problem, "This exam has already ended" (a refused late save goes straight to Time is up).
- **C9 Finished-attempt reopen.** A finished attempt URL redirects to its results.
- **C15 Change goal.** "Change goal" / "Change" is inert text.
- **C16 Dashboard for a new user and "My access" states.** A new user sees the greeting only; every section without data is left out; with no active access there is no "My access" card (no "Get Full Access", no expired or renewal states).
- **C17 Guest buys a paid test.** No interstitial: the existing sign-up is used with `?next=` and the user returns to checkout. A signed-in user who opens a paid test they cannot start is sent to checkout.
- **C18 "Save my result" success.** After sign-up the user goes back to the results page, with no confirmation message.
- **C19 Desktop checkout and C20 checkout edge states.** Desktop = the phone column centred. Wording not in an artboard: "We could not send the payment request. You were not charged. Try again." (from MISSING_DESIGNS C20.1), the inline invalid-number message (existing sign-up copy), the declined / failed variants of the States text ("was declined", "could not be completed"). No "Check payment" / "Still waiting" state, no price-not-set message (the pay button is disabled and shows the `[PRICE]` placeholder), no "the new 30 days start when the current ones end" note.
- **C29 Phone navigation.** The bottom tab bar is rendered on the dashboard only (the only artboard that has it); the dashboard phone header has no menu button, as drawn.
- **C30 Details for an unlocked test with a running attempt, "Review last attempt".** The States resume prompt is used on the details page; "previous attempts" rows are not links.

Small additions or deviations from an artboard, to confirm:
1. The pending screen shows the time left after "Waiting for confirmation..." (the brief asks for a countdown; the artboard has none).
2. "Start Mock 1 now" takes the test number from the title ("Mock 1"); without one it reads "Start mock test"; without a `?test=` it goes to the catalog.
3. The submit dialog hides "Go to ... unanswered" when nothing is unanswered; "Submit now" shows an inline error when submitting fails.
4. The phone case question has the "Flag" button (CaseExamPhone does not draw it, ExamMobile does).
5. The exam header hides Submit while offline (as in the offline artboard).
6. "Practise" is inert text, the goal line is hidden when the user has no goal, the history subtitle reads "All mock tests", and a review jump-grid cell for a question hidden by the current filter switches the filter to All.
7. "Submit as it is" on the resume prompt submits without a confirmation (none is drawn).
8. Payment-method hints come from the API ("MTN numbers"), not the artboard's "Numbers starting 078 or 079" (API_GAPS 6).

## API gaps
`docs/API_GAPS.md` items 6 to 12 (payment hints, "access until" preview, profession goal, greeting word, keepalive autosave, unrelated working-tree changes).

## Test results (2026-11-02)
| Command | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | 303 API + 142 web + 2 shared, all pass. New web unit tests (19 files in total): IndexedDB queue (enqueue, dedupe by question/field, ack/drop rules for saved / stale / rejected, superseded entries, merge on resume, IndexedDB store with `fake-indexeddb`, memory fallback), save engine (300 ms debounce, local write before send, offline retry with backoff and cap, `online` flush, 409 `attempt_closed`, `AUTO_SUBMITTED`, load and resend, submit with the queue, "waiting" after 3 s), timer maths and the `useExamTimer` hook (30 s resync, focus / online resync, offline at 0, expiry once, device clock ignored), navigator cell state and counts, saved label, case labels, checkout state machine and polling rule, country-driven checkout copy, phone number handling, a component test of the checkout polling (form to pending to confirmed, declined, bad number), score ring and comparison wording, review filters and grid marks, dashboard chart geometry, guest tokens and the `?next=` guard. Added dev dependency: `fake-indexeddb` (`apps/web`). |
| `npx playwright test` | **190 passed, 12 skipped** (phone-only and desktop-only cases), both projects, full suite including the earlier specs (9.1 min; includes the two 2-minute offline runs and the two 1-minute time-up runs). |
| `npm run build -w @jobprep/web` | pass |

Earlier specs updated because their buttons are live now: `web-exam-detail`, `web-landing`, `web-pricing` (button to link), `AccessCard.test.tsx`.

New Playwright specs (each runs in `desktop-1440` and `phone-390`):
- `web-exam.spec.ts`: **Flow A** (landing, Teaching, Secondary Mathematics, free mock, answer, flag, submit dialog with counts / Keep working / Go to first unanswered / Submit now, results, review filters and counts, jump grid on desktop, Previous / Next on phone, Try Another Mock Test); **refresh mid-exam** (answers, flag, position, remaining time within 3 s of `GET /attempts/:id/timer`); **device clock changed by a year** (clock unchanged); **offline for 2 full minutes** (marked slow: 3 answers, banner and "3 answers waiting to save", clock drops by the 2 minutes, nothing on the server while offline, then everything saved, server state and a reload verified); **refresh while saves cannot reach the server** (IndexedDB record checked, answer shown after reload, sent when the connection returns); **keyboard-only run** (answer, flag, Tab order, no key trap, focus returns from the dialog); phone navigator sheet focus trap; 44 px touch targets; resume of a running attempt; the resume prompt (Resume, Submit as it is); "Save my result" to sign-up with the token and `?next=`.
- `web-checkout.spec.ts`: **Flow B** (sign up through the screens, search Accountant, paid details, Get Full Access, MTN MoMo, pending, `POST /api/test/payments/:id/simulate success`, Payment confirmed with its rows, Start Mock 1 now, case-based exam with the case study, results); **declined** and **expired** show "You were not charged" and Try again; **Send again / Use a different number / late approval after expiry**; invalid number; guest sent to sign-up and back; paid test not unlocked goes to checkout; **Kenya** (country data mocked, Kenya is not live yet): M-Pesa, KES `[PRICE]`, `+254`, disabled pay.
- `web-timeup.spec.ts`: creates a free 1-question, 1-minute test (`e2e-timeup-*`, published, Rwanda Teaching category) with PrismaClient, runs it to expiry, asserts "Time is up" with "1 of 1", that the server status is `AUTO_SUBMITTED`, and that the answer was kept (100% in the results); deletes the test, its attempts and its exam afterwards (also before the run). Seeded tests are never modified.
- `web-dashboard.spec.ts`: full dashboard (resume, inert practice, chart, topics, recent, access, tab bar / header), guest redirect, empty account.
- `web-a11y-exam.spec.ts`: axe WCAG A/AA on the exam (and with the submit dialog and the phone sheet open), results, review, case exam (both layouts), dashboard, checkout form and pending, payment not completed, payment confirmed.

Browser pass (Playwright MCP): every new screen opened at 1440x900 and 390x844 (360 for checkout), console and network checked, no horizontal scroll (390, 360). Fixes found that way: headings were not bold, case table was squashed by the nested scroll area, dashboard cards on phone were content-width, the logo showed in the phone exam header, and the "Use a different number" button submitted the pay form because React reused the footer button (now keyed).

## Screenshots (`docs/screenshots/`)
`exam-submit-dialog-desktop`, `exam-phone`, `exam-navigator-phone`, `exam-case-desktop`, `exam-case-question-phone`, `exam-case-study-phone`, `exam-offline-phone`, `time-up-phone`, `time-up-desktop`, `resume-prompt-desktop`, `resume-prompt-phone`, `results-desktop`, `results-comparison-desktop`, `results-phone`, `review-desktop`, `review-phone`, `dashboard-desktop`, `dashboard-phone`, `checkout-form-phone`, `checkout-pending-phone`, `checkout-pending-desktop`, `checkout-not-charged-phone`, `checkout-confirmed-phone`, `checkout-confirmed-desktop`.

## Performance (production build, `vite preview`, Lighthouse 13 mobile, re-run because shared code changed)
| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/rw` landing | 99 | 100 | 100 | 100 | 1.6 s | 0 ms | 0.058 |
| `/rw/tests` catalog | 98 | 100 | 100 | 100 | 2.1 s | 0 ms | 0 |

New lazy chunks (gzip): exam 9.2 KB, checkout 5.2 KB, dashboard 4.3 KB, results 4.2 KB, review 3.5 KB; none is in the landing path.

## Anything inert
"Practice Weak Areas" (results), "Practise weak areas" (review), "Start practice" and "Practise" (dashboard): practice runner not designed. "Change goal" / "Change" (dashboard): not designed. The phone menu button and "Sign in" link inside sign-up are still inert from Part 1.

---

# Part 3: Batch 1 designs (sign-in, account menu, phone navigation, new-user dashboard, unlocked details, guest paid, checkout edge states, country gate, system pages, multiple-select, practice, desktop time-up / offline)

Built from the 21 artboards `SignIn`, `SignInPhone`, `AccountMenu`, `NavPhone`, `DashboardNew`, `DashboardNewPhone`, `ExamDetailUnlocked`, `ExamDetailUnlockedPhone`, `GuestPaid`, `GuestPaidPhone`, `CheckoutStates`, `CheckoutStatesPhone`, `CountryGate`, `CountryGatePhone`, `SystemPages`, `SystemPagesPhone`, `MultiSelect`, `MultiSelectPhone`, `Practice`, `PracticePhone`, `TimeUpDesktop`. One responsive implementation per screen; every Tweaks state of each artboard is built (or listed below as unreachable). The owner's rule still applies: nothing without an artboard; undesigned follow-ups stay inert (`lib/routesReady.ts`) and are listed under "Missing designs hit".

## Per-screen status

| # | Screen | Route / where | Status |
|---|---|---|---|
| 1 | **C12 Sign-in** | `/sign-in` (`?next=` honoured, same-site only) | Done. Phone step, code step (6 boxes), all Tweaks states: invalid phone, wrong code (`triesLeft`), code expired, too many tries, no connection; resend countdown from `cooldownSeconds`; "Use a different number"; links to sign-up; header "Sign in" and SignUp's "Already have an account? Sign in" are live. State machine in `features/auth/signInModel.ts` (reducer + error mapping, unit-tested). |
| 2 | **C13 Header, account menu, sign-out** | Desktop header on every non-exam screen | Done. Country chip on every screen; guests: Sign in + Create account; signed in: avatar opens the menu (My progress, My access with days left, Exam country, Language, Help and support, Account settings, Sign out), keyboard: arrows, Esc returns focus. Sign-out asks first when a full mock test is running (`GET /api/attempts/in-progress`), else signs out at once and shows "You're signed out. Sign in again". |
| 3 | **C29 Phone navigation** | bottom tabs on Home, Tests, test details, Progress, Pricing, Account | Done. Signed-in tabs (Home, Tests, Progress, Account), the Account tab page (`/account`: profile card, the same rows, Sign out, sign-out sheet), guest menu sheet behind the hamburger (Mock tests, Pricing, Country, Language, Sign in, Create a free account). Replaces the old three-tab bar. |
| 4 | **C16 Dashboard new user + access states** | `/:country/progress` | Done. "Welcome, Aline", Start here (free test from `startHere`), empty Score history, More for your goal (`suggestedTests`), My access in five states (free only, payment pending, active, ending soon, expired) driven by `access.current/expired`, `endingSoon`, `pendingPayment`. The existing dashboard uses the same My access card. Phone order: Start here, My access, Score history, More for your goal. |
| 5 | **C30 Exam details unlocked** | `/:country/tests/:slug` when `access.state = GRANTED` | Done. Not started / In progress (Resume, answered, time left, "To start over, submit this attempt first.") / Taken before (Start a new attempt, "Review last attempt · 58%", attempts line). |
| 6 | **C17 Guest taps a paid test** | dialog on details (`?gate=paid`); start link and checkout link of a paid test as a guest lead to it | Done. Create account and continue / I already have an account (both return to the checkout of that test via `?next=`) / Try the free sample. |
| 7 | **C20 Checkout edge states** | `/:country/checkout` | Done: invalid number, declined, expired, provider unavailable (502), still pending (via "Check payment"), already has access. The desktop checkout now follows `CheckoutStates` (site header + 480 px column). "Number on another network" is unreachable (no backend rule, DECISIONS #71). Every failure says "You were not charged." |
| 8 | **C23 Country gate** | `/ug` (country not live), wrong country on `/ke/tests/...` | Done: country not open (waiting-list form, "You're on the list"), wrong-country page (See similar tests / Switch my account). |
| 9 | **C26 System pages** | unknown route, API 5xx, 503, 401 | Done: 404 (replaces the old redirects), "Something went wrong on our side" with Reference = request id (`JP-XXXX-XXXX`), maintenance (no time), session expired (links to sign-in). |
| 10 | **C3 + C5 Multiple-select, "Partly correct"** | exam, case exam, practice, review | Done: square checkboxes (`role=checkbox`), "Choose N" badge from `question.choose`, "Choose N." after the stem, live count, cap with "Unselect one to change your answer", navigator "answered" at 1 or more picks; review: "Partly correct" badge with half-filled icon, marks "1 of 2 marks", each choice marked; jump grid cell `7◐` and legend entry; the Incorrect tab lists partly correct answers. |
| 11 | **C1 Practice runner** | `/:country/exam/:attemptId` for `kind = PRACTICE` | Done. Untimed, Check answer (saves the answer, then asks `/check`), feedback + explanation, Next question, End practice, summary ("Practice answers don't change your mock test scores"). "Practice Weak Areas" (results), "Practise weak areas" (review), "Start practice" and "Practise" (dashboard) are live. Practice results reuse the results screen (no comparison / history). |
| 12 | **C7 + C8 Desktop time-up and offline** | exam | Done. Desktop time-up: the exam stays in view, dimmed, behind the "Time is up" dialog (greyed Submit exam, 00:00, "Submitted"); phone keeps the full-screen version. Offline: banner "…kept on this computer and will save when you reconnect. The timer keeps running." with dashed outlines for waiting answers and "Answered, waiting to save (N)"; "Back online. Your N waiting answers are saved." |
| 13 | Router / flags | `routes.tsx`, `lib/routesReady.ts` | Done. `practice` is `true`. Root route with `HydrateFallback`: the "No `HydrateFallback` element" console warning is gone. Unknown routes show the 404 page. |

## Shared changes
- `api/client.ts`: `ApiError.requestId` (body `requestId` or `X-Request-Id`); 503 and bare 502/504 set the maintenance state; a 401 on a call that needs a session (browser has the session hint) sets "session expired" (`lib/systemState.ts`, rendered by `SystemGate` in the root layout; it clears when the user goes elsewhere). `GET /api/me` answering 401 while the hint exists also shows it.
- `components/layout/Header.tsx`, `GuestMenuSheet`, `PhoneTabBar`, `SignedOutNotice`; `features/account/*` (menu, Account tab page, `useSignOut`); `components/StrokeIcon.tsx`.
- `CountryLayout` waits for the country list and the session before asking the API for country data (this also removes the 404 the browser logged for `/ug` and `/ke` before: API_GAPS #5), shows the gate pages, and no longer redirects unknown countries or paths.
- `QueryError`: a 5xx shows the system "Something went wrong" page with its Reference and a working Try again.
- Country picker: "Notify me when X opens" is now a link to that country's waiting-list page.
- `Dialog` unchanged; test `renderWithProviders` now uses a data router (`createMemoryRouter`).
- Added i18n keys: none (the UI copy is the artboards', in English, as in Parts 1 and 2).

## Copy deviations (every one; the backend or the owner's rule wins over the artboard)
1. **Sign-in "It works for 10 minutes"** -> `expiresInSeconds` (currently "5 minutes"). "Codes work for 10 minutes. Send a new one below." -> the same sentence with the API's minutes.
2. **"3 tries left"** -> `triesLeft` from the API ("4 tries left", "1 try left"). With `triesLeft: 0` and with `too_many_attempts` the box says "Too many tries" / **"Request a new code."** instead of "For your security, wait 15 minutes before trying again." (there is no timed lockout). Verify is locked; the resend button follows the normal countdown and then reads "Send a new code".
3. **"Resend code in 0:42" / "Resend available in 15:00"** -> the API's `cooldownSeconds` (45) / `retryAfterSeconds` of a 429. `otp_cooldown` and `otp_hourly_limit` have friendly amber boxes in the same style ("Please wait a moment / You can ask for another code in 0:31.", "Too many codes / You have asked for too many codes. Try again in about 40 minutes."), not in the artboard.
4. **Invalid number** (sign-in, checkout, waiting list): "Enter a 9-digit {country} number, like {example}." with the country from the data.
5. **Practice line "15 questions · 20 min"** -> "{n} questions" (desktop: "Your weakest topic at 38%. 15 questions, with explanations after each one."). Practice is untimed.
6. **`[PRICE]`** is never shown: dashboard free card, pending card, GuestPaid and the checkout summary use the API price; when the country has none the clause or the price is omitted (checkout "Pay RWF 2,000" becomes a disabled "Pay"; no `KES [PRICE]` any more, which was Part 2 behaviour). **`[SUPPORT PHONE]`**: left out of the account menu's "Help and support" (no second line, item inert) and of the "Still waiting" card (that whole sentence is dropped). **`[TIME]`**: maintenance reads "We're making improvements. Your results, answers and access are safe." **`[SCORING RULE]`**: the line in the review is left out.
7. **Dashboard pending card**: "Approve it on your phone with your PIN" -> "Approve it on your phone." (JobPrep copy never mentions PIN entry). "to +250 788 123 456 at 21:05" comes from `GET /payments/:id` (number and time sent); left out if that call fails.
8. **CountryGate**: "Ugandan recruitment exams" -> "recruitment exams in Uganda" (no demonym in the data). The optional field "What are you preparing for?" is not shown (the API does not store it). Wrong country: the test title is left out ("The link you opened is for Kenya.", API_GAPS #15); the Full Access clause and note appear only when the user has Full Access.
9. **GuestPaid**: "the free 15-question Accountant sample" -> "Try the free 6-question Accountant (Public Institution) sample instead" (question count and profession from the API).
10. **Phone tabs**: Home goes to the country home page and Progress to the dashboard (the artboards mark Home on the dashboard and link Progress to a results screen; there is one dashboard).
11. **Headers**: the country chip shows on every desktop screen and non-landing guest screens get "Create account" (as in the Batch 1 artboards); "My progress" in the nav only for signed-in users.
12. **Dashboard**: "Welcome, Aline" for a user with no finished test, "Muraho, Aline" afterwards (Part 2). The goal line still shows the category name (API_GAPS #8).
13. **Practice**: a wrong multiple-select answer reads "Not quite — the answers are A, C"; a partial one "Partly correct" (not drawn); the summary says "1 question" for one; "Practise 15 more" practises the topic with most questions in the set (API_GAPS #21).
14. **Review**: "Choose N" = number of correct options (API_GAPS #14); the jump-grid cell and legend for "Partly correct" (`7◐`) are not drawn in an artboard (C5 grid): minimal, label plus shape.
15. **Account settings on desktop** = the phone layout in a centred column (only `ChangeCountryPhone` is drawn); `/account` on desktop is the same page as the phone Account tab.
16. **Checkout**: the desktop checkout follows `CheckoutStates` (heading "Get Full Access", inline Pay button); result cards use that artboard's summary ("JobPrep Full Access · Rwanda / Every Rwanda mock test · 30 days"); "Still waiting for confirmation" is shown after "Check payment" (API_GAPS #18).
17. **Unlocked details**: the sections table and "Your previous attempts" list are not part of the unlocked artboard and are not shown for a granted test; the attempts line reads "Attempts: 5+" when the API's list of five is full.
18. **Maintenance** is shown for 503 and for a gateway 502 / 504 without an API error body only; a dropped connection (offline) keeps the inline retry state, so an offline candidate never reads "JobPrep is being updated".

## Anything inert
- **Language** (account menu row, phone Account row, guest sheet toggle): drawn, no destination (no picker design, C22).
- **Help and support**: drawn, no destination, no second line (no page design, no number).
- **Change goal** / **Change** on the dashboard (C15) and **Request this exam** (C10, catalog empty state) stay inert from Part 2.
- "Number on another network" (CheckoutStates): unreachable.

## Missing designs hit (nothing was invented)
C22 language picker; Help and support page; C15 change goal; C10 request-this-exam form; C2 practice results (the existing results screen is used, comparison and history absent); C4 case passages in the review; C6 results edge states; C9 finished-attempt reopen (redirects to results); a desktop account page and profile editing; Terms / Privacy / Refund pages; a "Back online" banner for phones; a jump-grid cell and legend for "Partly correct"; a "Check payment" flow beyond the "Still waiting" card; the practice "Finish practice" confirmation and a "Partly correct" feedback panel (MISSING_DESIGNS C1 mentions them, the artboard does not draw them).

## API gaps
`docs/API_GAPS.md` items 13 to 21.

## Test results (2026-11-02)
| Command | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | 575 API + **255 web** + 2 shared, all pass. Web: 29 files (was 19; 142 tests before, 255 now). |
| `npx playwright test` (full, both projects, including the 2-minute offline runs and the 1-minute time-up runs) | **293 passed, 19 skipped** (phone-only / desktop-only cases), both projects, 11.9 min, no failures, no flaky retries. (An earlier full run had one failure, a race in the older catalog search spec; its wait was made robust and it passed 48 of 48 repeated runs.) |
| `npm run build -w @jobprep/web` | pass |

New web unit tests (Vitest + Testing Library), all in `apps/web/src`:
- `features/auth/signInModel.test.ts` (reducer and every error mapping: `triesLeft`, `too_many_attempts`, `code_expired` with the real lifetime, `otp_cooldown` / `otp_hourly_limit` with 429 seconds, offline, suspended, no account discovery, resend label) and `SignInPage.test.tsx` (the screen end to end with a stubbed API: countdown from `cooldownSeconds`, wrong code, locked Verify, expired, 429, offline, `?next=`, off-site `?next=` ignored).
- `features/account/accountMenuModel.test.ts` and `AccountMenu.test.tsx` (menu rows, inert Language / Help, Esc, navigation, sign-out at once vs with a test in progress, practice does not block, "You're signed out" notice, phone tabs, Account tab page).
- `features/dashboard/dashboardModel.test.ts` (access state mapping: new user, pending, active, ending soon, expired; card copy for each; no placeholders; practice line without minutes).
- `features/exam-detail/detailsModel.test.ts` (not started / resume / taken before, labels, best score, "5+").
- `features/country/CountryGate.test.tsx` (waiting list, wrong country, error-page Reference), `features/system/systemModel.test.ts` (reference format, copy, 5xx vs maintenance rules).
- `features/checkout/checkoutResults.test.ts` and updated `CheckoutPage.test.tsx` (every edge-state card, "You were not charged").
- `features/exam/examModel.test.ts` (multiple-select: cap at N, count line, the "Unselect one to change" message), `features/review/reviewModel.test.ts` (partial-credit labels, marks, option notes, grid mark).
- `features/practice/practiceModel.test.ts` and `PracticeRunner.test.tsx` (the runner state machine and screen, multiple-select options, the 5xx error page).

New Playwright specs (each runs in `desktop-1440` and `phone-390`, random `+250789xxxxxx` phones, independent, throwaway grants and payments removed through Prisma):
- `web-signin.spec.ts`: sign up via the API, sign out, sign in through the UI with the code from `GET /api/test/otp`; wrong code shows tries left; five wrong codes; invalid number; unknown number shows no "no account"; `?next=`; header and sign-up links; sign-out with a test in progress (Stay signed in / Sign out).
- `web-nav.spec.ts`: phone tabs and Account tab, guest menu sheet, desktop account menu and guest header.
- `web-access-states.spec.ts`: new-user dashboard, finished-test dashboard, access active / ending soon / expired / payment pending (grants and payments created through the API or Prisma), Start practice, unlocked details (not started -> in progress -> taken before), guest taps a paid test (dialog, sign-in back to checkout, start link, checkout link).
- `web-checkout-states.spec.ts`: invalid number, declined (`simulate decline`), expired (`simulate timeout`), provider unavailable (502 mocked), still waiting via "Check payment", "Send the prompt again", already has access, ending soon.
- `web-gates-system.spec.ts`: country not open and joined (also against the real waiting-list endpoint), wrong country (country list mocked: Kenya is not live), 404 route, forced 500 with the Reference, 503 maintenance, session expired through a cleared cookie and through a 401.
- `web-multiselect-practice.spec.ts`: the real seeded question (Secondary Mathematics S1-S3, Q7 "Select ALL the prime numbers"): pick, cap, count, answered mark, server-side `too_many_choices`, partly correct in the review and on the grid; practice end to end (results -> Practice Weak Areas -> answer -> check -> explanation -> end -> summary -> practise more), a whole set to the summary, `answer_first`.
- `web-offline-desktop.spec.ts`: desktop offline banner, dashed outlines, "Back online. Your 2 waiting answers are saved."
- `web-a11y-p3.spec.ts`: axe (WCAG A/AA) on sign-in (both steps), 404, country gate, guest dialog, new dashboard, account menu / tab, unlocked details, checkout result card, multiple-select, practice (question, feedback, summary), partly correct review.
- `web-timeup.spec.ts` now also checks the desktop dialog (dimmed exam behind it, greyed Submit, 00:00, "Submitted").
- Earlier specs updated because the screens they exercised changed: `web-account` (settings moved to `/account/settings`), `web-checkout` (result cards, desktop heading, guest dialog, no placeholder price), `web-country` (waiting-list page), `web-dashboard` (new states, enabled practice), `web-exam` (practice live, desktop offline wording), `web-exam-detail` (guest buy button, unlocked layout), `web-landing`, `web-signup`, `web-a11y-exam`.

Browser pass (Playwright MCP): every new screen and Tweaks state opened at 1440x900 and 390x844 (360 checked for horizontal scroll on sign-in, gate, 404, landing, catalog, guest dialog, checkout, sign-up: none); console and network checked. Fixes found that way: the country layout asked the API for a not-live country's data before the country list had loaded (404 in the console); the 404 page linked to `/totally/tests` for an unknown path; the avatar and the sign-in country chip failed WCAG "label in name" (axe); the unlocked details rendered its access card twice (desktop and phone copy); the time-up desktop spec found the clock hidden behind the dialog.

## Screenshots (`docs/screenshots/`)
`account-menu-desktop`, `signed-out-notice-desktop`, `sign-in-1-phone-{desktop,phone}`, `sign-in-2-code-desktop`, `sign-in-invalid-phone-desktop`, `sign-in-wrong-code-{desktop,phone}`, `sign-in-too-many-desktop`, `nav-account-tab-phone`, `nav-signout-sheet-phone`, `nav-guest-menu-phone`, `account-settings-phone`, `dashboard-new-{desktop,phone}`, `dashboard-active-{desktop,phone}`, `dashboard-access-{active,ending,expired,pending}-{desktop,phone}`, `exam-unlocked-notstarted-{desktop,phone}`, `exam-unlocked-inprogress-{desktop,phone}`, `guest-paid-{desktop,phone}`, `checkout-already-{desktop,phone}`, `checkout-provider-down-phone`, `country-gate-{desktop,phone}`, `system-404-{desktop,phone}`, `multiselect-{one,cap}-desktop`, `multiselect-cap-phone`, `review-partly-correct-{desktop,phone}`, `results-with-practice-{desktop,phone}`, `practice-{1-question,2-picked,3-feedback,4-summary}-desktop`, `practice-{1-question,3-feedback,4-summary}-phone`, `exam-offline-desktop`, `exam-back-online-desktop`.

## Performance (production build, `vite preview`, Lighthouse 13.6 mobile, headless Chrome)
| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/rw` landing | 98 | 100 | 100 | 100 | 2.4 s | 60 ms | 0.018 |
| `/rw/tests` catalog | 97 | 100 | 100 | 100 | 2.4 s | 60 ms | 0 |

Part 2 reported 99 / 98 (LCP 1.6 s / 2.1 s, TBT 0 ms); the small drop comes from the shared entry chunk now carrying the account menu, guest sheet, tab bar and the system pages (landing initial JS about 107 KB gzip against 96 KB, vendor chunk 84 KB). New lazy chunks (gzip): sign-in 3.5 KB, practice runner (inside the exam chunk, 12.7 KB in total), checkout 6.2 KB, dashboard 6.1 KB, details 5.7 KB.
