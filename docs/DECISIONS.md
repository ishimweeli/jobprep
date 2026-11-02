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

## Not yet decided / needs the owner
- Real provider credentials (MTN MoMo, Airtel, M-Pesa) and callback secrets.
- Real SMS gateway for OTP and receipts.
- Legal copy for Kenya terms and refund policy (design's go-live checklist item).
- Subject-expert-reviewed question banks and Kinyarwanda/Kiswahili translations.
