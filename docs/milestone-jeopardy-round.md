# Next milestone: Jeopardy round, end to end

## Context

The room shell milestone is complete — `party` holds real `RoomState`, and `player-app` can join/queue/start a game, but only renders a raw JSON dump of whatever comes back. No round type has any actual behavior yet; `@gameshow/schema`'s Jeopardy contract (`JeopardyBoardData`, `JeopardyAction`, `JeopardyState`, `JeopardyContestantView`) has been sitting fully designed and untouched since the schema milestone.

## What

- **`party`**: a Jeopardy round-type behavior module — `createInitialState`, `reduce`, `isComplete`, and a contestant-view filter — as pure functions, following the same pattern `room-logic.ts` already established for room-level state. Wired into `game-room.ts`'s message dispatch: a `round-action` gets re-validated against Jeopardy's own `actionSchema` (per the note already in `message.ts`) and routed to this module's `reduce`.
- The state machine itself: pick a clue → (if Daily Double) the picking player wagers → buzz opens → first buzz locks the board → host judges → correct scores and reveals, incorrect locks that player out and reopens the buzz to everyone else → round completes once every clue has been played.
- **`player-app`**: real board UI for this round type — the category/clue grid, a buzz button, host judge controls, and a wager input for Daily Doubles — replacing the JSON dump for Jeopardy specifically.
- A small hand-authored Jeopardy fixture round (a few categories/values, one Daily Double) to add to the queue for testing, replacing the room-shell milestone's generic placeholder fixture.
- Unit tests for the reduce state machine: buzz race (first buzz wins, later ones rejected), re-buzz lockout after a wrong answer, the Daily Double wager flow, scoring, and round completion.

**Explicitly out of scope**: Wheel of Fortune and Final Jeopardy behavior (their own milestones once this one proves the pattern); real round import via zip/`builder-app` (still a fixture); timers on buzzing or wagering; visual polish beyond functional.

## Why

Round types were designed as a plugin boundary — a `type` + schemas in `schema`, behavior in `party` — but nothing has actually run against that contract yet. Jeopardy is the right first one to build because it's the most demanding of the three (a buzz race, host arbitration, re-opening after a miss), so proving the pattern here gives real confidence that Wheel of Fortune and Final Jeopardy, which have simpler interaction models, will slot in cleanly afterward without reshaping the plugin boundary.

## Done when

- Two or more browser tabs, run locally, can play a full Jeopardy board start to finish: host picks clues, contestants race to buzz, host judges (including a Daily Double wager), scores update live for everyone, and the round reports complete once every clue has been played.
- `typecheck`, `lint`, `test`, and `build` stay green across the monorepo.
