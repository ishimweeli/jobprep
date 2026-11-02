# Progress

> **Design rule (owner, 2026-11-02): nothing is built without a design.** Everything with no artboard is
> listed in [MISSING_DESIGNS.md](MISSING_DESIGNS.md). Phase 7 (admin) is blocked on items 18–32 there.

## Admin app (`apps/admin`) ✅ for every designed screen (2026-11-02)

Sign-in, Overview, Users, Exams & questions (with the question editor), Payments, Settings and Countries, desktop and
phone, built from the artboards and wired to the admin API. Navigation follows the role's permissions; a country-restricted
admin only gets their countries. Details, inert controls and deviations: [ADMIN_PROGRESS.md](ADMIN_PROGRESS.md).
Checked independently: typecheck and lint clean; `npm test` = 119 admin + 639 API + 255 web + 2 shared; admin and web builds succeed.
Agent-reported: `npx playwright test e2e/admin` 88 passed, 4 skipped; axe passes on every screen at both sizes.

**Inert until designed** (drawn as in the artboards, no handler): grant / extend access, suspend, send login code,
view as candidate, manual payment grant, CSV import, new mock test, save plan, save country, invite admin and role changes,
exports, and editing multiple-select or case-based questions (MISSING_DESIGNS A2–A6, A9, A10, A13, A14, A16).
The APIs for all of these are built and tested; they need a dialog (reason, transaction id, confirmation) to exist first.

## Phase 7 — Admin, backend ✅ (2026-11-02)

**Built** (`apps/api/src/routes/admin/*`, `src/admin/*`): admin sign-in; overview; users (list, filters, detail, grant/extend, suspend, un-suspend, send login code); payments (list, tabs, stuck, detail with timeline, check, manual grant); exams (list, test detail, publish, archive, create, edit), question editor (all types, validation, reports resolved on publish), categories, sections, topics, case studies, CSV import (dry run, row-level report); reports queue; countries (list, detail, go-live checklist, price, payment methods, disclaimer, legal flag); settings; admin team; audit log with readable sentences.

**Test results** (2026-11-02), API only: `npm test -w @jobprep/api` = **639 pass**, run twice (new: 29 sign-in, 168 permissions and country scope, 26 users/payments/overview, 40 content, 64 governance, 9 CSV). Typecheck and lint clean.
Highlights: all 51 admin routes are called as every role; blocked actions change nothing; a Rwanda-only editor cannot see or change Kenya; every state-changing route is proven to write an audit entry.

**Not built yet: the admin screens.** The designs exist for overview, users, exams and the question editor, payments, settings and countries (desktop and phone); none exists for admin sign-in or the dialogs (grant, suspend, manual grant, CSV import, category/test/case editors, invite) — see MISSING_DESIGNS A1–A18. A separate `apps/admin` app builds the designed screens only.

## Batch 1 designs — backend support ✅ (2026-11-02)
API changes for the new screens (DECISIONS 67–73): `triesLeft`, `code_expired`, "Choose N", untimed practice,
new-user dashboard fields, access states, checkout access summary, details `inProgress`, request ids.
`npm test -w @jobprep/api`: **303 pass**, run twice (24 new in `batch1.test.ts`; 4 older tests updated for the
changed behaviour). The Batch 1 **screens** are not built yet: a third frontend pass starts when the second
(exam, results, review, dashboard, checkout) finishes, so two agents never edit `apps/web` at once.

## Hardening, backend part ✅ (2026-11-02)
Per-IP rate limits, production configuration checks (see DECISIONS 64–66). `npm test -w @jobprep/api`:
**279 pass**, run twice for stability (27 new: 6 limiter unit tests, 21 hardening integration tests).
Also fixed a flaky payments test (a 4-digit PIN marker could match random ids).

## Web app, part 1 — public screens ✅ (verified 2026-11-02)

Landing, catalog, exam details, pricing, country picker, sign-up and the account / switch-country sheet,
built from the artboards (details in [WEB_PROGRESS.md](WEB_PROGRESS.md); API gaps in [API_GAPS.md](API_GAPS.md)).
Checked independently: `npm run typecheck`, `npm run lint` pass; `npm test` = 252 API + 47 web + 2 shared;
`npx playwright test` = 138 passed, 10 skipped (phone-only or desktop-only cases) at 1440 and 390.
Lighthouse mobile (agent-reported): landing 100/100/100/91, catalog 99/100/100/91; initial JS about 96 KB gzip.

**Not usable yet:** there is no sign-in screen in the design, so returning users cannot get in (C12), and there
is no sign-out (C13). Buttons whose next screen is not designed are drawn as in the artboards and inert.

## Phase 6 — Payments and access ✅ (backend; checkout, pending, confirmed and declined/expired are all designed)

**Built**
- `GET /api/me/checkout`, `POST /api/payments`, `GET /api/payments/:id`, `POST /api/payments/:id/check`, `POST /api/payments/:id/resend`, `POST /api/payments/webhooks/:slug`.
- MTN MoMo, Airtel Money, M-Pesa adapters and a fake provider; idempotent signal core; polling fallback; expiry; sweeper; SMS receipt; country-scoped 30-day grants with chained renewals.

**Test results** (2026-11-02)
| Command | Result |
|---|---|
| `npm run typecheck -w @jobprep/api` | pass |
| `npm run lint -w @jobprep/api` | pass |
| `npm test -w @jobprep/api` | 252 pass (60 unit, 192 integration; 37 are payment integration tests, 15 adapter unit tests, 4 coverage-chain unit tests) |
| `npx playwright test e2e/payments.spec.ts` | 6 pass, both viewports |

Covered with the fake provider: success, decline, operator failure, timeout, duplicate callback (grants once), replayed webhook x5, webhook racing the poller, callback after timeout (honoured), approval at the deadline (caught), forged and tampered signatures, idempotency keys, double-tap, send again, a Rwanda grant not unlocking Kenya, Kenya M-Pesa with a KES price, SMS gateway down, operator down.

**Not verified:** the real MTN, Airtel and M-Pesa sandboxes (need your keys and callback secrets).

## Phase 5 — Results, review, practice, dashboard ✅ (backend)

**Built**
- `GET /api/attempts/:id/result` — score ring data, correct/incorrect/unanswered, time spent, change vs previous attempt, history for the mini chart, per-topic performance with weak areas, "review these first", pass mark only with a source, guest flag for "Save my result".
- `GET /api/attempts/:id/review?filter=incorrect|flagged|unanswered|all` — options with correct and your pick marked, topic, explanation, tab counts, a jump grid over all questions, case passages.
- `POST /api/attempts/:id/practice`, `POST /api/countries/:code/practice` — weak-area practice sets; `POST /api/attempts/:id/check` — answer + explanation after each practice question.
- `GET /api/me/dashboard` — greeting, goal, resume, recommended practice, score history, strong / needs-work topics, recently completed (with attempt numbers), access.

**Test results** (2026-11-02)
| Command | Result |
|---|---|
| `npm run typecheck -w @jobprep/api` | pass |
| `npm run lint -w @jobprep/api` | pass |
| `npm test -w @jobprep/api` | 196 pass (39 unit + 157 integration; 25 are the new results/review/practice/dashboard tests) |
| `npx playwright test` e2e/results + e2e/engine | 8 pass, both viewports |

Numbers in the tests are hand-computed from the seed (e.g. 11 of 21 marks = 52.38%, second attempt 19 of 21 = 90.48%, +38.1 points; dashboard Statistics 3/8 = 38%). Mistakes caught while writing them were in my expectations, not the code (50% is under the weak-area cut-off).

## Phase 4 — Exam engine ✅ (backend; the exam UI is in the frontend track)

**Built** (`apps/api/src/services/attempts.ts`, `routes/attempts.ts`)
- `POST /api/countries/:code/mock-tests/:slug/attempts` start or resume (free for guests; paid needs a same-country grant → 401 `sign_in_required` / 402 `full_access_required`).
- `GET /api/attempts/:id` full exam state (questions without answers, case passages and tables, saved answers and flags, server timer); `GET …/timer` clock resync; `GET /api/attempts/in-progress` resume prompt data.
- `PUT /api/attempts/:id/answers` autosave batches (≤100) with per-change results; `POST …/submit` (optionally flushing last changes), idempotent.
- Server-authoritative timer, auto-submit at time-up (lazy + sweeper), late offline sync with re-scoring, per-topic breakdown stored on submit, negative marking only when configured, multiple-select partial credit, case-based questions.

**Test results** (2026-11-02)
| Command | Result |
|---|---|
| `npm run typecheck -w @jobprep/api` | pass |
| `npm run lint -w @jobprep/api` | pass |
| `npm test -w @jobprep/api` | 171 pass (39 unit + 132 integration; 38 are the new engine tests) |
| `npx playwright test` (API specs) | 32 pass, both viewports, against the real server |

Engine tests cover: guest/paid/expired-grant/wrong-country/draft start rules, resume, ownership (404s), per-field last-wins and out-of-order replay, future/invalid timestamps, validation, 8 parallel saves, timer on the server clock, time-up auto-submit, the sweeper, grace window, offline sync after time-up (kept, re-scored, bounded), manual-submit lockout, scoring incl. partial credit and negative marking, simultaneous submits, case-based exams, another-device resume, guest → account.

**Not yet verified in a browser:** refresh mid-exam, offline mode for 2 minutes, and timer expiry through the real UI (IndexedDB queue, "N answers waiting to save"). Those need the exam screens (frontend track).

## Phase 3 — Discovery ✅ (backend)

**Built**
- `GET /api/countries/:code/landing`: categories with test counts (Teaching first), featured teacher tests, recently added, popular searches, price summary, disclaimer.
- `GET /api/countries/:code/mock-tests`: search by job title / subject / category (AND across words), filters for category, price, difficulty, language and subject, sort, pagination, facets for the filter UI, and an empty state that can request the exam.
- `GET /api/countries/:code/mock-tests/:slug`: facts, section table, instructions, the "no official pass mark" flag, free / granted / locked access state, database-driven price and payment methods, the free sample for locked tests, and the signed-in user's previous attempts.
- `GET /api/countries/:code/pricing` and `POST /api/countries/:code/exam-requests`.
- All of it country-scoped, live-countries-only, published-only, and answer-free.

**Test results** (2026-11-02)
| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | 133 pass (131 API: 39 unit + 92 integration; 2 shared) |
| `npx playwright test` | 26 pass (13 specs × desktop-1440 and phone-390), against the real server |

A real bug was caught by the tests: search treated a typed `%` as a wildcard and returned every test; wildcards are now escaped.

**Screenshots:** none — still no UI. The Playwright MCP browser pass starts when the React app exists.

**Known gaps**
- The React app (landing, catalog, details, pricing screens and their phone versions) is not built, so nothing here is checked against the design visually yet.
- Catalog search is `ILIKE`-based, fine at this size; Postgres full-text search can replace it if the catalogue grows.
- Previous attempts and "resume in progress" depend on the attempts API (Phase 4).

## Phase 2 — Auth and country ✅ (backend)

**Built**
- Candidate sign-up and sign-in by phone OTP: `POST /api/auth/otp/request`, `/sign-up`, `/sign-in`, `/sign-out`; `GET/PATCH /api/me`.
- Country choice: sign-up in live countries only, waiting list for the rest, `GET /api/countries/:code/categories` for the job-goal picker (only that country's categories).
- Change country with a preview endpoint (access days left, results kept) and explicit confirmation; access stays country-scoped.
- Guest → account claiming (on sign-up/sign-in or later), country-checked and never stealing owned attempts.
- `SmsProvider` interface with a console provider; test-only OTP endpoint; zod validation and consistent error codes.

**Test results** (2026-11-02)
| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | 94 pass (92 API: 39 unit + 53 integration; 2 shared) |
| `npx playwright test` | 12 pass (6 specs × desktop-1440 and phone-390) |

A real bug was caught by the tests: OTP `createdAt` used the DB clock while cooldown/expiry used the app clock; it now uses the app clock.

**Screenshots:** none — still no UI.

**Known gaps**
- No per-IP rate limiting yet (Phase 8). Admin OTP sign-in is Phase 7.
- No React app yet, so the sign-up screens (S1, S1m, S2m, C1) are not built.

## Phase 1 — Foundation ✅ (backend)

**Built**
- Monorepo (npm workspaces): `apps/api`, `packages/shared`, `e2e/`, `docs/`.
- `docker-compose.yml` — Postgres 16 on host port 5433, dev DB `jobprep` + test DB `jobprep_test`. `.env.example` documents every variable; no secrets committed.
- Prisma schema covering the full data model (countries, authorities, categories, professions, exams, mock tests, sections, topics, questions with type + JSON payload, translations, cases, attempts, answers, users, OTP codes, sessions, access grants, payments + events, plan config, payment methods, waiting list, exam requests, question reports, roles, admin users, audit log, translations, settings). One initial migration.
- Seed: Rwanda (live, RWF 2,000, MTN MoMo + Airtel Money sandbox, English + Kinyarwanda), Kenya (preparing, KES, no price, M-Pesa sandbox), Uganda and Tanzania (planned). 14 mock tests, 83 questions with explanations, including Secondary Mathematics S1–S3 (with a partial-credit multiple-select question) and the Accountant mock with the Umucyo hospital case study.
- Domain logic with no framework dependencies: scoring (three question types behind one interface, per-topic results, weak topics), server-authoritative timer, access grants (country-scoped, extend-on-renew), pricing/formatting, idempotent payment state machine, phone normalisation, admin permission map.
- Express API: `GET /api/health`, `GET /api/countries`, `GET /api/countries/:code` (price/currency/duration/payment methods from the database). Env validated with zod; test endpoints and fake providers are refused in production.
- `packages/shared`: design tokens, a Tailwind preset (not yet consumed), i18n catalogues with English fallback and DB overrides.
- Playwright config with 1440×900 and 390×844 projects; API smoke spec.

**Test results** (run on 2026-11-02)
| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | 61 tests pass (59 API: 39 unit + 20 integration against a real Postgres test DB; 2 shared) |
| `npx playwright test` | 6 pass (3 specs × desktop-1440 and phone-390) against the real server and the seeded dev DB |

**Screenshots:** none — Phase 1 has no UI. The Playwright MCP browser pass starts with Phase 3 (discovery screens).

**Known gaps / carried forward**
- No auth, attempts, payments or admin endpoints yet (Phases 2, 4, 6, 7).
- `apps/web` (React + Vite + Tailwind) not started; SSR/prerender approach for Lighthouse decided there.
- No coverage threshold set yet; `vitest --coverage` is configured for `src/domain`.
- `npm run db:reset` must be run by you (Prisma blocks it for AI agents); see DECISIONS #17.
- Seed content is compact versions of the design's tests (DECISIONS #12), English only (#13).

**Run it locally**
```bash
cp .env.example .env
npm install
npm run db:up                      # Postgres via docker compose
npm run db:migrate                 # apply migrations (first time creates dev DB schema)
npm run seed
npm run dev                        # API on http://localhost:4000
npm run typecheck && npm run lint && npm test && npx playwright test
```
