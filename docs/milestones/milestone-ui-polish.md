# Next milestone: shared design system + UI polish pass (shell + Jeopardy)

**Status: Not started.**

## Context

Every round type has a working builder editor and both host/contestant boards render correctly end to end, but neither `player-app` nor `builder-app` has ever had any styling applied — both `package.json`s have zero styling-related dependencies (no Tailwind, no CSS-in-JS, nothing) and the markup is raw, unstyled HTML: bare `<button>`, `<input>`, `<form>`, `<ul>`/`<li>` throughout `player-app/src/App.tsx`, `player-app/src/JeopardyBoard.tsx`, and every `builder-app` editor. Forty-plus button instances alone repeat the same handful of interaction patterns (submit a form, confirm a destructive action, reorder a list item) with no shared visual language, which is exactly the "dozens of variations of the same classes" outcome to avoid once real styling is added.

`packages/round-ui` already exists as a shared package consumed by both apps, but it's narrowly scoped to round-shape-specific, schema-typed presentational components (`JeopardyBoardGrid`, the Wheel solution board/wedge/graphic) — it has no generic, schema-agnostic UI atoms (buttons, form fields) and no dependency of its own to draw them from.

## Design decisions

- **A new package, `@gameshow/ui`, holds the design tokens and generic primitives — `round-ui` is not repurposed for this.** `round-ui`'s components are inherently schema-typed (they take `JeopardyBoardData`-shaped props); a `Button` or `Field` is not. `round-ui` itself needs generic primitives just as much as the two apps do (e.g. the buttons rendered inside `renderCell` callbacks), so the dependency chain is `@gameshow/schema` → `@gameshow/ui` (new, no schema dependency) → `@gameshow/round-ui` (depends on both) → `builder-app` / `player-app` (depend on all three). Renaming `round-ui` itself is out of scope.
- **Tailwind CSS v4, CSS-first config.** No separate `tailwind.config.js` — tokens are declared directly in a `@theme` block in a single CSS file. Styling is applied via `cva` (`class-variance-authority`) for variant/size class composition and `tailwind-merge` (wrapped around `clsx`) so a consuming app can still pass a one-off `className` without it fighting the generated classes.
- **Color tokens**, adapted from an earlier prototype's palette with renamed/reassigned roles:
  - Backgrounds: `--color-surface-0` `#090412` through `--color-surface-3` `#241944` (darkest to lightest).
  - Text: `--color-strong` `#f8f4ff`, `--color-muted` `#c7bcd9`.
  - Semantic accents, each with a `-soft` translucent variant via `color-mix(in srgb, <color> 22%, transparent)`: `--color-primary` `#ff4fa3` (hot pink), `--color-secondary` `#8b5cff` (purple), `--color-success` `#3fd7ff` (cyan), `--color-danger` `#ff6b7a` (coral-red), `--color-accent` `#ffc857` (amber).
  - `--color-border`, derived rather than a new hue: `color-mix(in srgb, var(--color-strong) 12%, transparent)` — a starting value, easy to retune once rendered.
- **Glow tokens**, one per "real" variant color: `--shadow-glow-primary/secondary/danger/success/accent`, each a colored `box-shadow` used on hover for `primary`/`secondary`/`danger` buttons. A sparing text-glow utility exists for hero numbers/headlines only (round scores, the Jeopardy category values) — not applied broadly. No new tokens needed for gradients; Tailwind's built-in gradient utilities already compose with the color tokens directly.
- **Typography**: **Barlow Condensed** for body/UI text (buttons, labels, board content) and **Audiowide** for headings and hero numbers — both self-hosted via `@fontsource` packages (bundled by Vite, no runtime dependency on a font CDN) rather than the prior prototype's Bahnschrift, which is a Windows-only system font and not available cross-platform or on mobile — a real risk for a game played across arbitrary devices.
- **Spacing and radius**: Tailwind's default scale, unchanged.
- **Shared variant taxonomy**: every primitive that needs one takes `variant` (`primary` / `secondary` / `danger` / `ghost`) and `size` (`sm` / `md` / `lg`) props, named identically across primitives so the vocabulary doesn't drift component to component. `ghost` (no fill/border, text-only, subtle background tint on hover instead of a glow) covers the many low-emphasis repeated actions already in the codebase (queue reorder arrows) that shouldn't compete visually with primary actions.
- **Shared interaction states**: hover uses the glow token matching the element's variant (ghost uses a background tint instead, to keep glow meaningful); disabled drops to reduced opacity plus `pointer-events: none`; focus uses a visible `focus-visible` ring colored to match the element's own variant rather than one global color.
- **One theme file**: `@gameshow/ui` owns a single CSS file (containing the `@theme` block) that both apps `@import` once from their own entry stylesheet — neither app defines or overrides tokens itself for this milestone.
- **Scope: shell + Jeopardy, not every round type.** "Shell" means the chrome common to every round regardless of type — `player-app`'s landing/join screens, lobby view (room code, player list, queue list, host controls), and `builder-app`'s `RoundPicker` landing page. "One round type" means fully restyling both the host and contestant Jeopardy board (`player-app/src/JeopardyBoard.tsx`) plus its builder editor (`builder-app/src/JeopardyEditor.tsx`) — chosen because Jeopardy is the flagship round type with the most complete host/contestant/builder surface already built, and its grid layout plus buzzer/wager interactions are a good stress test for whether the primitives hold up against real domain content. Wheel of Fortune and Final Jeopardy's boards and editors are explicitly **not** restyled this pass — they stay functional and unstyled until a follow-up milestone applies the now-proven primitives to them.

## What

- **New package `packages/ui` (`@gameshow/ui`)**: no dependency on `@gameshow/schema`; `react` as a peer dependency; `class-variance-authority`, `clsx`, `tailwind-merge` as dependencies. Exports the theme CSS file, `Button`, and `Field` (a label + input/select/textarea + error-text wrapper, covering every form field currently hand-rolled in both apps).
- **`round-ui`**: gains a workspace dependency on `@gameshow/ui`; `JeopardyBoardGrid`'s `<table>`/`<th>`/`<td>` get token-driven spacing/border classes (still layout-only — no behavior change).
- **`player-app`**: adds Tailwind + its Vite plugin, imports the shared theme; `JoinForm` and the create/join landing pieces, `ConnectedRoom`'s shell (room code display, players list, queue list, `HostControls`), and both `HostJeopardyBoard`/`ContestantJeopardyBoard` are rebuilt on `Button`/`Field` and the token classes.
- **`builder-app`**: adds Tailwind + its Vite plugin, imports the shared theme; `RoundPicker` and `JeopardyEditor` are rebuilt on `Button`/`Field`. `WheelEditor` and `FinalJeopardyEditor` are untouched.
- **Tests**: `@gameshow/ui` gets render/variant-class tests for `Button` and `Field`; existing tests in both apps (`App.test.tsx`, `JeopardyEditor.test.tsx`, etc.) keep passing, updated only where markup structure changes (e.g. a label now wraps differently) — no behavioral test changes expected.

**Explicitly out of scope**: restyling Wheel of Fortune or Final Jeopardy's boards or builder editors; any new interactive primitives beyond `Button`/`Field` (Dialog, Toast, Dropdown — shadcn/ui is set aside for now and could be revisited if one of these becomes needed); any change to round logic, room logic, or `party`; the room-codes milestone's new screens (they'll be built directly on these primitives once both land, in whichever order they end up shipping).

## Why

This was requested directly to stop unstyled, ad hoc markup from calcifying into "dozens of variations of the same classes" as more screens get built (the room-codes milestone alone adds several new ones). Scoping to shell + one round type — the same incremental pattern used for the three round-type milestones — proves the token/primitive approach against real, already-built domain UI (forms, lists, a grid board, host/contestant permission branching) before committing to restyle everything at once.

## Done when

- `@gameshow/ui` exists, has no dependency on `@gameshow/schema`, and exports the shared theme CSS plus `Button` and `Field`.
- Both apps import the shared theme and render with the synthwave palette (surfaces/text/accents), glow, and Barlow Condensed/Audiowide typography instead of user-agent default styling.
- `player-app`'s landing/join screens and lobby chrome (room code, players, queue, host controls) use `Button`/`Field` throughout — no raw unstyled `<button>`/`<input>` remaining in those pieces.
- Both host and contestant Jeopardy boards (`player-app`) and `builder-app`'s `RoundPicker`/`JeopardyEditor` are restyled on the shared primitives and tokens.
- Wheel of Fortune and Final Jeopardy boards/editors remain functionally unchanged and visually untouched.
- `typecheck`, `lint`, `test`, and `build` stay green across the monorepo.
