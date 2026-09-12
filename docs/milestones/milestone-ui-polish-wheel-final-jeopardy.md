# Next milestone: UI polish pass, part 2 (Wheel of Fortune + Final Jeopardy)

**Status: Not started.**

## Context

The ui-polish milestone (`milestone-ui-polish.md`) built `@gameshow/ui` (Tailwind v4 tokens, `Button`/`Field` primitives) and applied it to the shell (join/lobby chrome, `RoundPicker`) and the Jeopardy round end-to-end, deliberately leaving Wheel of Fortune and Final Jeopardy untouched: "they stay functional and unstyled until a follow-up milestone applies the now-proven primitives to them." This is that follow-up. Every screen still on raw, unstyled markup lives in exactly four files: `packages/round-ui/src/wheel/solution-board.tsx`, `packages/round-ui/src/wheel/wheel-graphic.tsx`, `packages/player-app/src/WheelBoard.tsx`, `packages/player-app/src/FinalJeopardyBoard.tsx`, `packages/builder-app/src/WheelEditor.tsx`, and `packages/builder-app/src/FinalJeopardyEditor.tsx`.

Almost no new design decisions are needed here — palette, typography, the `Button`/`Field` variant taxonomy, and the `@gameshow/ui` → `round-ui` → apps dependency direction are all already established and proven against Jeopardy's harder cases (a grid board, host/contestant permission branching, a wager form). This milestone is largely application of that existing system to the two remaining round types, plus two small additions scoped during review (see below): a container treatment for `WheelEditor`'s wedge list, and a two-column desktop layout for `WheelEditor` so its `WheelGraphic` preview sits alongside the form instead of stacked beneath it.

## What

- **`round-ui`**:
  - `SolutionBoard` (currently a bare `<ul>`/`<li>` list of raw strings) becomes boxed letter tiles per row — token surface/border colors, `font-display` for revealed letters — the standard Wheel-of-Fortune puzzle-board look. Same `rows: string[]` prop; existing test queries in `solution-board.test.tsx` should keep working unchanged (text content and per-row structure aren't changing, just presentation), same as `board-grid.tsx`'s restyle in the prior milestone.
  - `WheelGraphic`'s SVG wedges currently rely on bare `currentColor` for stroke/fill with no color set anywhere. Wedge outlines, the highlighted (just-landed-on) wedge's fill, and the label text get real token colors — via `className`s on the `<path>`/`<text>` elements (SVG inherits `currentColor` from Tailwind `text-*` utilities the same as any other element, no special-casing needed).
- **`player-app`**:
  - `WheelBoard.tsx` — `HostWheelBoard`: Correct/Incorrect/Skip turn/End round → `Button` (danger/secondary/danger per the same destructive-vs-primary judgment used in `JeopardyBoard`). `ContestantWheelBoard`: Spin/Buy a Vowel/Solve/Cancel → `Button`; `LetterButtons` (both the vowel-purchase and consonant-guess grids) → a compact grid of `Button size="sm"`, mirroring the Jeopardy board's clue-cell button treatment.
  - `FinalJeopardyBoard.tsx` — `MediaWaitingPanel`/the `status === 'loading'` panel restyled to match `JeopardyBoard.tsx`'s already-restyled `MediaWaitingPanel` (same pattern, just reused here). Wager/answer forms (`ContestantFinalJeopardyBoard`) → `Field`. Start wagering/Reveal clue/Start reveal/Reveal answer/Reveal wager/Correct/Incorrect/Submit wager/Submit answer → `Button`.
- **`builder-app`**:
  - `WheelEditor.tsx` — Title/Category/solution-row inputs/Vowel cost/Solve bonus → `Field`; the wedge-kind `<select>` + cash value input in `AddWedgeForm` → `Field` (`as: 'select'` for kind, matching the discriminated-union support `Field` already has); Default/Shuffle/Add wedge/Remove/Export round → `Button`.
    - The wedge list (`WedgeRow` items, currently a bare `<ul>`/`<li>`) gets a bordered/surfaced container — same `rounded-lg border border-border bg-surface-1 p-4` pattern as `JeopardyEditor`'s "Edit clue" panel — rather than just swapping the `Remove` button and leaving the list itself unstyled.
    - Layout: the editor becomes two columns on desktop — form controls (title/category/solution/wedges/vowel cost/solve bonus) in one column, the `WheelGraphic` preview in the other — collapsing to a single stacked column on mobile/portrait widths (a responsive `grid`/Tailwind breakpoint, no new tokens or primitives). This is a small layout change scoped in during review, not part of the original "mechanical restyle" framing, but stays within the same "no new design decisions" spirit since it reuses existing breakpoints and spacing tokens.
  - `FinalJeopardyEditor.tsx` — Title/Category/Clue text/Answer text → `Field`; Export round → `Button`. Its two `MediaField` usages need no changes — that component was already restyled in the prior milestone and is shared as-is. The `<article>` preview block gets token text classes only (no structural change).
- **Tests**: existing tests in `round-ui`, `player-app`, and `builder-app` (`solution-board.test.tsx`, `wheel-graphic.test.tsx`, `WheelEditor.test.tsx`, `FinalJeopardyEditor.test.tsx`, plus any `WheelBoard`/`FinalJeopardyBoard` coverage) keep passing, updated only where markup structure changes — no behavioral test changes expected, same ground rule as the prior milestone.

**Explicitly out of scope**: any new primitives or tokens (this is `Button`/`Field` and the existing palette only, same as before); any change to round logic, room logic, or `party`; the vertical-space/layout-proportion rework flagged for the Jeopardy screens during the last milestone's review (`future-enhancements.md`) — that's a layout/IA change, not a styling one, and applies to a different set of screens than this milestone touches; the host-only queue-controls and media-ready-gate-timing issues also logged in `future-enhancements.md` (both are behavior bugs, unrelated to styling).

## Why

Closes out the one explicit gap left by the prior milestone: right now Wheel of Fortune and Final Jeopardy are the only screens in either app still rendering raw, unstyled HTML, which is a visibly inconsistent experience for anyone who plays more than one round type in the same session. The primitives and tokens are already proven against Jeopardy's harder interaction patterns, so this is expected to be substantially mechanical — no new component design work, just applying an established system to the two remaining call sites.

## Done when

- `SolutionBoard` and `WheelGraphic` (`round-ui`) render with token colors/typography instead of unstyled defaults.
- Both host and contestant Wheel of Fortune boards (`player-app`) use `Button`/`Field` throughout — no raw unstyled `<button>`/`<input>`/`<select>` remaining.
- Both host and contestant Final Jeopardy boards (`player-app`), including the media-waiting panel, wager form, and answer form, use `Button`/`Field` throughout.
- `builder-app`'s `WheelEditor` and `FinalJeopardyEditor` are restyled on the shared primitives and tokens.
- `WheelEditor`'s wedge list renders inside a bordered/surfaced container, not a bare list.
- `WheelEditor` shows the `WheelGraphic` preview as a second column on desktop widths and as a single stacked column on mobile/portrait widths.
- `typecheck`, `lint`, `test`, and `build` stay green across the monorepo.
