# JobPrep

Mock exam platform for recruitment exams (jobprep.nexvecta.com). Find a mock test → take it timed → see results → review answers → practise weak areas. Not a course platform.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Decisions and assumptions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Build progress: [docs/PROGRESS.md](docs/PROGRESS.md)

## Layout

| Path | What |
|---|---|
| `apps/api` | Node + Express + TypeScript API, Prisma schema, seed, tests |
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

Dev admins (OTP codes print to the server log): `+250788000001` system admin, `+250788000002` content editor (RW), `+250788000003` support.
