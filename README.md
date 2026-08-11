# game-show-redux

Quiz show maker: a Builder app for authoring quizzes and a Live Room app for
running them in real time. See [`docs/requirements.md`](docs/requirements.md)
and [`docs/architecture.md`](docs/architecture.md) for the product and
technical design.

## Packages

- `packages/schema` — shared quiz format, round-type contracts, wire types
- `packages/builder-app` — quiz authoring app (Vite + React)
- `packages/player-app` — live room app, host + contestant views (Vite + React)
- `packages/party` — realtime room server (Cloudflare Workers + Durable Objects, via `partyserver`)

## Development

```sh
pnpm install
pnpm dev          # run all packages in parallel
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Requires pnpm 11.21.0+ and Node 20+.
