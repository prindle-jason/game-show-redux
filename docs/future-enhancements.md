# Future enhancements

Deferred decisions and known gaps, tracked here instead of scattered as footnotes across other docs. Not scheduled — pull an item into a milestone doc when it's actually being built.

- **Server-issued room codes.** Right now a room is created implicitly by whoever is first to join a given code, typed by hand into `player-app`. A server-minted code (e.g. a word-pair or alphanumeric code, via an HTTP route on `party`) plus a shareable join link is planned, but wasn't built as part of the room-shell milestone so it wouldn't constrain that milestone's UI.
- **Durable room state.** `party`'s room state currently lives only in the Durable Object's in-memory JS state, not `ctx.storage`. An idle room being evicted, an error, or a Worker redeploy wipes it entirely — reconnecting looks like joining a brand-new empty lobby, not resuming a game in progress. Making this durable means persisting `RoomState` to `ctx.storage` on every change and restoring it when a fresh DO instance spins up.
- **Session-token-based reconnect.** Reconnect currently matches on display name alone (see [architecture.md](./architecture.md)) — a placeholder that reuses a player's id/score on rejoin. This should eventually be replaced by a real session token, so identity doesn't depend on an exact, possibly-reused name.
