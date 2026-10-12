# Playable language missions

Four activities contain **48 authored scenes**: twelve per activity, with four scenes at each of A1, A2 and B1. A mission selects three distinct scenes. This is contextual practice, not a CEFR assessment.

| Activity | The player actually does | Consequences |
| --- | --- | --- |
| Lantern Café | Builds a tray with quantities, performs an ordered kitchen sequence, chooses indoor seating, takeaway or a reservation time | Extra ingredients, missing milk, wrong preparation order or the wrong service keep the order open |
| Midnight market | Collects goods, completes an exchange, stays within a budget, chooses the requested payment method and counts change | Overpriced goods exceed the purse; changing a basket clears the previous change; buying substitutes does not count as an agreed trade |
| Evidence room | Selects evidence slips and places them into a connected reconstruction board | Each slip can occupy one place; every required witness, event or conclusion must fit before the case is accepted |
| Letters through the mist | Chooses a recipient, connection and departure, turns through a road network and visits a checkpoint | Buildings and water block movement; the damaged bridge requires help; the wrong recipient, transport or time cannot complete delivery |

The boards use native buttons throughout, with optional dragging for inventory and evidence. Touch targets are at least 44 pixels. Every drag has a tap alternative. Delivery also supports arrow keys while the board has focus. Kitchen actions, stock, evidence, sentence tiles and encounter choices shuffle on replay. Painted noun sprites and forest-glass panels share the world's visual language.

## Lantern rounds

The repeatable roster is registered in `web/src/minigames/catalogue.ts`: Re-ink, Lantern Lighting, Marta's Tray Rush, Fritz's Numbered Apples, Otto's Departure Board, Brass Stamp, Lina's Sorting Office, Word Lantern Chain, Emil's Workbench, The Kettle Forecast, Greta's Seed Packets, The Lost Hour, 17:59, The Looping Tape, Seven Chairs, Ada's Alphabet, Neighborhood Boards and Courtyard Delivery Run.

The first eight games supply short retrieval sessions. Story games filter their pool to the associated syllabus scene and reuse installed scene exercises when every mapped word has returned. They are available from their hosts and the journal. Street lamps open Lantern Lighting after dusk; the inn desk offers Re-ink. A game with insufficient restored vocabulary explains its prerequisite instead of introducing words outside the intake budget.

The Lost Hour, Greta's Seed Packets and 17:59 use authored scripts in `web/src/minigames/story-scripts.json`, mirrored into the server's grading manifest. Lost Hour has twelve perfect-tense events whose connectors determine the twelve five-minute slots before midnight; only an accepted placement advances the clock. Seed Packets pairs twelve painted plant motifs with moments in Voss's story and grows them along the old railway, then asks for three spoken addresses, including their house numbers. The first memory ledger visit records supported practice; returning players can retrieve the associations without the ledger. 17:59 plays four overlapping announcements, saves each reconstructed time/platform/destination/status row, then offers four tickets. Arrival is at 18:00: the ticket printed 18:00 refers to the train that actually leaves at 17:59, the next is cancelled, and the third goes to the wrong town. Only the 18:15 Waldruh connection works. These boards submit the actual chosen slot, packet, address, announcement fields or ticket against 32 canonical decisions; wrong answers, transcripts and replays preserve honest help flags.

`MiniGame` supplies `mount`, `pause`, `resume` and `destroy`. The shared Phaser scene supplies lighting, clock, stamp and reel feedback inside the native dialog; DOM object controls and paper props preserve touch access, screen-reader access, keyboard focus and IME typing. The world renderer sleeps during dialog games. Word pools rank the requested modality's due evidence first, then unseen evidence, then increasing stability. Same-topic and same-article distractors are shuffled with a reproducible per-session seed.

Listening begins only after the cue finishes. Replays, clarification, exposed ink, scaffolds beyond edges and repeated attempts are supported evidence. Picture choices never carry German or English answer labels. Abstract recognition choices use meanings rather than matching an identical printed word. A miss reveals the correction and returns after two other turns. Pausing stops speech and clocks; closing cancels input, scene animation and pending confirmation. Submitted evidence can finish saving without rebuilding a closed game. Touch, 1–6, arrows, Enter and standard controllers operate the same controls. Choice answers have a 300 ms change window; spelling inputs retain umlaut keys and the existing typing scaffold.

Compound café orders submit an item and a quantity separately. Sorting and stamp games submit the actual article/plural/initial choice, and B1 stamp waves use restored grammatical case exercises. Tape transcription records its authoritative sentence answer and unambiguous content-word tokens, including actual inflected forms; the server checks those forms against the authored recording context. Name correction in the kettle game is free alphabet practice and supplies no lexical evidence.

Numbered Apples uses three falling lanes and a moving crate. Touch lanes, swipes, arrow keys and controller buttons move the crate; a collision submits the actual caught choice, and an empty or unattended lane submits a miss. The fall waits for speech and freezes on replay or pause. Numeric aliases never create identical distractors. Departure Board has independent split-flap Zeit, Gleis, Nach and Hinweis columns and a lever. Each available field maps its actual selected value to a restored lexeme; fields without a usable restored pool stay neutral and produce no invented evidence. Both playing layouts were checked at 1280×720 and 390×844 with their footers accessible and 44 px controls.

The host coalesces simultaneous answers into arrays of up to 30 at `/api/attempt`. Short batches permit server-authoritative feedback after each decision. Each answer owns an immutable receipt ID; a partial retry preserves successful siblings and resends failed evidence. The existing single-answer API remains compatible. The server validates the game, modality, restored targets and canonical lexical/form answers. Correctness supplied by a client is never used.

Neighborhood plans now place draggable or tappable resource tokens on region paintings. Every region and level has two or three valid allocations, matching its revised German brief and server manifest. All 180 encounters now have reviewed recognition/listening mappings, and all 129 planning fields across thirty scaffolds save supported recognition after an actual changed placement. Every required contextual word must be restored; other practice is explicitly exposure-only. The server binds each attempt to the exact region, scaffold, field and chosen label/value. Spoken labels do not count as listening. Encounters begin with a neutral reading/listening choice, hide the listening cue and require complete audio before answering; transcript, replay and prior reading count as help. Courtyard Delivery Run uses the actual navigation graph and player feet, marks lantern checkpoints, grades reached directions after speech, and hands the parcel to the recipient only after the last saved direction.

`GET /api/retrievals` reports attempts per credited active hour, per-game attempts, supported recalls and form evidence. Session summaries show the local round's rate and longest chain; weekly chain records are scoped to the player. The 60–120 retrievals-per-hour pacing target and retention gates require player telemetry and later retention observations; passing code and layout tests does not establish those gates.

## Item art and audio

The shipped library contains 181 distinct concrete noun sprites, 27 props (including three lantern states, four walking-lamp poses and nine flap stages), six cast action poses, six action portraits and Emil's workbench painting. Item masters are 512 px with native alpha; runtime exports are 256 px sprites and 256/128 px TexturePacker atlases. Missing or mismatched art fails `npm run check`. Game pools requiring pictures exclude unmapped nouns. Art prompts, generated sources and semantic frame names are retained in `docs/prompts/minigames` and `art/source/minigames`.

Use `npm run items:plan`, `npm run items:prepare` and `npm run items:check` to plan, pack and audit assets. `scripts/generate-audio.mjs --minigames-only` regenerates the game speech, 31 authored story cues, all 30 expedition briefs and 180 encounter cues, preserving the full pronunciation manifest. Twelve deterministic foley clips live in `/audio/ui`; speech ducks the world's music and respects silent mode. The item-art audit checks speech against the current briefs as well as frame identity, dimensions, alpha, sources and missing assets.

For deterministic layout checks, the Vite development server provides `/qa/activity-layout.html`. Select any of the 48 scenarios, optionally populate its board, choose a playing or completion screen, and press **Open**. This mounts the real activity component in its native dialog, uses only an isolated `layout-qa-only` local-storage session, and simulates submission without a world connection or player learning record. The fixture is not included in the production build.

## Integration

`activities.ts` imports its own CSS and exports `activityDefinitions`, `activityScenarios`, `activityAudioJobs`, `ActivityId`, `ActivityContext`, `ActivityCompletionContext`, `MountActivityOptions`, and `mountActivity`.

```ts
const controller = mountActivity(container, {
  id: 'cafe', level: 'A1', progress, sessionKey: playerId,
  speak,
  submit: async (exercise, answer, hinted, mode, context) => {
    // POST /api/attempt using context.attemptId as id and also send
    // context.activityId, context.runId and context.level.
    return { correct, progress, xpAdded, attemptId };
  },
  complete: async context => {
    // POST /api/activity/complete with id=context.runId, activityId,
    // level, exerciseIds and attemptIds. These contain exactly three
    // successful current-run targets and their stored attempt IDs.
    return { progress, xpAdded, duplicate };
  },
  onProgress: updateProgress,
  onSceneVisible: (_exerciseId, context) => recordExposure(context),
  onClose: closeNativeDialog,
});
```

The host owns the outer native dialog, world input gate and global profile/progress. The controller exposes `destroy`, `pause`, `resume` and `reset`. Optional `onDelivery({scenarioId,name,recipient,level})` lets the world host show an arrival after the route board is solved. `onSceneVisible(exerciseId, {activityId,level,scenarioId})` reports only the displayed playing scene, once per mount; paused/resting/discovery screens and future scenes do not expose targets. The host calls `/api/exposure` with that exact scene context so the course catalog records its matched word exposure. Seeing contextual words does not itself establish recall mastery.

## Grading and honest learning evidence

The pure reducer never submits answers on inventory, coin, evidence or movement clicks. `evaluateActivity` produces an original canonical exercise answer **only when all task conditions are demonstrated**. A wrong board produces a distinct diagnostic answer, goes through the real server grading callback and stays open for correction. Every scene has one existing canonical Exercise ID; there are four valid targets per activity and level.

Board actions demonstrate contextual understanding. They always submit `mode: recognition`. Targets originally authored as sentence, typed or listening exercises additionally submit `hinted: true`, because a printed task and object manipulation do not demonstrate unaided production or unaided listening. Asking for English clarification and receiving corrective feedback also mark retries as supported. The server remains responsible for grading, retention, XP and completion proof. Completion requires three correct stored attempts tied to the current activity/run, not a client-reported score or historical answers. First activity/level completion receives the server's reward; repeats cannot farm that reward.

## Adaptive selection and recovery

Due expressions are preferred, followed by unseen targets and then comfortable ones. Selection is deterministic for the run seed and chooses unique scenes. When the entire pool is comfortable and not due, the interface offers to return to exploring. Another mission requires an explicit choice.

An unfinished session is saved under a player/activity/level local-storage key. Saved inventory and action lists are reconstructed through the normal reducer. Pausing, closing the dialog and reopening preserve the board. A pending request keeps its exact attempt ID and answer, locks input, and retries idempotently after a network error. A late response updates progress and the saved run even if the dialog has closed, without rebuilding destroyed UI. Failed final completion preserves all three proof IDs for retry. Reset creates a new run after pending writes settle; it never resets the player's learning record.

## Validation

The engine tests solve all 48 scenes through legal player actions, verify every canonical-answer gate, and cover budgets, change, exchanges, evidence uniqueness, blocked streets, recipients, transport, departures, help, adaptive selection and audio IDs. Controller tests exercise the actual delegated button handlers, wrong submissions, supported-practice flags, three-proof completion, immutable retry IDs, pause/resume, late responses, completion retry, exact visible exposure and all four boards.

The game dialog uses the available viewport height, a compact German request, a flexible board and docked primary actions. Repeated portraits, English briefings and reassurance no longer occupy the playing area. Briefings, clarification, full routes and extended corrective feedback open bounded reference panels. These panels receive keyboard focus, keep the underlying board inert, constrain Tab navigation and return focus to their trigger when closed. Café and market use panel buttons on portrait and short landscape screens; every inventory, tool and payment choice remains available. Only recipe history and optional reference content scroll within their own panels. Pause remains in the mobile banner.

All 48 populated scenarios were checked at 1280×720, 390×844, 844×390 and 390×667, including each café and market panel. Checks compared dialog client/scroll dimensions, button rectangles and game-board boundaries. Short-phone fixes were rechecked for the two longest B1 detective scenes and delivery maps; the B1 departure map remains 153.8 pixels high at 390×667. Task-complete, mission-complete and pause screens also fit portrait and landscape. Help focus, Escape restoration and detailed corrective feedback were exercised separately. Course introductions, choice encounters with corrective feedback, and the Lina NPC dialog were checked at 844×390 and portrait size.

The production TryCloudflare preview was checked at desktop, short-phone and landscape sizes: the dialog had no horizontal or vertical overflow, controls stayed within its bounds and all visible buttons measured at least 44×44 pixels. Captures are `docs/screenshots/activity-fit-desktop.jpg`, `activity-fit-mobile.jpg` and `activity-fit-landscape.jpg`. Existing real-server integration QA separately verified successful saves for all four activities and restoration after leaving a delivery. The current 122 frontend tests include regression coverage for panel/help navigation preserving the learning record and spoken delivery instructions remaining correct after backtracking.
