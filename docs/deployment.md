# Deploy with Dokploy

`compose.yaml` builds the frontend (Nginx) and Go backend and runs PostgreSQL 18.
All three services share the project-scoped `app` network. No service publishes
a host port; Dokploy routes the public domain to Nginx. Nginx proxies `/api/`,
including WebSockets, to the backend. Run one backend instance: world presence,
positions and chat are in memory.

## Configure Dokploy

1. Create a **Docker Compose** service, connect this repository and select the
   branch to deploy. Use `compose.yaml` as the Compose path and the repository
   root as the build context. Use Compose mode, not Docker Stack/Swarm mode.
2. In **Environment**, set these values:

   ```dotenv
   POSTGRES_USER=lernen
   POSTGRES_DB=lernen
   POSTGRES_PASSWORD=REPLACE_WITH_A_RANDOM_PASSWORD
   ALLOWED_ORIGINS=https://learn.example.com
   MAX_ZONE_PLAYERS=128
   ```

   Generate a password with `openssl rand -hex 32`. `POSTGRES_PASSWORD` and
   `ALLOWED_ORIGINS` are required. For multiple public domains, list their exact
   origins separated by commas (scheme and hostname, plus port if nonstandard;
   no paths). Credentials are passed as separate PostgreSQL environment
   variables, so the backend password does not need URL encoding. Quote literal
   `$` characters with single quotes in environment files to prevent Compose
   interpolation.
3. Point the domain's DNS at the Dokploy host. In **Domains**, add your domain,
   select service **web**, container port **80**, path `/`, and enable HTTPS.
   The browser uses the same domain for the game, REST API and WebSockets.
4. Use **Preview Compose** to verify the generated routing configuration. The
   `app` network must remain attached to `web`, `server` and `db`, alongside
   whichever ingress network Dokploy adds. Keep `server` and `db` off the public
   ingress network and leave their host ports unpublished.
5. Deploy. The startup order is PostgreSQL → backend → frontend, with readiness
   checks at each stage. Initial startup creates the database tables
   automatically; no separate SQL import or migration command is needed.
6. Open `https://learn.example.com/api/health`. It should return
   `{"status":"ok","storage":"postgres","players":0}` before anyone connects.
   Create a player, finish a learning task, and redeploy. The same browser should
   resume its player and saved progress.

Dokploy's [Compose domain documentation](https://docs.dokploy.com/docs/core/docker-compose/domains)
explains automatic Traefik labels and ingress networking. No external
`dokploy-network` is hardcoded in this repository, so the same file also works
for local Compose and isolated Dokploy deployments.

## What the database stores

| Table | Saved data |
| --- | --- |
| `accounts` | Player ID, name, avatar and progress JSONB: XP, quests, course units, vocabulary evidence, activity results and FSRS review schedules |
| `sessions` | Hashed bearer credentials linked to accounts |
| `learning_events` | Immutable learning requests, grading results and reward receipts used for idempotent retries |

Account updates and event receipts commit in one transaction, with account row
locks preventing concurrent retries from awarding duplicate rewards. A database
failure makes the API return a storage error and readiness return HTTP 503;
Compose always configures PostgreSQL rather than the development JSON store.

The `postgres_data` named volume survives container replacement and ordinary
`docker compose down`. Keep the Compose project name stable so redeployments
reuse that volume. Do not run `down -v` against production: it deletes the data.
Do not change the PostgreSQL major version without a database upgrade plan.
Changing `POSTGRES_PASSWORD` after initialization does not change the existing
database role's password; rotate the role password and backend configuration
together.

Users currently sign in with a browser-held session token. Email/password login
and account recovery are not implemented; clearing browser storage loses access
to that identity. Map positions and chat reset on backend restart. Settings and
unfinished mini-game boards are browser-local. Existing development
`server/.data/state.json` files are not automatically imported into PostgreSQL.

## Local Docker Compose

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD in .env before starting.
docker compose -f compose.yaml -f compose.local.yaml up --build -d --wait
```

Open `http://localhost:8088`. The local override publishes only Nginx on
`127.0.0.1:${WEB_PORT:-8088}`. If you change `WEB_PORT`, update
`ALLOWED_ORIGINS` to match. Deploy only `compose.yaml` in Dokploy.

Use the same two `-f` arguments for local `logs`, `ps`, `down` and other commands.

## Backups and recovery

For a live database, use PostgreSQL's logical backup tool. Run these commands
from the Compose project on the deployment host (use Dokploy's project name and
generated file location as applicable):

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > lernen.dump
```

Store dumps outside the deployment checkout and copy them to separate storage.
Schedule this command through your deployment infrastructure as needed. Raw
volume archives of a running PostgreSQL instance are not a replacement for a
consistent database backup; stop the database first if using volume archives.

To restore into an empty, separately initialized stack with matching database
and role names:

```sh
docker compose stop web server
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error' < lernen.dump
docker compose up -d --wait
```

Verify `/api/health` and a saved session after restoration. Test recovery on a
separate stack before relying on a backup. The browser token must still match
the restored `sessions` record.

## Verification

```sh
docker compose config --quiet
docker compose ps
docker compose logs --tail=100 server db
curl https://learn.example.com/api/health
```

Container logs rotate at 10 MB, retaining three files per service. The backend
runs as a non-root user. Nginx re-resolves the backend's Docker DNS address after
container replacement, and access logs omit query strings containing WebSocket
session credentials.

Go's PostgreSQL integration checks run when `TEST_DATABASE_URL` points at a
disposable database. They cover concurrent idempotency, vocabulary/course
evidence, durable activity receipts, and profile/progress/session restoration
after recreating the backend store. Never use the production database for tests.
