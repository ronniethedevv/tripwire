# Tripwire

A teammate in a [Switch](https://github.com/sandbox-quantum/switch) room that holds every
"not now, when X" — from a person or an agent — and wakes whoever was waiting the moment X
happens, with the original reason and fresh evidence.

Built for the **Flip the Switch** hackathon (Nov 4–7, 2026).

> **Status: Phase 0 — scaffolding only.** No feature code yet. Feature work begins when the
> maintainer writes `BUILD STARTED` in the session (see `docs/context/ai_workflow_rules.md`, rule 8).

## Read first

The full context pack lives in [`docs/context/`](docs/context/) and is indexed by
[`agents.md`](agents.md). Read those before writing any code:

1. [`docs/context/project_overview.md`](docs/context/project_overview.md) — what we build and what we don't
2. [`docs/context/architecture.md`](docs/context/architecture.md) — components, data model, invariants
3. [`docs/context/code_standards.md`](docs/context/code_standards.md) — how code is written here
4. [`docs/context/ai_workflow_rules.md`](docs/context/ai_workflow_rules.md) — how to work, step by step
5. [`docs/context/ui_context.md`](docs/context/ui_context.md) — exact formats of every room message
6. [`docs/context/progress_tracker.md`](docs/context/progress_tracker.md) — where we are, decisions, Switch research (Q1–Q6)

## Toolchain

TypeScript (strict) on Node 20, ESM, vitest, eslint. Two processes share one SQLite file: the
MCP server (language) and the watcher (deterministic condition checking).

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | run the vitest suite once |
| `npm run lint` | eslint (flat config) |
| `npm run dev:watcher` | run the watcher service (stub in Phase 0) |
| `npm run dev:mcp` | run the Tripwire MCP server (stub in Phase 0) |

## Setup

```bash
nvm use            # Node 20
npm install
cp .env.example .env   # fill in on the VM; .env is git-ignored, never commit real values
```

## Layout

```
src/
  core/        loop model, state machine, errors (pure)
  conditions/  one file per condition type: params schema + evaluate() (pure)
  sources/     GitHub client with retries (I/O)
  store/       SQLite access, migrations
  watcher/     webhook server, evaluator loop, heartbeat
  room/        RoomPoster implementations + message renderers
  mcp/         MCP server and tools
test/          vitest, mirrors src/
docs/context/  the spec pack
```
