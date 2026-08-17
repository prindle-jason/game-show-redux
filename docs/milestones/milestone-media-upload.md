# Next milestone: media upload & serving (R2)

**Status: Complete.** `typecheck`/`lint`/`test`/`build` are green across the monorepo; upload/serve/cleanup routes, the upload-token auth, the media-ready readiness barrier (timeout + host override), and queue-removal cleanup are all implemented and unit-tested. The two-browser-tabs manual playthrough and the "same flow against the real deployed bucket" check haven't been re-confirmed since; do those before considering this fully closed out.

## Context

The `MEDIA` R2 binding has existed since the first deploy (`packages/party/wrangler.jsonc`, typed in `env.ts`) — the `gameshow-media` bucket is live and required for `party` to deploy — but no code reads or writes it. `@gameshow/schema` already models media the right way: `MediaRef` carries an `assetId` (image/audio/video/slideshow), `ClueContent` embeds it, and `media.ts` explicitly notes that resolving an `assetId` to an R2 URL is `party`'s concern. Nothing does that resolution yet — `player-app` renders a literal `[media]` placeholder wherever a clue has media (`JeopardyBoard.tsx`).

Two constraints from `requirements.md`/`architecture.md` shape the design:

- A round's media uploads to R2 **when the host adds that round to the queue**, not all at once at room start.
- Contestants' browsers **fetch media by URL**; media bytes never ride the room websocket. (`add-round-to-queue` sends only `round.json`-shaped data over the socket — assets must travel by HTTP.)

## What

- **Serve media through the Worker, not a public bucket.** A `GET /media/rooms/{roomId}/{roundId}/{assetId}` route in `party`'s `fetch` handler (before the `routePartykitRequest` fallthrough in `index.ts`) streams `env.MEDIA.get(key)` with the stored `Content-Type` and long-lived cache headers. This is the one option that behaves identically under local `wrangler dev` (Miniflare simulates R2 on disk under `.wrangler/state/`) and in production against the real bucket — public r2.dev URLs and presigned S3 URLs don't exist locally.
- **Upload path**: when the host adds a round to the queue, `player-app` PUTs each asset to `party` over HTTP (keyed `rooms/{roomId}/{roundId}/{assetId}`, `Content-Type` preserved into R2 `httpMetadata`), then sends `add-round-to-queue` as today. Uploads are **host-only and lobby-only** — since host identity lives in the `GameRoom` DO, either route uploads through the DO's `onRequest` or have the DO vend a short-lived upload token that the Worker route checks (implementer's choice; the requirement is that a non-host can't write to the bucket).
- **Validation at the trust boundary**: allowlist of content types per `MediaRef` kind and a per-asset size cap (Workers bodies cap around 100–200 MB depending on plan; our cap should be far lower).
- **`schema`**: a resolved-media shape for outgoing views — same kinds as `MediaRef` but carrying `url`(s) instead of `assetId`(s) — plus a `round-media-ready` client message and a `loading | active` status on the active queue entry. `party` rewrites each `MediaRef` to its resolved form when the round enters the queue (deterministic key scheme makes this a pure string mapping), so host/contestant views hand the browser a fetchable URL.
- **`player-app`**: render resolved media in `ClueContent` — `<img>`, `<audio>`, `<video>`, and a minimal slideshow — replacing the `[media]` placeholder; a prefetcher that reports readiness; host "waiting on…" UI with a reveal-anyway control.
- **Cleanup**: removing a round from the queue deletes its `rooms/{roomId}/{roundId}/` prefix. (Broader garbage collection is a backstop, not code: an R2 lifecycle rule expiring objects after a few days, set once in the dashboard — see out of scope.)
- **Preload barrier**: no clue media is shown until every connected client has it downloaded. Owned by `room-logic.ts`, not round types: the active queue entry gets a status (`loading` → `active`), and the round-type reducer only receives `round-action`s once the gate opens — so Jeopardy needs no changes for it and future round types inherit it. Clients prefetch all of the active round's assets fully (`fetch()` to completion → blob URL — `<video preload>` is only a hint and can't be trusted for the barrier) and send a `round-media-ready` message; the DO flips to `active` on all-ready, a timeout (~10–15s), or an explicit host "reveal anyway" override. The host's view includes the readiness map ("waiting on…"). A client that disconnects mid-load drops out of the required set; late joiners never gate a round already `active`.
- **Prefetch starts at enqueue**: assets upload at add-to-queue and URLs resolve into all views immediately, so clients prefetch during the lobby and the loading gate normally clears instantly at start. *Accepted trade-off*: this ships unrevealed media to contestants' browsers early — a devtools-savvy player could peek (decided acceptable for now). The future fix is contained: delay URL resolution into contestant views until clue pick, and the same gate moves to per-clue; barrier/prefetch/ready messages are unchanged.
- **Fixture**: extend the hand-authored Jeopardy fixture with a couple of small real assets (an image clue, an audio clue) shipped in the repo, uploaded through the real add-to-queue path — standing in for zip assets until real import exists.
- Tests: upload auth (non-host and non-lobby rejected), key/URL resolution mapping, content-type/size validation, queue-removal cleanup, and the readiness barrier (all-ready transition, timeout fallback, host override, mid-load disconnect).

**Explicitly out of scope**: zip bundle import/export (`round.json` + `/assets`) — that's the builder-app milestone; this milestone stops at "assets from *somewhere* flow through R2 correctly." Also out: multipart/resumable uploads for large video, hiding unrevealed media URLs from contestants (the per-clue-resolution follow-up above), signed *read* URLs or per-contestant access control on media (room IDs are unguessable enough for game night), and creating the lifecycle rule itself (one-time manual dashboard action, owner's call on retention).

## Why

This is the last architectural seam that has never been exercised: schema→party→player-app round-trips are proven for state, but the media leg (HTTP upload, R2, URL fetch) exists only as a binding and a comment in `media.ts`. Proving it now — with the same "works in two local browser tabs" feedback loop as prior milestones — de-risks the builder-app zip milestone, which otherwise would land on an untested storage path. It also settles the key scheme and auth model while there's exactly one call site, instead of retrofitting them under three round types' worth of media.

## Done when

- Two browser tabs against local `wrangler dev`: host adds the media fixture round to the queue (assets visibly upload), starts the game, and both tabs render the image clue and play the audio clue fetched from the local R2 simulator — no media bytes over the websocket.
- The active round stays in `loading` until every connected client reports media-ready (having prefetched in the lobby, this is normally instant), with a working timeout fallback and host "reveal anyway" override — verifiable by throttling one tab's network.
- Removing the round from the queue in the lobby deletes its objects (verifiable with `wrangler r2 object get --local` / listing).
- The same flow works once deployed against the real `gameshow-media` bucket (deploy run manually, as usual).
- A non-host upload attempt and an upload outside `lobby` are rejected.
- `typecheck`, `lint`, `test`, and `build` stay green across the monorepo.
