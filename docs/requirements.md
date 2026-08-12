# Requirements

## Product

A quiz-show maker with two modes:

1. **Builder** — hosts author individual **rounds** in the browser and save each as its own file.
2. **Live Room** — host creates a room, contestants join, and in the lobby the host assembles a **queue** of rounds to play, in order, in real time.

## V1 round types

Round types are pluggable, not hardcoded — see [architecture.md](./architecture.md#round-types) for the contract. V1 ships three:

- **Jeopardy-style board** — categories × values, pick-a-clue, buzz-in, host judges the verbal answer, Daily Double wagering.
- **Final Jeopardy** — its own round type: category reveal, hidden wager, hidden answer, then reveal-and-judge one player at a time.
- **Wheel of Fortune style** — full classic wheel-spin mechanics: spin for a wedge (cash/bankrupt/lose-turn), guess consonants, buy vowels, attempt to solve. Scoring is tracked per-round (bankrupt only zeroes the round score) and commits to each player's total when the puzzle is solved, with a solve bonus for whoever solved it.

These were chosen to exercise different interaction contracts (buzz-then-host-judges, hidden-then-revealed, turn-based-with-a-random-element), which validates the round-type plugin boundary early.

## Media

Clues support image/audio/video, not just text.

- Builder export/import is a **zip bundle** (`round.json` + `/assets`) per round, not a single JSON file — keeps media as native files and avoids base64 bloat, and keeps each round independently reusable.
- During a live room, a round's media uploads to object storage (Cloudflare R2) when the host adds that round to the queue (not all at once at room start, since rounds are added individually); contestants' browsers fetch by URL rather than the media being relayed over the room's websocket.

## Rooms

- **No accounts.** Host = whoever creates the room. In practice that's the first person to join a given room code — there's no separate "create room" step yet, so joining an empty code creates and hosts it. Contestants join the same code/link with just a display name. (A server-issued room code / shareable join link is a planned enhancement — see [future-enhancements.md](./future-enhancements.md).)
- Small rooms: up to ~8 contestants. No spectator role in v1.
- **Queue is host-only and lobby-only**: only the host can add/remove/reorder rounds, and only while the room is in its lobby phase. Once the game starts, the queue advances round by round; contestants see queue progress (status/count) but never an upcoming round's content.
- **Host can also reset scores or kick a player, both lobby-only.** Kicking is temporary — no blocklist, so a kicked player can immediately rejoin under the same name.
- **The host can return to the lobby after a game ends** (`ended → lobby`), which clears the queue but keeps scores — letting the same group play again without losing standings.
- **Reconnect is name-based, not durable.** Rejoining with the same room code + display name reuses that player's id and score. Room state currently lives only in the Durable Object's in-memory JS state, not durable storage, so an idle room being evicted, an error, or a redeploy wipes it. See [future-enhancements.md](./future-enhancements.md) for both the durability gap and the planned move to session-token-based reconnect.

## Persistence

- Rounds: no server-side storage. Client-only, export/import as a zip file.
- Game/room state: ephemeral, lives only in the PartyKit room for the duration of the game. No permanent database in v1.

## Explicit non-goals (v1)

Call these out so scope doesn't creep back in during implementation:

- No user accounts, for hosts or contestants.
- No spectator-only role.
- No server-side round library/storage — a round is just a file.
- No large-room support (dozens of contestants, teams) — small game-night groups only.
