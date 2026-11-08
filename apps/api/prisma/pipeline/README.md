# Daily MIFOTRA content pipeline

Runs every day with no human trigger. Goal: every job open on the MIFOTRA e-recruitment portal has at least 5 mocks (TARGET_MOCKS in scan.ts)
of exactly 50 questions on JobPrep, written to the real MIFOTRA pattern, live before the advert closes.

All commands run from `apps/api`. Work in a scratch folder `W` outside the repo (e.g. `/tmp/mifotra-<date>`).

1. **Scan.** `npx tsx prisma/pipeline/scan.ts W` — reads the open adverts, writes `W/worklist.json` and a context
   file per job (`W/job-<profession>.txt`: the advert text plus every existing question). If it says "0 job(s) need
   work", stop: nothing to do.
2. **Write.** For each job in the work list, one writer (a subagent) follows `prisma/pipeline/WRITE_BRIEF.md`, reads
   the job's context file, and writes part files into `W/out/<profession>/`:
   - `topups`: for each listed mock, exactly `need` questions in that mock's existing sections;
   - `newMocks`: each listed slug, with the listed `title` and `free`, 50 questions, 3–4 sections.
   Run several writers in parallel (one per job). Each must finish with
   `npx tsx prisma/pipeline/check.ts W/worklist.json W/out/<profession>` printing OK.
3. **Merge.** `npx tsx prisma/pipeline/apply.ts W/worklist.json W/out/*` — appends top-ups, writes new jobs to
   `prisma/seed-data/auto/<profession>.ts`, registers new posts in `jobs-registry.json`, updates closing dates.
4. **Verify.** `npm run typecheck`, `npm run lint` (repo root), and
   `npx vitest run test/unit` (apps/api). Then confirm every advertised job now has ≥ 5 mocks of exactly 50:
   re-run step 1 — it must report "0 job(s) need work" (except jobs where a writer could not verify enough facts:
   list those in the commit message).
5. **Ship.** Commit only the changed files under `apps/api/prisma/` with a message
   `Content: MIFOTRA adverts <date> — <n> new mocks, <m> top-up questions`, push to `main` (this deploys), wait for
   the deploy workflow to succeed (`gh run watch`), then run the **Sync content** workflow
   (`gh workflow run sync-content.yml`) so the new questions reach the production database, and wait for it.
6. **Report.** End with a short summary: adverts seen, jobs added, mocks written, questions dropped for lack of
   verification, anything that failed.

Rules: never delete or archive content in this routine; never touch files outside `apps/api/prisma/` (plus the
commit); if checks fail and cannot be fixed, do not push — report instead.
