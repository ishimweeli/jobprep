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
- Exam start, checkout and dashboard are not built (later phases); their buttons are inert.
- `/ke` (not live) redirects to the picker; the API correctly 404s its data, which logs a resource error in the console if the URL is opened before the country list arrives.
- Language switching UI is absent (UI catalogues are almost empty).
