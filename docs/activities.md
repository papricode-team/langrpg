# Playable language missions

Four activities contain **48 authored scenes**: twelve per activity, with four scenes at each of A1, A2 and B1. A mission selects three distinct scenes. This is contextual practice, not a CEFR assessment.

| Activity | The player actually does | Consequences |
| --- | --- | --- |
| Lantern Café | Builds a tray with quantities, performs an ordered kitchen sequence, chooses indoor seating, takeaway or a reservation time | Extra ingredients, missing milk, wrong preparation order or the wrong service keep the order open |
| Midnight market | Collects goods, completes an exchange, stays within a budget, chooses the requested payment method and counts change | Overpriced goods exceed the purse; changing a basket clears the previous change; buying substitutes does not count as an agreed trade |
| Evidence room | Selects evidence slips and places them into a connected reconstruction board | Each slip can occupy one place; every required witness, event or conclusion must fit before the case is accepted |
| Letters through the mist | Chooses a recipient, connection and departure, turns through a road network and visits a checkpoint | Buildings and water block movement; the damaged bridge requires help; the wrong recipient, transport or time cannot complete delivery |

The boards use native buttons throughout. Touch targets are at least 44 pixels. Evidence uses select-then-place rather than mandatory dragging. Delivery also supports arrow keys while the board has focus. Nothing penalizes time spent thinking, replaying audio or pausing.

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

Browser QA at 390×844 exercised all four boards with successful real-server task saves. The market required the actual two-apple basket and €2.60 change; detective reconstruction required all three correctly placed slips; delivery retained its recipient and turn history after leaving, then completed the restored route. No portrait board had horizontal overflow or a button below 44×44 pixels. The 844×390 landscape pass found and fixed a shared menu/scene class collision; the corrected route board measured 810 pixels of both client width and scroll width. A footer pause action keeps save-and-leave reachable after scrolling through a long mobile mission. Proof is saved in `docs/screenshots/activity-mobile.png` and `docs/screenshots/activity-landscape.png`, with additional board captures alongside them.
