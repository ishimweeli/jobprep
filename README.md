# JobPrep

Mock exam platform for recruitment exams (jobprep.nexvecta.com). Find a mock test → take it timed → see results → review answers → practise weak areas. Not a course platform.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Decisions and assumptions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Build progress: [docs/PROGRESS.md](docs/PROGRESS.md)

## Layout

| Path | What |
|---|---|
| `apps/api` | Node + Express + TypeScript API, Prisma schema, seed, tests |
| `apps/web` | React web app: the candidate screens, and the admin area at `/admin` (`src/admin`, loaded on demand) |
| `packages/shared` | Design tokens, Tailwind preset, i18n catalogues |
| `e2e` | Playwright specs (run at 1440×900 and 390×844) |
| `docs` | Spec, decisions, progress, acceptance screenshots |

## Quick start

```bash
cp .env.example .env
npm install
npm run db:up        # Postgres 16 on localhost:5433
npm run db:migrate
npm run seed
npm run dev          # http://localhost:4000/api/health
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test`.

Dev admins (sign in at `/sign-in` like any candidate; the code is emailed, or printed in the server log in dev, and `GET /api/test/otp?email=…` returns it when test endpoints are on): `system.admin@jobprep.test` (system admin), `content.editor@jobprep.test` (content editor, Rwanda), `support@jobprep.test` (support), `multi.role@jobprep.test` (content editor Rwanda + support). Their screens are at `/admin`.
