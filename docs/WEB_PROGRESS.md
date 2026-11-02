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
