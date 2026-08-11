# Requirements

## Product

A quiz-show maker with two modes:

1. **Builder** — hosts author a quiz in the browser and save it to their local machine.
2. **Live Room** — hosts spin up a room, contestants join, and the group plays the quiz in real time.

## V1 round types

Round types are pluggable, not hardcoded — see [architecture.md](./architecture.md#round-types) for the contract. V1 ships two:

- **Jeopardy-style board** — categories × values, pick-a-clue, buzz-in, host judges the verbal answer, Daily Double + Final Jeopardy wagering.
- **Wheel of Fortune style** — direct answer submission, auto-scored against the puzzle.

These two were chosen because they exercise the two fundamentally different interaction contracts a round type can have (buzz-then-host-judges vs. direct-submit-autoscored), which validates the plugin boundary early.

## Media

Clues support image/audio/video, not just text.

- Builder export/import is a **zip bundle** (`quiz.json` + `/assets`), not a single JSON file — keeps media as native files and avoids base64 bloat.
- During a live room, media is uploaded to object storage (Cloudflare R2) when the room starts; contestants' browsers fetch by URL rather than the media being relayed over the room's websocket.

## Rooms

- **No accounts.** Host creates a room and shares a code/link; contestants join with just a display name.
- Small rooms: up to ~8 contestants. No spectator role in v1.
- **Full reconnect support**: room state (board, scores, buzz order, current question) lives in the PartyKit room's durable storage. Rejoining with the same room code + name resumes where a player left off.

## Persistence

- Quizzes: no server-side storage. Client-only, export/import as a zip file.
- Game/room state: ephemeral, lives only in the PartyKit room for the duration of the game. No permanent database in v1.

## Explicit non-goals (v1)

Call these out so scope doesn't creep back in during implementation:

- No user accounts, for hosts or contestants.
- No spectator-only role.
- No server-side quiz library/storage — a quiz is just a file.
- No large-room support (dozens of contestants, teams) — small game-night groups only.
