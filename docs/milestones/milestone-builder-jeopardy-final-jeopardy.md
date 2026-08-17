# Next milestone: Jeopardy & Final Jeopardy round builders

**Status: Not started.**

## Context

`builder-app` now has a working round-type picker (`src/RoundPicker.tsx`, router via `react-router`) and one complete editor — Wheel of Fortune — proving the authoring pattern: a Zustand draft store, a form screen with a live `round-ui` preview, schema-driven validation, and a JSZip export. Jeopardy and Final Jeopardy are the other two v1 round types; their `@gameshow/schema` contracts have existed since the schema milestone and haven't changed. This milestone is "do what Wheel's editor did, for these two shapes" — most of the pattern transfers directly, but a few things do not, called out below.

## Shared groundwork (applies to both round types)

- **Registry**: `packages/builder-app/src/rounds/index.ts` already has `jeopardy` and `final-jeopardy` entries reserved (with `path: '/jeopardy'` / `'/final-jeopardy'`) but no `component`. Filling that in is the *entire* integration step — the picker card auto-enables and the router auto-adds the route (`App.tsx` builds `<Route>`s from this registry). No other picker/router file needs to change.
- **Pattern to copy**: `wheel-draft-store.ts` (Zustand `create<T>`, `roundId: crypto.randomUUID()` generated once at draft creation, plain field-setter actions, a `validateX(draft)` function that just calls the type's own `xDataSchema.safeParse`), `WheelEditor.tsx` (form + live preview + `Link to="/"` back button + Export button disabled until valid), `export-round.ts` (`xDraftToRound`, `exportXRound` via JSZip, `downloadRoundZip` — this last one is already round-type-agnostic, reuse as-is).
- **Validation**: reuse `jeopardyBoardDataSchema` / `finalJeopardyDataSchema` from `@gameshow/schema` via `safeParse`, exactly like `validateWheelDraft` does against `wheelPuzzleDataSchema`. Don't invent extra authoring rules beyond what the schema already requires.
- **Test-cleanup gotcha**: this repo's vitest config has no `globals: true`, so `@testing-library/react`'s automatic `afterEach(cleanup)` never registers itself. Every test file with more than one `it()` needs an explicit `afterEach(() => cleanup())` import, or later tests see DOM left over from earlier ones (surfaces as confusing "found multiple elements" failures, not an obviously-related error). Already done this way in `WheelEditor.test.tsx`, `RoundPicker.test.tsx`, `App.test.tsx` — follow the same import.
- **Media authoring: `docs/milestone-round-import.md` has landed** (schema helpers + `player-app`'s import path) — build media attachment into these editors as part of this milestone rather than deferring it further. Reuse `roundMediaManifestSchema`/`RoundMediaManifestEntry` and `listMediaRefs` from `@gameshow/schema`, and `MEDIA_LIMITS` (`@gameshow/schema/media.ts`) to validate attached files client-side before export. **Watch the slideshow convention**: a `MediaRef` of `kind: 'slideshow'` carries multiple `assetIds`, but each one must be written to `assets/manifest.json` as its own entry with `kind: 'image'` — never `kind: 'slideshow'`, which is a `MediaRef`-level kind only and isn't a valid per-file manifest `kind` (the schema's enum excludes it). Getting this wrong makes `player-app`'s import reject the round-trip with a kind-mismatch error. If for some reason round-import *hasn't* landed by the time this milestone starts, fall back to authoring `ClueContent` as text-only (omit `media` entirely on every clue/answer field, same as Wheel's export today) and revisit once it does.
- **`round-ui` sharing is optional, not required.** Wheel's `SolutionBoard`/`WheelGraphic` were extracted because editor and player render the literal same puzzle visual. Whether Jeopardy's board grid or Final Jeopardy's clue card are worth sharing the same way is a per-component call — don't force an extraction that doesn't pay for itself.

## Final Jeopardy builder (recommended first — simplest shape)

- `finalJeopardyDataSchema` = `{ category: string, clue: ClueContent, answer: ClueContent }` — flat, one clue, no arrays. Nothing to author for wagers/reveal — those are play-time state (`FinalJeopardyState`/`Action`), not part of the authored `data`.
- Editor is essentially three text fields (category, clue, answer) — simpler than Wheel's.
- Reference a valid shape via `player-app/src/fixtures.ts`'s `createFinalJeopardyFixtureRound()` (ignore its `media` field — see media note above).

## Jeopardy builder (second — nested shape)

- `jeopardyBoardDataSchema` = `{ categories: JeopardyCategory[] }`; each category = `{ name, clues: JeopardyClue[] }`; each clue = `{ value: positive int, clue: ClueContent, answer: ClueContent, isDailyDouble?: boolean }`. Unlike Wheel's fixed-4-rows decision, there's no natural fixed grid — the schema doesn't enforce a standard 6×5 board, just "at least one category, each with at least one clue."
- Consider mirroring Wheel's Default/Shuffle UX: a "Default" button seeding a standard 6-category × 5-clue skeleton (empty names/text, conventional $200–$1000 values) to fill in, rather than requiring add-category/add-clue from a blank state every time. Add/remove-category and add/remove-clue-within-category are still needed as base primitives.
- Daily Double is just a per-clue checkbox (`isDailyDouble`) — the schema doesn't constrain how many a category has or where; that's a `party` gameplay-balance concern, not something to validate here.
- Reference a valid shape via `player-app/src/fixtures.ts`'s `createFixtureRound()` — its "Science"/"History" categories are media-free and good to copy; ignore its "Media" category.

## Why

Continues the same plugin boundary (`type` + schema in `@gameshow/schema`, editor in `builder-app`) onto the authoring side for the two round types that haven't gotten one yet. Final Jeopardy first because its flat shape is the closest thing to Wheel's simplicity; Jeopardy second because its nested categories/clues is the most authoring UI to build. Media is deferred on purpose so this milestone doesn't get entangled with the separate, unbuilt problem of round import.

## Done when

- `roundEditors` has `component` filled in for both `jeopardy` and `final-jeopardy` — their picker cards become live links, no longer disabled.
- Both editors: field edits reflect in a live preview, Export stays disabled until the round type's own `dataSchema` validates, and Export produces a zip whose `round.json` round-trips through `roundSchema.safeParse`.
- Manually build one Final Jeopardy round and one Jeopardy round (a few categories, at least one Daily Double) end to end in the browser and confirm both exported zips validate.
- `typecheck`, `lint`, `test`, and `build` stay green across the monorepo.
