# Code standards

- TypeScript strict mode, Node 20, ESM. No `any`; use `unknown` and narrow.
- Validate every external input with zod at the boundary: webhook payloads, MCP tool arguments,
  environment variables, GitHub responses used for decisions.
- `core/` and `conditions/` are pure: no I/O, no clock reads (pass `now` in), no randomness.
  Everything that touches the network, disk or clock lives in `sources/`, `store/`, `watcher/`,
  `room/`, `mcp/`.
- Errors: typed error classes (`InvalidTransition`, `NotAuthorized`, `SourceUnavailable`, ...).
  No silent catches.
- Logging: pino with redaction paths for tokens and secrets. Log ids, not message bodies.
- Database: migrations in `store/migrations`, run on startup. All multi-step writes in a transaction.
- Tests: vitest. Every condition type has true/false/unobserved tests. The state machine has a test
  per allowed and rejected transition. Fire-once has a concurrency test.
- Dependencies allowed without asking: better-sqlite3, zod, hono, @hono/node-server, @octokit/rest,
  @octokit/webhooks-methods, @modelcontextprotocol/sdk, pino, vitest, tsx, eslint, typescript.
  Anything else: ask first.
- Small modules (under ~200 lines). Clear names over comments; comment only the why.
- Commit messages: imperative, one unit per commit.
