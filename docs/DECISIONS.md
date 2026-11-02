# Decisions and assumptions

Recorded so work can keep moving without blocking questions. Newest at the bottom of each phase.

## Phase 1 — Foundation

1. **Stack: Node + Express + TypeScript + Prisma + PostgreSQL, React (Vite) for the web app.**
   The original brief said Next.js; the follow-up said "postgres react node", so the web app is a React SPA and the API is a separate Node service. Backend first; `apps/web` is not started yet. Public pages that need SSR/SEO (landing, catalog) will be handled in the web phase (prerender or a thin SSR layer) — flagged because Lighthouse ≥ 90 is a requirement.
2. **Monorepo with npm workspaces:** `apps/api`, `packages/shared` (design tokens, Tailwind preset, i18n catalogues). No Tailwind installed yet — only the preset exists, ready for `apps/web`.
3. **Prisma pinned to 6.x** (7 and 8-rc change the config and client generation model; not worth the churn). TypeScript pinned to 5.9 for tooling compatibility.
4. **Postgres on host port 5433** to avoid colliding with a locally installed Postgres. A second database `jobprep_test` is created by `docker/init-test-db.sql`. Integration tests refuse to run unless the URL ends in `_test`.
5. **Scope of the two briefs.** The first brief is Rwanda-only; the second adds countries (Kenya, Uganda, Tanzania), M-Pesa and admin roles. The design includes all of those screens, so the schema and seed implement the superset. Rwanda is the only live country.
6. **`CASE_BASED` is a question type** (single-answer, must belong to a `Case`). Single-choice, multiple-select and case-based all sit behind one `QuestionTypeHandler` interface in `src/domain/scoring.ts`.
7. **Multiple-select partial credit:** each correct pick earns `marks / |correct|`, each wrong pick cancels one correct pick, floored at 0. All-or-nothing is the default.
8. **Money is stored as integer minor units** (`priceMinor`, `amountMinor`) with a per-country `currencyExponent` (RWF 0, KES 2). Price `null` = not set → checkout unavailable.
9. **Buying while active extends from the current end date** (no paid days lost). Grants are country-scoped (`AccessGrant.countryCode`); a Rwanda grant never unlocks Kenya. One grant per payment is enforced by a unique constraint, so a duplicate callback cannot double-grant.
10. **Late success after our timeout is honoured** (`EXPIRED` + provider success → `SUCCESSFUL` + grant). The customer was actually charged, so access wins over a neat state machine. Declined / failed / expired copy always says "You were not charged."
11. **Provider modes are seeded as `SANDBOX`, not `LIVE`,** for Rwanda's MTN MoMo and Airtel Money (the design's admin screen shows "Live"). We have no live merchant keys, and showing "Live" would be untrue. An admin flips them after real keys are configured.
12. **Seed content is compact, not the design's 50/45-question exams.** 14 tests, 83 questions: Secondary Mathematics S1–S3 has 20 (design shows 50), the Accountant mock 12 with a 5-question hospital case (design 45 / 10). Time limits are scaled to match. `totalMarks` is computed from the questions, never hardcoded. All answers and arithmetic are checked by integration tests. Real question banks are the owner's content work, reviewed by subject experts.
13. **Languages: tests are seeded English-only.** The design shows "English · Kinyarwanda" on some tests, but seeding machine-written Kinyarwanda risks wrong exam content. The `QuestionTranslation` / `CaseTranslation` tables exist; native-speaking editors add translations, and `MockTest.languages` should be updated when they do. UI catalogues (`packages/shared/src/i18n.ts`) have a small Kinyarwanda/Kiswahili set, falling back to English per key.
14. **Every Rwanda category has a free sample** (acceptance rule), including Government administration, Procurement and Other. Kenya (PREPARING) only has two tests; its go-live checklist should be computed from real data, so it will correctly show missing free samples instead of the design's ✓.
15. **No pass marks anywhere.** `passMarkPercent` + `passMarkSource` exist but are null for every seeded test; a test asserts this.
16. **Dev admins** are seeded (+250788000001 system admin, …02 content editor restricted to RW, …03 support). They sign in by OTP; with `SMS_PROVIDER=console` the code is printed to the server log. Replace before any real deployment.
17. **`npm run db:reset` uses `prisma migrate reset`,** which Prisma blocks when run by an AI agent without explicit user consent. It works when you run it yourself. Tests use their own `truncateAll` on the `_test` database instead.
18. **Design screenshots not exported.** The design is a private canvas, so I read each artboard's source (copy, tokens, data) directly instead of PNGs. `docs/design/` is empty; add PNGs there if you want pixel comparison in the web phase.

## Phase 2 — Auth and country

19. **Candidate auth is phone + OTP only, session in an httpOnly cookie** (`jp_session`, SameSite=Lax, Secure in production, 30 days). Only an HMAC of the token is stored. Cross-site use from the web app relies on same-site hosting (or a proxy), not on relaxing SameSite.
20. **OTP rules:** 6 digits, 5-minute TTL, 45 s resend cooldown, 5 requests/hour/phone, 5 wrong guesses burn the code, single use, bound to purpose (sign-up vs sign-in). Limits are counted in Postgres so they survive restarts. Codes are never in API responses; the console SMS provider prints them and a test-only endpoint (`/api/test/otp`, forced off in production) reads them. Per-IP limiting is Phase 8.
21. **Account discovery:** sign-up tells you if a number already has an account (409; needed for the "Already have an account? Sign in" UX). Sign-in returns the identical response for unknown numbers and sends no SMS.
22. **Sign-up only in LIVE countries.** Preparing/planned countries get a waiting list (`POST /api/countries/:code/waiting-list`, the design's "Notify me when Kenya opens"). The country is fixed by the phone's dial code + the chosen country and must match.
23. **Changing country** (`GET /api/me/country-change?to=` preview, `POST /api/me/country` with `confirm:true`): target must be LIVE. Grants, attempts and payments stay attached to their own country (access keeps running and returns if the user switches back); the job goal is cleared and language resets to the new country's default.
24. **Guest → account ("Save my result"):** `guestTokens` on sign-up/sign-in, or `POST /api/me/claim-attempts`. Only unowned attempts in the user's own country move; owned attempts are never taken.
25. **Suspended users** cannot sign in and their existing sessions stop working immediately.
26. **Admin sign-in is not built yet** (Phase 7); only the `Session.adminUserId` column and seeded admins exist.
27. **e2e against the dev DB creates throwaway users** with random +250789xxxxxx numbers; delete them with a normal `db:reset` when you like.

## Phase 3 — Discovery

28. **Public discovery endpoints live under `/api/countries/:code/…`:** `landing`, `mock-tests` (catalog), `mock-tests/:slug` (details), `pricing`, `exam-requests`. They return counts, marks and metadata only — never questions, options, answers or explanations (asserted by tests).
29. **Only LIVE countries are browsable.** Preparing/planned countries return 404 `country_not_available` for every public route, so Kenya's draft tests stay invisible until an admin flips it to live. This is the "Kenya user (country switched to Live in admin first)" acceptance step.
30. **A signed-in user only sees their own country** (403 `country_mismatch` otherwise); guests may browse any live country. Switching country goes through `/api/me/country`.
31. **Search:** every word must match (AND) in title, summary, category, profession or a topic (subject), case-insensitive. User-typed `%`, `_` and `\` are escaped so they match literally. Found by a test: Prisma does not escape LIKE wildcards, so `q=%` used to return everything.
32. **Counts come from published questions,** and the details page's section table and total marks are computed from them — not from the declared `totalMarks`. A draft question changes the numbers immediately.
33. **Exam details access state:** `FREE` (guest can start, no account), `GRANTED` (active same-country grant), or `LOCKED` (shows the database price, payment methods, and a free sample — same profession first, else any free test in the category). A pass mark is returned only when both percent and source are set; negative marking only when configured.
34. **Popular searches** come from a per-country setting (`landing.popularSearches:RW`, seeded from the design chips), falling back to the professions with the most published tests. The existing dev database was seeded before this setting existed, so it uses the fallback until the next reset.
35. **Title sort is byte-order** (Postgres collation), so punctuation sorts differently from a browser's locale sort. Acceptable for English titles; revisit if Kinyarwanda titles need locale-aware ordering.
36. **"Request this exam"** stores a row per request (no dedupe yet); the admin "requested 7 times" alert (Phase 7) will group by normalised query.

## Phase 4 — Exam engine

37. **Guests are identified by a secret `X-Guest-Token` header,** returned once when the attempt starts and kept by the web app in localStorage (`jobprep.guestTokens`, comma-joined in the header). Signed-in users are identified by their session. Anyone else, or a wrong token, gets 404 (not 403), so attempt ids can't be probed.
38. **One running attempt per person per test:** `POST …/mock-tests/:slug/attempts` resumes it (200, `resumed:true`) instead of creating a second; an attempt that ran out while nobody looked is closed first and a fresh one starts.
39. **Autosave is last-change-wins per field,** using the time the candidate made the change (client clock, clamped to never be in the future or before the attempt began). `selectedAt` and `flaggedAt` are stored separately so an old flag change never discards a newer answer. This makes the offline IndexedDB queue safe to replay out of order and in duplicate, and works across two devices. (Replaced the single `clientSeq` column by migration `attempt_answer_field_timestamps`.)
40. **Per-change results** (`saved` / `stale` / `rejected` with a reason) let the client drop acknowledged items from its queue. A batch is one transaction with a row lock on the attempt, so parallel saves and a simultaneous submit are safe.
41. **Late offline sync:** a change is accepted if the time it was made is no later than the deadline + 5 s grace, and the attempt is still running or was *auto*-submitted less than 10 minutes ago. Accepted late changes re-score the attempt and keep the original auto-submit time. This is how "go offline for 2 minutes, answers kept" and "Time is up … nothing you answered was lost" both hold. Trade-off: the client clock is trusted within those bounds. For a practice platform that is fine; a hostile client could back-date up to the deadline, not beyond.
42. **A manual submit closes the attempt for good** (409 `attempt_closed`). Submitting after the deadline is recorded as an automatic submit stamped at the deadline.
43. **Auto-submit happens three ways** so it never depends on the browser: lazily on any request that touches an expired attempt, on save/submit, and by a 30-second background sweeper in the server process (`sweepExpiredAttempts`). If the API is scaled to several instances they can all sweep; the row lock makes it safe.
44. **The attempt state endpoint never returns correct answers or explanations** (asserted by tests); those arrive with the results/review endpoints after submission.

## Not yet decided / needs the owner
- Real provider credentials (MTN MoMo, Airtel, M-Pesa) and callback secrets.
- Real SMS gateway for OTP and receipts.
- Legal copy for Kenya terms and refund policy (design's go-live checklist item).
- Subject-expert-reviewed question banks and Kinyarwanda/Kiswahili translations.
