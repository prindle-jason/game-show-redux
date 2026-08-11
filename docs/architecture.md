# Architecture

## Stack

- **Frontend**: Vite + TypeScript + React + Zustand
- **Backend**: PartyKit only — no separate API server. Each room is one Durable Object instance, which is a single-threaded, stateful process per room; that's where all game logic (round-type state machines, buzz ordering, scoring) runs authoritatively. Media upload handling (issuing/handling R2 uploads) is also just an HTTP handler inside the same PartyKit server, not a separate service.
- **Media storage**: Cloudflare R2 (or equivalent S3-compatible bucket)
- **Package manager / repo**: pnpm workspaces (monorepo)

## Repo layout

```
packages/
  schema/        # shared types + validation (quiz format, round-type contracts, wire messages)
  builder-app/   # Vite app: quiz authoring UI, zip export/import
  player-app/    # Vite app: live-room UI for host + contestants
  party/         # PartyKit server: room state, game logic, media upload handling
```

`schema` has no dependency on the other packages; everything else depends on it. This keeps the wire format and quiz format as the single source of truth instead of duplicating types across apps.

## Data flow

**Building a quiz**: entirely client-side in `builder-app`. Export produces a zip (`quiz.json` + `/assets`); import reverses it. No server involved.

**Starting a room**:
1. Host loads a quiz zip into `player-app` (host view) and creates a room via `party`.
2. Host's media assets upload to R2; the room stores asset URLs, not the bytes.
3. Contestants join the PartyKit room with the room code + a display name.

**During the game**: the PartyKit room is the source of truth for game state (board, scores, buzz order, current question, connected players). Clients hold a local Zustand store that mirrors server state — it's a projection, not authoritative. All state-changing actions (buzz, submit answer, award points, advance clue) go through the room; the room broadcasts the resulting state, and clients render it. This is what makes reconnect work "for free": a rejoining client just needs the room's current snapshot.

## Round types

The two v1 round types (Jeopardy board, Wheel of Fortune) have different interaction contracts — one is buzz-in + host-judged, the other is direct-submit + auto-scored. To support both without special-casing, a round type is a plugin defined in `schema` (and implemented in `party`) that owns:

- Its slice of quiz data (what a "board" or "puzzle" looks like for that round type).
- Its state machine (what states the round moves through — e.g. `awaiting-buzz` → `answering` → `judged`).
- Its interaction contract (what messages contestants/host can send — buzz, submit-answer, judge, wager — and when each is valid).
- Its scoring rules.

Adding a new round type later should mean adding a new plugin module, not touching existing round types or the room's core message loop.

## Deployment

- `builder-app` and `player-app`: static hosting (e.g. Cloudflare Pages).
- `party`: deployed to Cloudflare Workers (Durable Objects), via `partyserver` + `wrangler`.
- R2 bucket: Cloudflare, same account as the Worker for simplicity.

## Key decisions and why

| Decision | Why |
|---|---|
| Zip export instead of single JSON | Full media support without base64 bloat or unwieldy JSON files |
| Media in R2, not relayed over websocket | Websocket relay doesn't scale to video/audio; R2 + URL fetch does |
| No accounts | Matches the game-night use case; room codes are enough |
| Room state ephemeral, no DB | Nothing in v1 requires state to outlive the game |
| Round types as plugins | The two v1 round types already have incompatible interaction models; hardcoding either would block adding the other cleanly |
