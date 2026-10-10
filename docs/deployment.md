# Deploy with Dokploy

`compose.yaml` runs two services: the Go application (`server`) and PostgreSQL 18
(`db`). The application image builds the Vite frontend and includes its compiled
files. Go serves the game, `/api/` and WebSockets directly on **port 8080**.
Both services share the project-scoped `app` network. No service publishes a
host port; Dokploy routes the public domain directly to Go. Run one application
instance: world presence, positions and chat are in memory.

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
   TRAEFIK_NETWORK=dokploy-network
   ```

   Generate a password with `openssl rand -hex 32`. `POSTGRES_PASSWORD` and
   `ALLOWED_ORIGINS` are required. For multiple public domains, list their exact
   origins separated by commas (scheme and hostname, plus port if nonstandard;
   no paths). Credentials are passed as separate PostgreSQL environment
   variables, so the backend password does not need URL encoding. Quote literal
   `$` characters with single quotes in environment files to prevent Compose
   interpolation.
3. Point the domain's DNS at the Dokploy host. In **Domains**, add your domain,
   select service **server**, container port **8080**, upstream protocol **HTTP**,
   path `/`, and enable HTTPS for the public domain.
   The browser uses the same domain for the game, REST API and WebSockets.
4. Use **Preview Compose** to verify the generated routing configuration. The
   `app` network must remain attached to `server` and `db`. Dokploy also attaches
   its ingress network to `server`. `TRAEFIK_NETWORK` selects that network for
   routing so Traefik does not choose the private database network. For isolated
   deployments, set it to the exact generated ingress network name shown in
   Preview Compose. Keep `db` off the ingress network and leave host ports
   unpublished.
5. Deploy. The startup order is PostgreSQL → Go, with readiness checks at each
   stage. Initial startup creates the database tables
   automatically; no separate SQL import or migration command is needed.
6. Open `https://learn.example.com/api/health`. It should return
   `{"status":"ok","storage":"postgres","players":0}` before anyone connects.
   Create a player, finish a learning task, and redeploy. The same browser should
   resume its player and saved progress.

Dokploy's [Compose domain documentation](https://docs.dokploy.com/docs/core/docker-compose/domains)
explains automatic Traefik labels and ingress networking. Compose does not
require an external network for local use; Dokploy adds the ingress network.

If upgrading from the earlier Nginx setup, change the domain's service from
`web` to `server` and its port from `80` to `8080`, then redeploy. The separate
`web` container is removed; the database service and named volume are preserved.
Do not delete the database volume during this update.

## What the database stores

| Table | Saved data |
| --- | --- |
| `accounts` | Player identity and progress JSONB: global XP, language evidence and FSRS schedules, completed course units and activity results; current narrative flags, inventory, reputation, bells, investigations, daily promises and expedition results; three narrative save slots and permanent quest/expedition reward ledgers |
| `sessions` | Hashed bearer credentials linked to accounts |
| `learning_events` | Immutable learning and narrative action requests, grading results and reward receipts used for idempotent retries and owned scene/activity proof |

Account updates and event receipts commit in one transaction, with account row
locks preventing concurrent retries from awarding duplicate rewards. A database
failure makes the API return a storage error and readiness return HTTP 503;
Compose always configures PostgreSQL rather than the development JSON store.

The three named save slots snapshot the narrative state and discovered quests,
including inventory, faction choices, investigation progress, cinematic markers,
personal days and expedition records. Loading a slot restores that story snapshot
within the same account. XP, vocabulary and phrase memory, FSRS schedules,
completed course units and activity results remain global to the account. The
quest and expedition reward ledgers also survive loading, so earning the same
discovery or agreement again cannot issue its XP twice. Save slots do not create
separate characters or restore an earlier learning record.
If restoring a slot withdraws the connected town's route, the server returns the
character to Lindenhafen. Its population limit still applies; a full destination
closes the world connection until the character can reconnect there.

Expedition choices and submitted neighborhood plans are graded and stored by the
server. Their completion claims cannot come from browser storage; an incorrect
practice retry preserves an already earned agreement. The café, market,
detective and delivery activities likewise keep submitted attempt receipts and
completed results on the server, with authored board state checked during
grading. Their unfinished board arrangements, scene cursor and pending submission
IDs remain browser-local, so switching devices does not reconstruct an unfinished
board even though its earlier submitted learning evidence and results survive.
Unsubmitted expedition drafts are browser-local too.

The `postgres_data` named volume survives container replacement and ordinary
`docker compose down`. Keep the Compose project name stable so redeployments
reuse that volume. Do not run `down -v` against production: it deletes the data.
Do not change the PostgreSQL major version without a database upgrade plan.
Changing `POSTGRES_PASSWORD` after initialization does not change the existing
database role's password; rotate the role password and backend configuration
together.

Users start with a browser-held session token and can save their account with
an email and password after five minutes of visible play, or from the menu.
Email/password login restores the same character and progress on another device.
Password recovery is not implemented; clearing browser storage before saving an
account loses access to that identity. Map positions, presence, chat and the
shared world clock's cycle reset on backend restart; the personal narrative day
and daily promise remain saved. Settings and unfinished activity boards are
browser-local. Existing development
`server/.data/state.json` files are not automatically imported into PostgreSQL.

## Local Docker Compose

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD in .env before starting.
docker compose -f compose.yaml -f compose.local.yaml up --build -d --wait
```

Open `http://localhost:8088`. The local override publishes the Go application on
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
docker compose stop server
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

Container logs rotate at 10 MB, retaining three files per service. Go runs as a
non-root user and serves precompressed frontend bundles, supports audio byte
ranges, and returns the app shell for browser routes. Unknown API routes and
missing assets return 404. API responses are never cached, and the app shell is
revalidated after deployment. The server does not log request URLs or WebSocket
session credentials.

Each frontend build embeds a release ID and writes `version.json`. Go reads it
at startup and exposes it through the uncached `/api/version` endpoint. Open
pages check once a minute while visible and when the user returns to the tab
or reconnects. When the deployed ID changes, a persistent notification asks the
user to **Refresh page**; the page reloads only when they click the button.
The compact notification reserves space above the app so controls stay clear;
**Later** dismisses it for the current page session.
Docker rebuilds this ID for backend source changes too. Failed checks retry
quietly. Vite development uses hot reload and does not show this notification.

Go's PostgreSQL integration checks run when `TEST_DATABASE_URL` points at a
disposable database. They cover concurrent idempotency, vocabulary/course
evidence, durable activity receipts, and profile/progress/session restoration
after recreating the backend store. Never use the production database for tests.
