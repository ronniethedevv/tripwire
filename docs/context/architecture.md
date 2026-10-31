# Architecture

## Components
1. Switch Core (self-hosted on the VM) + Discord room `#launch-room`.
2. `tripwire` agent — a Claude Code session registered in Switch Console. It reads language,
   drafts loops, and calls the Tripwire MCP tools. It never decides whether a condition is true.
3. `builder` agent — a second agent (Claude Code or Codex) that works in `demo-app` for the demo.
4. Tripwire MCP server (stdio, spawned by the tripwire agent's session) — tools over the store.
5. Watcher service (long-running Node process, systemd or docker compose) — webhook endpoint,
   evaluator loop, heartbeat poller, room poster.
6. SQLite database (WAL mode) shared by the MCP server and the watcher. Evidence snapshots are JSON
   files under `data/evidence/<loopId>/<timestamp>.json`, referenced by path from the database.

## Data model (SQLite)
- `loops`: id, room_id, kind (decision|agent_block), title, reason, waiter_type (human|agent),
  waiter_handle, owner_handle, source_ref (message id or transcript excerpt id), status,
  created_by, created_at, armed_by, armed_at, fired_at, closed_at, close_reason, expires_at
- `conditions`: id, loop_id (unique — one per loop), type, params_json, last_state
  (true|false|unobserved), last_checked_at, last_evidence_path
- `events`: id, source, type, repo, number_or_ref, dedupe_key (unique), payload_path, received_at
- `firings`: loop_id (unique — enforces fire-once), fired_at, evidence_path, room_message_ref
- `audit`: id, at, actor, action, loop_id, detail_json

## Loop state machine
proposed → armed → fired → closed(resolved)
proposed → closed(cancelled)
armed → closed(cancelled | expired)
fired → closed(resolved)
Any other transition is rejected with a typed error. `watching` is not a stored state: an armed
loop is being watched.

## Evaluation semantics
- `evaluate(condition, sourceSnapshot) → { state: 'true'|'false'|'unobserved', evidence }` is a pure
  function, unit-tested per condition type.
- A source fetch retries 3 times with exponential backoff (1s, 4s, 16s). If it still fails, the
  state is `unobserved`. Unobserved is never treated as true or false.
- Fire only when a live re-check, made within the last 60 seconds, returns `true`.
- Firing is one transaction: insert into `firings` (unique loop_id), set loop status `fired`, write
  evidence. If the insert conflicts, do nothing (already fired).

## Triggers (heartbeat + deviation)
- Deviation: a GitHub webhook arrives → store the event (dedupe on delivery id) → return 200
  immediately → the evaluator picks up armed loops whose condition matches the event's repo and
  number/ref, and re-checks them live.
- Heartbeat: every 120 seconds the evaluator re-checks every armed loop, spacing calls to respect
  GitHub rate limits. `time.after` loops are checked every heartbeat.

## Room I/O contract
Interface `RoomPoster.post(roomId, message: RoomMessage): Promise<RoomMessageRef>`.
Implementations, chosen by the Day 1 spike, recorded in progress_tracker.md:
- A. `SwitchAgentPoster` — the watcher connects as a custom agent via the Switch Agent Protocol and
  posts directly. Verify transport (SSE vs WebSocket), auth and endpoints in the Switch source.
- B. `DiscordMentionPoster` — the watcher posts into Discord and mentions @tripwire so Switch wakes
  the tripwire agent, which writes the card. Only valid if Switch relays bot-posted messages.
- C. `DiscordWebhookPoster` — the watcher posts the full card through a Discord webhook. Agents are
  not woken automatically; last resort.
Waking an agent = a room message that mentions it with a resume note (see ui_context.md).

## MCP tools (tripwire agent)
- `propose_loop` {kind, title, reason, waiter, owner, condition, source_ref, expires_at?} → loop id
- `propose_loops` {items[]} → ids (for transcript extraction)
- `arm_loop` {loop_id, confirmed_by, confirm_message_ref}
- `list_loops` {status?, room_id?}
- `explain_loop` {loop_id} → full record + last evidence
- `cancel_loop` {loop_id, by, reason}
- `resolve_loop` {loop_id, by, outcome}
Access rules enforced server-side, not by the agent:
- `arm_loop` and `cancel_loop` on `decision` loops require `confirmed_by`/`by` to be in
  `HUMAN_HANDLES` (env, comma-separated).
- `agent_block` loops arm on creation when `waiter_handle` equals the creator.
- No tool can mark a condition true or fire a loop. Only the watcher fires.

## Invariants (non-negotiable)
- I1 Fire at most once per loop (unique constraint, not application logic alone).
- I2 Never fire on unobserved data; never fire without a live re-check under 60 seconds old.
- I3 Webhook handlers only validate, store and return. No GitHub calls, no room posts, no LLM work
  inside a request.
- I4 Every fire message carries evidence links (PR/issue/check URL, timestamp).
- I5 Secrets live only in environment variables on the VM. Never in code, logs, room messages,
  evidence files or commits. Logs use redaction.
- I6 The model handles language only. Condition truth comes from deterministic code.
- I7 Every state change writes an `audit` row.

## Environment variables
`DATABASE_PATH`, `EVIDENCE_DIR`, `GITHUB_TOKEN_READONLY`, `GITHUB_WEBHOOK_SECRET`, `HUMAN_HANDLES`,
`ROOM_ID`, `POSTER_MODE` (A|B|C), plus whatever the chosen poster needs (Switch API URL, gateway
URL, agent credentials, or `DISCORD_WEBHOOK_URL`). Ship `.env.example` with names only.

## Directory layout
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
docs/context/  this pack
```
