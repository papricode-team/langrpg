# Language world server

The Go service owns session credentials, player movement, region-scoped chat, curriculum grading, quest rewards, and FSRS vocabulary review state. One process hosts three freely selectable maps: `lindenhafen`, `waldruh` and `nebelstadt`. `MAX_ZONE_PLAYERS` defaults to 128 connected players **per map** and accepts values from 2 to 1000; this is a configured capacity limit, not a measured concurrency guarantee. Horizontal zone routing, account recovery, durable chat moderation/history, and a production rollout remain future work.

## Run locally

Install Go 1.26 or newer, then run from this directory:

```sh
go run .
```

The server listens on port 8097. Without `DATABASE_URL`, it atomically saves sessions, progress and learning events to `.data/state.json` (override with `DATA_PATH`). This is a single-process development fallback; do not run replicas against the same JSON file. The save file contains hashed session tokens rather than raw credentials. Losing the browser's raw token loses access to that demo account; there is no password or email recovery in this slice.

Set `STATIC_DIR=../web/dist` after `npm run build` to serve the compiled frontend directly from Go. Docker builds and includes that frontend automatically, using `STATIC_DIR=/app/public` and port 8080. With no `STATIC_DIR`, local Go development remains API-only behind the Vite development proxy.

The Vite frontend uses port 5187 and proxies `/api` to this server. Development browser origins are explicitly allowed: `http://localhost:5187`, `http://127.0.0.1:5187`, `http://127.240.77.9:5187`, and `http://localhost:8097`. Override `ALLOWED_ORIGINS` with a comma-separated list of exact origins. Browser-origin checks apply to REST and WebSocket upgrades; command-line clients without an Origin still require the same token for authenticated endpoints. No cookie authentication is used.

```sh
go test -race ./...
go vet ./...
# Optional disposable database integration check:
# TEST_DATABASE_URL=postgres://user:password@localhost:55441/lernen_test?sslmode=disable go test -race ./...
```

## PostgreSQL and Compose

Set `DATABASE_URL` to use PostgreSQL. Startup creates the three small schema tables: `accounts` (profile/progress JSONB), `sessions` (hashed credentials), and `learning_events` (requests and reward receipts). Each attempt or quest completion locks the account row and commits its receipt and progress in a single transaction. Duplicate attempt IDs return the saved grading outcome without awarding XP again. Reusing an ID with a different request returns HTTP 409.

From the repository root:

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD in .env.
docker compose -f compose.yaml -f compose.local.yaml up --build -d --wait
```

Open `http://localhost:8088`. PostgreSQL is stored in a named volume; it is not published to the host. The Go application serves the compiled frontend, REST and WebSocket connections on port 8080. Compose waits for database and application readiness health checks. Use `docker compose -f compose.yaml -f compose.local.yaml down` to stop; adding `-v` also deletes the database volume.

For Dokploy, choose a Docker Compose service, connect the repository, and use only `compose.yaml`. Configure the public domain on the **server service at internal port 8080, upstream HTTP** through Dokploy's Domains tab with public HTTPS. Set `ALLOWED_ORIGINS=https://your-game-domain.example` and a strong `POSTGRES_PASSWORD` in Dokploy Environment. Both are required. Compose passes credentials separately through `PGUSER`, `PGPASSWORD` and `PGDATABASE`, so passwords need no URL encoding. Both services retain the `app` network; only `server` needs Dokploy's ingress network. `TRAEFIK_NETWORK` pins routing to that network (default `dokploy-network`; override for isolated deployments). No host ports are published by the production file. See [deployment, backups and restore instructions](../docs/deployment.md). No remote deployment has been performed by this project.

Redis is deliberately absent from this first deployment because the current world has one Go process. Additional zone processes can add Redis for ephemeral presence/routing; learning data should remain transactional in PostgreSQL.

## API

All POST bodies use `Content-Type: application/json` and are limited to 8 KiB. REST auth is `Authorization: Bearer TOKEN`.

`GET /api/health` returns `{status:"ok",storage:"json-development"|"postgres",players:number}`. Readiness returns 503 if the database is unavailable.

`GET /api/version` returns `{version:string}` without session authentication and with `Cache-Control: no-store`. It reports the frontend build ID loaded from `STATIC_DIR/version.json` at startup and remains available during database outages. Restarting the same build preserves the ID; deploying a new build changes it, allowing an open frontend to offer a page refresh. API-only development and older builds without version metadata return 503; malformed metadata logs a warning and also leaves version checks unavailable.

`POST /api/session` accepts `{name,avatar:{hair,skin,outfit},level?:"A1"|"A2"|"B1"}`. Names contain 2–24 letters/numbers, spaces, dashes, underscores or apostrophes. Avatar values are safe palette names or hex-color strings, up to 32 characters. Returns `{token,player:{id,name,mapId,x,y,avatar},progress}`. A valid existing bearer credential with an empty body `{}` resumes its saved profile and progress; providing a full profile updates that account’s name/appearance while preserving progress. Connected players see these changes in snapshots. Creating a fresh session replaces no previous account. Keep the token in the browser and never log it or publish it in screenshots.

`GET /api/progress` returns the progress object directly:

```json
{
  "xp": 0,
  "completedQuestIds": [],
  "attempts": 0,
  "correctAttempts": 0,
  "items": {
    "a1-arrival-item-1": {
      "itemId": "a1-arrival-item-1",
      "stabilityDays": 0.8,
      "difficulty": 4.8,
      "repetitions": 1,
      "lapses": 0,
      "lastSeenAt": "2026-10-08T12:00:00Z",
      "dueAt": "2026-10-09T07:12:00Z",
      "modeStats": {
        "recognition": {"attempts": 1, "correct": 1, "unaidedSuccesses": 1}
      }
    }
  }
}
```

`POST /api/attempt` accepts `{id,itemId,exerciseId,answer,hinted,mode,questId?}`. `id` is a unique client-generated attempt ID (1–100 ASCII letters, digits, dashes or underscores). Modes are `recognition`, `production`, and `listening`. The server validates exercise/item/mode against the embedded `curriculum.json`, grades the submitted answer, then updates progress. A listening exercise may be submitted as `recognition` with `hinted:true` when only its transcript is available; this does not count as unaided listening mastery. A client `correct` field is ignored. Returns `{correct,xpAdded,duplicate,progress}`. Normalization is case-insensitive by default, uses NFC, collapses whitespace and ignores terminal `.?!`; authored exercises may opt into case sensitivity. German umlauts and ß remain meaningful. Accepted alternatives are explicitly authored in the manifest.

The server also embeds `course.json` when present and merges its canonical lexicon, units and exercises without replacing any existing story IDs. Attempts return `attemptId`, `correctedAnswer` and `reason` from the authored grading target. Optional `{activityId,runId,level}` fields bind an attempt to a known mini-game; the exercise must belong to that activity's authored level-specific pool.

Progress adds `words`, `exerciseStats`, `completedUnitIds`, `activities` and `recentAttempts`. Old JSON/JSONB saves receive these fields when read or updated; existing XP, quest completions and review cards remain intact. Authored `contextWordIds` mappings attach exposure targets to the original story exercises. A one-time persisted migration reconstructs their contextual exposure from saved phrase attempts without copying success, repetitions or stability into independent word cards. Old sentence success never invents word mastery.

`progress.revision` increases on each committed account mutation and is preserved in JSON/JSONB. Idempotent retries return current progress without incrementing it. Clients should ignore responses with a lower revision so an older exposure response cannot replace newer answer/course progress.

`words[lexemeId]` records exposures, contextual exposures, direct attempts, last-seen time, next encounter, FSRS summary and separate recognition/listening/production evidence. Contextual exercise `wordIds` record exposure even after a sentence is answered correctly; they do not grant retrieval evidence or schedule successful FSRS ratings for each word. Only an independently graded direct drill with `targetWordId` and item ID `word-<lexemeId>` can establish that word's modality evidence. These drills reuse the existing FSRS scheduler and store their cards in the item's memory. Assistance and transcript fallback keep their existing practice semantics.

A word's per-mode `evidence` includes attempts, correct answers, unaided successes, status, due date and stability. `retained` requires at least two unaided successes, two FSRS ratings, Review state and at least seven days of estimated stability. Early known answers do not increase stability. Overall `mastery:"retained"` requires retained evidence in all three modes; recognition alone cannot claim listening or production. Full FSRS cards are stored once in `items["word-"+lexemeId]`, while `words` contains compact summaries. These are transparent product thresholds, not a CEFR certification or proof that a learner will never forget the word.

`POST /api/exposure` records reading a displayed target without requiring an answer. Choose exactly one known context: `{exerciseId}`, `{unitId}`, `{activityId,level,scenarioId?}`, `{npcId}`, or `{wordIds:string[]}` with at most 36 known lexical IDs. Optional `level` verifies exercise/unit level. Exercise contexts resolve authored exposure words and the direct lexical target; an exact mission `scenarioId` resolves that scene's canonical `activityWordIds`, including German absent from its reused story exercise. Its activity and level must match. Without a scenario, an activity context resolves the known legacy exercise pool. NPC contexts use canonical `npcWordIds`. Call only for German actually displayed, and use visible word lists when only part of an atlas/unit is shown. Exposure awards no XP, creates no attempt or successful review rating, and cannot advance or postpone an established word card. The first exposure from each canonical context or sorted visible list is persisted idempotently; repeated rendering does not inflate it. The authenticated endpoint allows at most 120 requests per minute and returns `{xpAdded:0,duplicate,progress}`.

`POST /api/course/complete` accepts `{unitId}`. Completion requires the unit's exact required exercise, word and item evidence. Required lexical exercises need an unaided success in their own authored modality; required words need direct independent retrieval, while contextual skill exercises need a correctly graded answer. Completing a unit does not label all its words retained. Returns `{xpAdded,duplicate,progress}` and persists `completedUnitIds`; the canonical unit reward is issued once, including under concurrent retries.

`POST /api/activity/complete` accepts `{id,activityId,level,exerciseIds,attemptIds}`. `id` is the mission's `runId`; activity IDs are `cafe`, `market`, `detective` and `delivery`. Submit exactly three distinct exercise IDs from its four-target authored pool and the three saved successful attempt IDs for those targets. Each proof must belong to this account, activity and run. Completion checks immutable saved attempt receipts, so pausing has no time limit and remains valid after a server restart or later practice. Client scores and outcome claims are ignored. The server counts corrected answers from recorded failed attempts in the run and returns `{xpAdded,duplicate,reason,activity,progress}`. Progress keys use `activityId:level`; each successful new run increments its completion count, while the first completion alone rewards 20 XP at A1, 30 at A2 or 40 at B1. Reusing earlier proof under a new run cannot earn another completion. The recent-attempt history returned in progress is bounded to 256 entries per account; completion proof and corrected-answer counts use full immutable receipts in the learning-event store. Board actions establish comprehension: canonical production targets may use `recognition` only in a validated mission context with assistance, and production submissions from these boards are always supported practice. Direct word drills retain strict authored modes. Listening-to-recognition fallback also remains assisted.

`POST /api/quest/complete` accepts `{questId}`. Every required item must have at least one correctly graded attempt. Rewards are authored in the server manifest and issued once per quest. Returns `{xpAdded,duplicate,progress}`. Incorrect or invented content cannot earn a quest reward.

The scheduler uses the upstream `github.com/open-spaced-repetition/go-fsrs/v4` v4.0.0 implementation of FSRS-6, with desired retention 0.90, default baseline weights, a 365-day maximum interval, a single ten-minute learning/relearning step, and deterministic intervals. Each item keeps separate persisted cards for recognition, production and listening in `items[itemId].cards`. Correct unaided answers map to Good; errors map to Again. Assisted answers update practice counters without rating an FSRS card. They use a separate per-mode `practiceDueAt` encounter gate (one hour after correct supported practice; ten minutes after an error), so a supported-only item does not remain immediately overdue forever. `dueAt` is the earliest encounter after these gates; raw FSRS due dates remain in `cards` and never advance through assistance. Natural correct encounters before a Review card is due do not reschedule it or award repeated review XP. Every scheduled attempt stores the upstream FSRS review log and mode in its durable learning-event receipt. Baseline weights and retention are initial product choices; personal parameter optimization needs more learner history and future evaluation. The frontend can place due reviews into story encounters instead of presenting a repetitive flashcard queue.


## Multiplayer protocol

Connect to `/api/world?token=TOKEN&mapId=lindenhafen` with a secure `wss://` URL in production. The map query is optional: without it, the server uses the player's remembered map or Lindenhafen. Unknown map IDs are rejected before upgrade. WebSocket constructors cannot send an Authorization header, so the token is supplied during the initial handshake; configure proxy access logs to omit query strings for this route.

- Initial server message: `{type:"welcome",selfId,mapId,spawn:{x,y},players:Player[],messages:ChatMessage[]}`.
- Server snapshots at 10 Hz: `{type:"players",mapId,players:Player[]}`. Players include `mapId`; only occupants of that map receive its snapshots.
- Client travel: `{type:"joinMap",mapId:"waldruh"}`. Known regions are freely selectable without a CEFR gate. The server confirms entry with `{type:"map",selfId,mapId,spawn:{x,y},players:Player[],messages:ChatMessage[]}`. Apply the acknowledgement before its presence and history; `spawn` contains the authoritative current position, including a remembered return position. Invalid maps, full destinations or excessive travel return an error and keep the player in the current map.
- Client move: `{type:"move",mapId,x,y}` with normalized coordinates in `[0,1]`. Animate locally and send sampled current positions. The server caps aggregate motion at 0.24 world units/second with a small bounded startup/latency credit; large requested jumps are clipped. Movement tagged with another map is rejected.
- Client chat: `{type:"chat",mapId,message:"text"}`. Chat tagged with another map is rejected.
- Server chat: `{type:"chat",mapId,message:{mapId,id,playerId,name,text,at}}`. Only occupants of that map receive the message.
- Validation/rate errors: `{type:"error",error:"message"}`.

Chat contains 1–280 characters with no control characters and is limited to three messages per ten seconds. Successful map changes are limited to four per ten seconds, including changes requested by reconnecting with a different map query. Both limits follow the player across regions and recent reconnects. Reconnecting the same player replaces the older connection. Each outgoing queue is bounded, slow clients disconnect, and ping/timeouts detect dead connections.

The server remembers each player's map and separate positions in visited maps for up to ten minutes after disconnect. This in-memory cache is bounded to 4096 accounts and may evict older offline entries earlier. A region replays its last 50 chat messages on entry or reconnect; these histories have no ten-minute expiry, but reset on server restart. Map positions and rate windows also reset on restart. New or expired positions use the region's spawn: Lindenhafen `(0.52, 0.61)`, Waldruh `(0.52, 0.54)`, and Nebelstadt `(0.50, 0.55)`.

World positions and chat are transient; learner profiles, learning events, quest rewards and FSRS review state remain durable in PostgreSQL or the development JSON store. The current server validates movement bounds/speed and map membership; shared server collision geometry and horizontal zone scaling remain future work.

Curriculum answers are necessarily available to the client for learning feedback. Server grading and authenticated idempotency protect progress consistency, but this is not a high-stakes examination or cheat-resistant economy.
