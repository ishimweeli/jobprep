# Deploying JobPrep (jobprep.nexvecta.com)

Same two servers and the same zero-downtime model as the lessonplan apps.

```
users ─► Netcup gateway (nginx, TLS) ─┬─► Netcup   jobprep-1          weight 1
                                      ├─► Contabo  jobprep-1          weight 5
                                      └─► Contabo  jobprep-2          weight 5
                         Postgres (Netcup) ◄── PgBouncer on each box ◄── the app
```

- **One image, one container per replica.** The API also serves the built web app (`WEB_DIST_DIR`), so web and
  API are always the same version and the session cookie stays same-origin. **The admin area ships in this same image**: it is
  part of the web app, served at `https://jobprep.nexvecta.com/admin` (the static fallback hands `index.html` to every
  extension-less path, `/admin/*` included, and `/api/admin/*` is the API). There is no separate admin app, hosting, domain
  or cookie to set up.
- **Stateless replicas.** Sessions and OTP codes are in Postgres; nothing is kept on a container's disk. (The
  per-IP rate limiter is in memory, so each replica counts separately.)
- **Traffic reaches Contabo** through the gateway's weights. During a deploy the gateway drains one box at a time.

## A normal deploy

Push to `main`. `.github/workflows/deploy.yml` then:

1. **check**: typecheck + lint (GitHub-hosted).
2. **deploy-netcup**: build the image → `prisma migrate deploy` (once, direct DB connection) →
   `/opt/cross-box-deploy.sh` stops routing to Netcup, recreates `jobprep-1`, waits for 5 consecutive HTTP 200s
   from `/api/health`, then restores routing. Contabo serves the whole time.
3. **deploy-contabo**: build → `/opt/rolling-deploy.sh` recreates `jobprep-1`, waits healthy, then `jobprep-2`.

If a new replica fails its health check the script stops and leaves traffic on the healthy side.
**Migrations run while the old version still serves**, so they must be additive (add columns/tables first,
remove old ones in a later release).

## What lives on the servers (not in git)

| What | Where | Notes |
|---|---|---|
| App settings and secrets | `/opt/jobprep/.env` on **both** boxes | Owner = the runner user, mode `0600`. Do **not** make it root-owned: compose reads it as the runner and every deploy fails (this has happened before). |
| Migration connection | `/opt/jobprep/migrate.env` on **Netcup** | One line: `DATABASE_URL` straight to Postgres (port 5432), not PgBouncer. |
| TLS certificate | `/etc/letsencrypt/live/jobprep.nexvecta.com/` on Netcup | Issued once with certbot (webroot `/var/www/certbot`). |
| CI runners | one per box, registered to **this** repo | The existing runners belong to the lessonplan repo and cannot run this repo's jobs. Same user (`runner`, in the `docker` group) and the same sudo grants as the lessonplan runners. |

### Variables in `/opt/jobprep/.env`

Names only; the values come from the providers or are generated.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Through the box's PgBouncer (`host.docker.internal:6432`), with `?pgbouncer=true&connection_limit=10`. |
| `SESSION_SECRET` | Random, at least 32 characters. **Identical on every replica on both boxes**, or a user logged in on one is logged out on the next. |
| `PAYMENT_PROVIDER_MODE` | `sandbox` or `live`. `fake` is refused in production. |
| `EMAIL_PROVIDER` | `smtp`. `console` is refused in production. **Sign-up cannot work without it**: the verification code of a new account, password-reset links and payment receipts are emailed. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional: "Continue with Google". Set both or neither (the app refuses to start with only one). In the Google Cloud console create an OAuth client of type Web application and add the authorized redirect URI `<PUBLIC_API_URL>/api/auth/google/callback` (here `https://jobprep.nexvecta.com/api/auth/google/callback`). Without them the Google button is hidden (`GET /api/auth/providers` says `google:false`). |
| `PAWAPAY_API_TOKEN`, `PAWAPAY_CALLBACK_SECRET` | pawaPay, the live payment provider. Both are required in production (the secret at least 16 characters); the app refuses to start without them. |
| `PAWAPAY_BASE_URL` | Optional. Defaults to `https://api.pawapay.io`; the sandbox is `https://api.sandbox.pawapay.io`. |
| `MTN_MOMO_*`, `AIRTEL_*`, `MPESA_*` | Optional. The direct operator adapters, used only if `PAWAPAY_API_TOKEN` is left empty. Not required in production. |

| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_STARTTLS`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | The same Alibaba DirectMail SMTP account lessonplan sends from. Port 465 uses TLS from the start; other ports use STARTTLS when `MAIL_STARTTLS=true`. `MAIL_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS` are required when `EMAIL_PROVIDER=smtp`. |

| `INTERVIEW_PREP_ENABLED` | `true` turns on AI interview preparation (nav item, pages, the "Full Access + Interview prep" plan). Off by default. When on, the next three are required. |
| `OPENROUTER_API_KEY` | The interviewer (Claude through OpenRouter). The same key the daily content run reads on Netcup. Optional: `INTERVIEW_MODEL` (default `anthropic/claude-haiku-5.5`). |
| `GROQ_API_KEY` | Speech to text (Groq Whisper). |
| `DATA_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts interview transcripts, job descriptions and reports. **Identical on both boxes, and never changed** once interviews exist (old ones could no longer be read). Keep a copy outside the servers. |

`NODE_ENV`, `WEB_ORIGIN`, `PUBLIC_API_URL` and the port are set in the compose files.

Check the interview providers from a machine with the keys in the repo-root `.env`: `npm run interview:smoke -w @jobprep/api -- <a short recording of spoken English>`.

## Daily content from MIFOTRA

`.github/workflows/daily-content.yml` runs every day at 06:00 Kigali on the netcup runner. It reads the open MIFOTRA
adverts, writes the missing mocks (5 per job, 50 questions each) with the Claude Agent SDK through OpenRouter, keeps
only jobs that pass `prisma/pipeline/check.ts` in full, commits them to `main`, adds them to production with
`sync-content`, and emails a status report to the workflow's `REPORT_TO` (through the `MAIL_*` account).

- `OPENROUTER_API_KEY=...` must be in netcup's `/opt/jobprep/.env`; without it the run stops and the email says so.
- A manual run (Actions tab) is a real run unless "dry run" is ticked (writes and checks, saves and publishes nothing,
  still emails).
- Optional limits, as workflow env: `PIPELINE_MAX_JOBS` (4 per day), `PIPELINE_CONCURRENCY` (2),
  `PIPELINE_JOB_BUDGET_USD` (25 per job), `PIPELINE_MODEL` (`claude-opus-5-5`).

## Gateway

`deploy/gateway/jobprep.nginx.conf` holds the `jobprep_pool` upstream and the two server blocks.
Add them to the gateway on Netcup, and add `jobprep_pool` to `POOLS` in `/opt/lb/gen-nginx-configs.py`
(Netcup `127.0.0.1:18300`; Contabo `10.10.10.2:18300` and `10.10.10.2:18301`) so deploy-time draining
(`switch-traffic.sh contabo-only`) knows about it. Do **not** edit the live `nginx.conf` with `mv`/`sed -i`/`scp`:
that detaches Docker's bind mount and `nginx -s reload` then silently reloads the old config. Use `cp`.

## First rollout, in this order

The routing scripts assume Contabo already has the app, so the first time is done by hand:

1. DNS for `jobprep.nexvecta.com` → `159.195.218.176`.
2. Create the `jobprep` database and its own database role on Netcup Postgres; add `jobprep` to
   `pgbouncer.ini` on **both** boxes (Netcup → `127.0.0.1:5432`, Contabo → `10.10.10.1:5432`), reload PgBouncer.
3. Create `/opt/jobprep/.env` (both boxes) and `/opt/jobprep/migrate.env` (Netcup).
4. Register the runners; push once so the image builds and migrations run, or run the steps from `deploy.yml`
   by hand. Seed reference data (countries, plans) if the app needs it on an empty database.
5. Bring up **Contabo first** (both replicas), then Netcup. Check each `…:18300/api/health` returns 200.
6. Add the gateway pieces, issue the certificate, reload nginx, open the site.
7. From then on every push deploys itself.

## Before it can go live

- **Sign-in is email + password (and Google).** Accounts are identified by email; there is no SMS. The emailed 6-digit code is used once, to verify a new account, and password-reset links are emailed too, so **email must be configured for sign-up to work at all**: set `EMAIL_PROVIDER=smtp` and the `MAIL_*` values, and check that the sender address is verified in DirectMail, or new people can never finish signing up. Accounts that existed before passwords (made with the old emailed-code sign-in) have no password: they use "Forgot password" on the sign-in page once.
- **First admin.** Do not run the dev seed in production (it creates fake admins). After the migrations and the reference data are loaded, create the first real admin with
  `npm run admin:create -w @jobprep/api -- you@example.com "Your Name"` (needs `DATABASE_URL`; quote the name). An optional third argument sets a password for a NEW account (`... "Your Name" "a password of 8+ characters"`; it ends up in the shell history, so change it afterwards). Without it the account has no password and the first admin opens **Forgot password** on the sign-in page, gets the reset link by email, and chooses one (or signs in with Google if it is configured). Admins are not a separate account type (DECISIONS 88): this finds or creates the normal account for that email (Rwanda, English) and gives it an active, all-countries System admin role; an existing candidate keeps their history and other roles. The person signs in at the normal sign-in page with that address and password and must have signed in within the last 12 hours to use the admin area. Further admins are added from Settings, Admin team (that sends no email: the person opens Forgot password, or signs up, or uses Google with that address). `WEB_ORIGIN` must be exactly the origin the browser shows, because state-changing `/api/admin` requests with a different `Origin` header are refused (`bad_origin`).
- **Payment keys.** pawaPay needs an API token, and its dashboard must be given the deposit callback URL
  `https://jobprep.nexvecta.com/api/payments/webhooks/pawapay?token=<PAWAPAY_CALLBACK_SECRET>` (the `?token=` part is
  the only authentication, because pawaPay callbacks are not signed). The pawaPay adapter has never been run against
  pawaPay, so test it in the pawaPay sandbox first, and enable the countries and operators in the dashboard.
- **Backups.** The `jobprep` database must be added to the Postgres backup job on Netcup.

## Rolling back

Re-run the workflow on the previous commit (Actions → Deploy JobPrep → Run workflow, on that commit), or
`git revert` and push. A migration that already ran is not undone; that is why they must be additive.
