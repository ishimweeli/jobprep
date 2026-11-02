# Deploying JobPrep (jobprep.nexvecta.com)

Same two servers and the same zero-downtime model as the lessonplan apps.

```
users ─► Netcup gateway (nginx, TLS) ─┬─► Netcup   jobprep-1          weight 1
                                      ├─► Contabo  jobprep-1          weight 5
                                      └─► Contabo  jobprep-2          weight 5
                         Postgres (Netcup) ◄── PgBouncer on each box ◄── the app
```

- **One image, one container per replica.** The API also serves the built web app (`WEB_DIST_DIR`), so web and
  API are always the same version and the session cookie stays same-origin.
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
| `SMS_PROVIDER` | `live`. `console` is refused in production. **See "Before it can go live".** |
| `MTN_MOMO_*`, `AIRTEL_*`, `MPESA_*` | Provider keys, plus the three `*_CALLBACK_SECRET` values (16+ characters each; the app refuses to start without them). |

| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_STARTTLS`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | The same Alibaba DirectMail SMTP account lessonplan sends from. **The API has no email code yet**: the settings are in place, but nothing reads them until a mailer is added. |

`NODE_ENV`, `WEB_ORIGIN`, `PUBLIC_API_URL` and the port are set in the compose files.

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

- **No real SMS sender exists yet.** `apps/api/src/server.ts` always creates `ConsoleSmsProvider`, which only
  prints OTP codes to the log, and production refuses `SMS_PROVIDER=console`. Sign-in is phone + OTP, so nobody can
  log in until a real provider is written and chosen (e.g. Africa's Talking, Twilio).
- **Payment keys.** MTN MoMo, Airtel Money and M-Pesa need real merchant keys, and each operator must be given
  `https://jobprep.nexvecta.com/api/payments/webhooks/<slug>` as its callback URL.
- **Backups.** The `jobprep` database must be added to the Postgres backup job on Netcup.

## Rolling back

Re-run the workflow on the previous commit (Actions → Deploy JobPrep → Run workflow, on that commit), or
`git revert` and push. A migration that already ran is not undone; that is why they must be additive.
