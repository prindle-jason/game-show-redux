# Next milestone: room shell + minimal player-app stub

**Status: Complete.** Both browser tabs and `typecheck`/`lint`/`test`/`build` verification passed. Scope also grew beyond the original plan below to include host controls added afterward: reset scores, kick a player (both lobby-only), and returning from `ended` back to `lobby` (clearing the queue, keeping scores). See `requirements.md` and `architecture.md` for the current state of these; the next milestone gets its own doc.

## Context

`@gameshow/schema` is done: round contracts (Jeopardy, Final Jeopardy, Wheel of Fortune), the room model (`RoomState`, phases, queue), and the wire envelope (`ClientMessage`/`ServerMessage`, host vs. contestant filtered views) are all designed and implemented. See `docs/architecture.md` for the full picture. `party` and `player-app` are still scaffolds — the room doesn't hold real state yet, and there's no UI to connect to it.

## What

Two things, together, as one milestone:

- **`party`**: implement the room-level behavior the schema already contracts for — join, add/remove/reorder queue entries, start the game, advance the queue, and the `lobby → playing → ended` phase transitions. The room should hold a real `RoomState` and broadcast the filtered host/contestant views on every change.
- **`player-app`**: a minimal, unstyled stub UI — enough to connect to a room, join with a name, trigger the queue actions, and display whatever state comes back (a raw JSON dump is fine).

**Explicitly out of scope**: round-type gameplay itself (buzz, spin, wager, judge, etc.). That's the next milestone, once round-type behavior modules exist in `party`. For this milestone, a round just needs to become "active" in the queue — nothing needs to happen inside it yet. Likewise, the zip bundle import/export format is still undecided — use a hardcoded/fixture `Round` object to test the queue flow rather than building real import.

## Why

This is the riskiest, most central contract in the whole design, and until now it's only been type-checked, never run. Building it in isolation — before round-type behavior or any real UI polish — means we find out now if `RoomState`/the message envelope/the view split actually work end to end, rather than after also having sunk time into gameplay logic built on top of them.

It's also the first point where the project becomes genuinely testable by hand: two browser tabs against a local `party` dev server (no deployment needed) can join the same room as different players and watch state sync live, which is a much faster feedback loop than reading code or unit tests alone.

## Done when

- Two browser tabs/windows, run locally, can: join the same room as different named players, watch the host add fixture rounds to the queue and start the game, and see the queue/phase update live in both tabs — with the contestant tab never showing upcoming round content the host tab can see.
- `typecheck`, `lint`, `test`, and `build` stay green across the monorepo.
