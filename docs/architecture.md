# Architecture

## Stack

- **Frontend**: Vite + TypeScript + React + Zustand
- **Backend**: PartyKit only — no separate API server. Each room is one Durable Object instance, which is a single-threaded, stateful process per room; that's where all game logic (round-type state machines, buzz ordering, scoring) runs authoritatively. Media upload handling (issuing/handling R2 uploads) is also just an HTTP handler inside the same PartyKit server, not a separate service.
- **Media storage**: Cloudflare R2 (or equivalent S3-compatible bucket)
- **Package manager / repo**: pnpm workspaces (monorepo)

## Repo layout

```
packages/
  schema/        # shared types + validation (round format, round-type contracts, room model, wire messages)
  builder-app/   # Vite app: round authoring UI, zip export/import
  player-app/    # Vite app: live-room UI for host + contestants
  party/         # PartyKit server: room state, game logic, media upload handling
```

`schema` has no dependency on the other packages; everything else depends on it. This keeps the wire format and round format as the single source of truth instead of duplicating types across apps.

## Data flow

**Building a round**: entirely client-side in `builder-app`. Export produces a zip (`round.json` + `/assets`); import reverses it. No server involved. One round per zip — there's no "quiz" document; the queue (below) is what sequences rounds together, and it's a room-runtime concept, not a saved file.

**Running a room** — a room moves through phases (`lobby` → `playing` → `ended`):
1. Host creates a room via `party`. Room starts in `lobby`.
2. In the lobby, the host loads round zips into `player-app` one at a time and adds each to the room's **queue**. Each round's media uploads to R2 on add (not all at once). Only the host can edit the queue, and only during `lobby`.
3. Contestants join the room with the room code + a display name, any time.
4. Host starts the game; phase moves to `playing` and the queue advances round by round.

**During the game**: the PartyKit room is the source of truth for state (queue, active round's state, scores, connected players). `party` broadcasts two filtered projections, not one shared blob: a **host view** (full room state) and a **contestant view** (no upcoming round content — queue entries show status only; the active round's own state is filtered per round type, e.g. hiding an unrevealed Wheel-of-Fortune solution or Jeopardy answer key). The active queue entry carries a `loading`/`active` status: on `advance-queue` (including the initial `start-game`), the round enters `loading` and stays there — round-type actions aren't dispatched yet — until every connected client has reported its media fully downloaded, a timeout elapses, or the host overrides; this is room-level behavior in `room-logic.ts`, so round-type modules never need to know it exists. Clients hold a local Zustand store mirroring whichever view they received. All state-changing actions (buzz, submit answer, award points, advance clue, advance queue) go through the room as validated messages; the room broadcasts the resulting view(s). Reconnecting is currently name-based — a rejoining client whose display name matches an existing player reuses that player's id/score (see requirements.md and [future-enhancements.md](./future-enhancements.md) for the planned move to session tokens).

**Implementation pattern inside `party`**: room logic is split into pure, framework-free state-transition functions (`room-logic.ts` — takes a `RoomState` plus an action's arguments, returns the next `RoomState` or a rejection, fully unit-testable with no Durable Object/WebSocket machinery involved) and a thin adapter (`game-room.ts` — the actual `Connection`/broadcast-handling class, which just parses/validates incoming messages, calls the matching pure function, and broadcasts the result). This is the intended shape for round-type behavior modules too: the round-type's `reduce`/`createInitialState`/`isComplete` functions should be pure and tested the same way, with `game-room.ts` staying a dispatcher.

**Validation boundary**: `schema` uses zod only where untrusted data crosses in — an imported `round.json` and incoming client messages over the websocket. Server-to-client broadcasts and `party`'s internal state are plain TS types; `party` fully controls their shape, so there's nothing to validate.

## Round types

Round types are a plugin: `schema` defines the contract (a `type` string, a zod schema for authored `data`, a zod schema for wire `Action`s, plus plain-TS `State`/`ContestantView` shapes), and `party` implements the behavior against it (`createInitialState`, `reduce`, `isComplete`, a contestant-view filter). Adding a round type means adding a new module + registry entry in `schema` and a matching behavior module in `party` — never touching existing round types or the room's core message loop.

V1's three round types (Jeopardy board, Final Jeopardy, Wheel of Fortune) were chosen specifically because they have different interaction contracts — buzz-in + host-judged, hidden-then-revealed, and turn-based-with-a-random-spin — which validates this plugin boundary early.

## Deployment

- `builder-app` and `player-app`: static hosting (e.g. Cloudflare Pages).
- `party`: deployed to Cloudflare Workers (Durable Objects), via `partyserver` + `wrangler`.
- R2 bucket: Cloudflare, same account as the Worker for simplicity.

## Key decisions and why

| Decision | Why |
|---|---|
| Rounds + a room-runtime queue, not a "quiz" document | Rounds are authored/shared independently and reused across games; the queue (assembled per-room, in the lobby) replaces quiz-level sequencing |
| Zip export instead of single JSON | Full media support without base64 bloat or unwieldy JSON files |
| Media uploads on add-to-queue, not at room start | Rounds trickle into the queue individually, so there's no single "room start" moment to upload everything at once |
| Media in R2, not relayed over websocket | Websocket relay doesn't scale to video/audio; R2 + URL fetch does |
| Round doesn't go active until all clients report media downloaded | Prevents contestants watching a video clue play out for others while their own is still buffering; gated with a timeout + host override so one stalled client can't block the game |
| Host/contestant filtered views, not one shared broadcast | Contestants can't be shown upcoming round content or host-only round state (answer keys, unrevealed solutions) |
| zod only at trust boundaries | Imported rounds and incoming client messages are untrusted; `party`'s own state and outgoing broadcasts aren't |
| No accounts | Matches the game-night use case; room codes are enough |
| Room state ephemeral, no DB | Nothing in v1 requires state to outlive the game |
| Round types as plugins (contract in `schema`, behavior in `party`) | The v1 round types already have incompatible interaction models; hardcoding any of them would block adding others cleanly |
