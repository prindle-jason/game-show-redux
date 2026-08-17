# Next milestone: Final Jeopardy round, end to end

**Status: Complete.** `typecheck`/`lint`/`test`/`build` are green across the monorepo; the reduce state machine (wagering, answering, ordered reveal walk with auto-skip for no-shows, scoring, completion) and the board UI (host wagering/answering/reveal/summary panels, contestant wager and answer forms) are implemented and unit-tested. The two-browser-tabs manual playthrough has been confirmed.

## Context

The Jeopardy round milestone proved the round-type plugin pattern (`type` + schemas in `schema`, pure-function behavior in `party`, a board component in `player-app`). Final Jeopardy is the second round type built against that same boundary, and needed one extension to it: contestant views previously showed the same data to every viewer, but Final Jeopardy must withhold the clue from everyone until wagering closes, and must scope `hasWagered`/`hasAnswered` to the requesting viewer. That required threading a `viewerId` through `toContestantView` (both the room-level `room-logic.ts` version and each round module's own), and widening `RoundActionContext` from a bare `contestantIds: string[]` to a `players: { id, name, score }[]` array so the reveal order could be computed by score.

## What

- **`schema`**: `finalJeopardyDataSchema` (category/clue/answer), a 6-action `finalJeopardyActionSchema` (`wager`, `submit-answer`, `advance`, `reveal-answer`, `reveal-wager`, `judge`), `FinalJeopardyState` (fixed `contestantIds`, `wagers`, `answers`, `judgments`, computed `revealOrder`, `revealIndex`, `revealStage`), and `FinalJeopardyContestantView` (clue withheld until `answering`, per-viewer `hasWagered`/`hasAnswered`, a `revealed` list built up as the host walks the order).
- **`party`**: a `final-jeopardy` round module following the Jeopardy module's shape. The state machine: `category` → `wagering` (contestants submit wagers) → `answering` (clue revealed to everyone, contestants submit answers) → `revealing` (host walks a reveal order computed once, ascending by score, via `reveal-answer` → `reveal-wager` → `judge` per contestant) → `summary`. A contestant who submits neither a wager nor an answer is auto-skipped as the reveal walk reaches them (auto-judged incorrect, no score change) rather than forcing the host to click through a no-show.
- **`RoundActionContext`** widened to carry `players` (id/name/score) instead of `contestantIds`, so any round module can rank or score-check without a separate lookup; Jeopardy's module updated to match. `toContestantView` (room-level and per-module) now takes a `viewerId` so views can differ per viewer — needed here to hide the clue pre-wagering, and to reuse for any future round type.
- **`player-app`**: a `FinalJeopardyBoard` — host panels for each phase (wagering progress, answering progress, a reveal panel showing answer/wager/judge controls for the current contestant, and a running summary), plus a contestant view (wager form, answer form, and the same revealed-so-far list). A fixture round and a lobby-phase "Add Final Jeopardy fixture round" button for manual testing.

**Explicitly out of scope**: Wheel of Fortune (its own milestone); real round import via `builder-app` (Final Jeopardy still uses a hand-authored fixture); timers on wagering or answering; visual polish beyond functional.

## Why

Final Jeopardy's wagering-then-reveal shape is different enough from Jeopardy's buzz race that it stress-tests the plugin boundary from a new angle — specifically, whether a round type can legitimately need viewer-specific state (the withheld clue) without becoming a special case. Widening `toContestantView` to take a `viewerId` and `RoundActionContext` to carry full player records answers that generically, so the next round type (Wheel of Fortune) inherits the capability for free if it needs it.

## Done when

- Two or more browser tabs, run locally, can play a full Final Jeopardy round start to finish: host reveals the category and opens wagering, contestants wager without seeing the clue, host reveals the clue and opens answering, contestants answer, host walks the reveal order (answer → wager → judge) for each contestant in ascending-score order, scores update live for everyone, and a no-show contestant is auto-skipped rather than blocking the reveal.
- `typecheck`, `lint`, `test`, and `build` stay green across the monorepo.
