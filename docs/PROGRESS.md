# Progress

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
