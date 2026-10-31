# Tripwire spec pack

This file holds the full context pack for the Tripwire repo. Split it into the files marked
`=== FILE: <path> ===`, keeping each file's content exactly as written below its marker.

=== FILE: agents.md ===
# agents.md — read this first

You are building Tripwire for the Flip the Switch hackathon (Nov 4–7, 2026).

Before writing or changing any code, read these files in order:

1. docs/context/project_overview.md — what we build and what we don't
2. docs/context/architecture.md — components, data model, invariants
3. docs/context/code_standards.md — how code is written here
4. docs/context/ai_workflow_rules.md — how you work, step by step
5. docs/context/ui_context.md — exact formats of every room message
6. docs/context/progress_tracker.md — where we are, decisions, open questions

At the end of every unit of work, update progress_tracker.md before committing.
If anything in these files conflicts with what you find in the Switch source code,
stop and write the conflict into progress_tracker.md under Open questions.

=== FILE: docs/context/project_overview.md ===
# Project overview

## One line
Tripwire is a teammate in a Switch room that holds every "not now, when X" — from a person or an
agent — and wakes whoever was waiting the moment X happens, with the original reason and evidence.

## Why
In 10 real team meetings (GitLab, Rust, Kubernetes, Cloud Native Buildpacks) we counted about 25
conditional deferrals against about 10 firm decisions. Each deferral had an unblock condition
("when the PR lands", "once someone uses it", "next month"), and nobody watched it. Agents have the
same problem: they get blocked and nobody wakes them. Existing tools handle either human decisions
or agent waits, never both in one shared room.

## Core concept: the open loop
An open loop = something waiting + who waits (human or agent) + a condition + the reason + an owner
+ evidence when it fires. Kinds:
- `decision` — a human decision paused until a condition. Needs human confirmation to arm.
- `agent_block` — an agent's own work paused until a condition. Arms itself (it only wakes that agent).

## MVP flows
- F1 Explicit capture: "@tripwire hold <thing> until <condition>" → Tripwire drafts a loop and asks
  for confirmation → a human confirms → armed.
- F2 Agent self-block: "@tripwire I'm blocked until <condition>, wake me" from an agent → armed.
- F3 Transcript extraction: a human pastes a transcript excerpt → Tripwire proposes loops → a human
  confirms each one.
- F4 Fire: the watcher sees the condition become true on a fresh live check → posts the reopen card
  (decision) and/or a resume note mentioning the agent (agent_block). Exactly once per loop.
- F5 Ledger: "@tripwire open" lists every armed loop with its condition and status.
- F6 Close: the owner resolves or cancels a loop; loops can carry an expiry.

## Conditions in scope
- `github.pr_merged` {repo, number}
- `github.issue_closed` {repo, number}
- `github.checks_green` {repo, ref} (ref = branch name or PR head SHA)
- `usage.count_at_least` {needle, repos[], threshold} — counts files containing `needle` across a
  fixed list of watched repos
- `time.after` {at} (ISO 8601, UTC)

## Out of scope (hackathon)
Ambient listening to every message (stretch only, if Switch delivers all room messages), Slack/Teams
(Discord only), multi-tenant auth, a web dashboard, sources other than GitHub and the clock,
condition combinations (one condition per loop).

## Success criteria
- Merging a watched PR produces the room post in under 15 seconds via webhook, under 3 minutes via
  heartbeat alone.
- The full demo (see progress_tracker.md) runs three times in a row without manual fixes.
- No loop ever fires twice; no loop ever fires on unobserved data.

=== FILE: docs/context/architecture.md ===
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

=== FILE: docs/context/code_standards.md ===
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

=== FILE: docs/context/ai_workflow_rules.md ===
# Rules for AI agents working in this repo

1. One unit at a time. A unit is the smallest change that can be tested on its own.
2. Step gate for every unit: state the plan in 3–6 lines → implement → run `npm run typecheck`
   and `npm test` → update progress_tracker.md → commit. Do not start the next unit with a red
   test suite.
3. Never invent Switch APIs. Verify against the Switch source (github.com/sandbox-quantum/switch,
   the repo wins over docs) and, if available, the Switch docs MCP (https://docs.flintai.dev/mcp).
   Record what you verified (file path + commit) in progress_tracker.md.
4. Do not use Switch's agent-to-agent task tools. They were removed in v0.31.0 (Oct 20, 2026);
   the docs mirror still describes them.
5. Respect the invariants in architecture.md. If a task seems to require breaking one, stop and ask.
6. Keep pull requests small and focused. Each PR description says what changed and how it was
   tested.
7. Never print, commit or post secrets. Use `.env.example` for names only.
8. Hackathon rule gate: until the human writes "BUILD STARTED" in the session, do only research,
   context files and scaffolding — no feature code.
9. When unsure between two designs, pick the simpler one, note the alternative under Decisions in
   progress_tracker.md with a "revisit if" condition, and move on.

=== FILE: docs/context/ui_context.md ===
# Room message formats (Discord via Switch)

General: plain, short, scannable on a phone. Max ~1,200 characters per message (Discord's hard
limit is 2,000). Mention only the people or agents who must act. Times in UTC plus the room's
local zone (Africa/Lagos for the demo). Always link the evidence. No emoji except the three status
marks below.

Status marks: ⏳ armed · 🔔 fired · ✅ closed

## Proposal (asks a human to confirm)
```
Proposed hold: <title>
Waiting for: <condition in plain words>
Why we're waiting: <reason, one line>
Owner: @<owner>
Reply "yes" to arm, or tell me what to change.
```

## Armed
```
⏳ Holding: <title> — until <condition>. I'll bring it back the moment that's true.
```

## Reopen card (decision fired)
```
🔔 Ready to decide: <title>
What changed: <condition> — <evidence link> (<time>)
Why we waited: <reason>
Decide: @<owner>
Original discussion: <source link>
```

## Agent wake note (agent_block fired)
```
@<agent> you're unblocked: <condition> — <evidence link>. Resume: <title>.
```

## Ledger ("@tripwire open")
```
Open loops in this room (<n>):
1. ⏳ <title> — until <condition> — owner @<owner> — since <date>
...
```

## Unobserved notice (only once per loop, after 30 minutes unobserved)
```
I can't check "<condition>" right now (<source> unreachable). Still holding <title>; nothing fired.
```

=== FILE: docs/context/progress_tracker.md ===
# Progress tracker

## Phases
- [ ] Phase 0 — context pack, Switch research, scaffolding (no feature code)
- [ ] Day 1 (Nov 4) — room-posting spike; data model + state machine; webhook ingest + heartbeat;
      PR-merged condition fires a message into the room
- [ ] Day 2 (Nov 5) — MCP tools; confirmation flow; reopen card; agent wake note; ledger
- [ ] Day 3 (Nov 6) — transcript extraction; usage-count, checks-green, date conditions; hardening;
      CI + CodeRabbit; backup video
- [ ] Day 4 (Nov 7) — feature freeze at noon; README; demo video; submission

## Demo script (must pass three runs in a row)
1. Paste a Rust lang-team excerpt (move-ref pattern: "stabilize once the ecosystem uses it");
   Tripwire proposes loops; a human confirms.
2. Human: "@tripwire hold the pricing-page decision until design PR #3 merges."
3. builder: "@tripwire I'm blocked until demo-design PR #3 merges, wake me."
4. Merge PR #3 → reopen card + builder wake note within seconds → builder resumes and opens a PR.
5. "@tripwire open" shows what's still waiting.

## Decisions (append only: date — decision — why — revisit if)
- 2026-10-31 — One condition per loop — keeps evaluation simple for 4 days — revisit if the demo
  needs "A and B".
- 2026-10-31 — SQLite shared by two processes — no extra service on the VM — revisit if write
  contention appears.
- 2026-10-31 — Discord only — free, phone-friendly — revisit if judges require Slack.

## Open questions (answer with file path + commit from the Switch source)
- Q1 Current Agent Protocol transport (SSE vs WebSocket), auth and endpoints for a custom agent.
- Q2 How a custom agent sends a message into a room.
- Q3 Does Switch relay bot- or webhook-posted Discord messages to agents?
- Q4 What in `examples/` can we reuse for a custom agent?
- Q5 Confirm the task tools are gone in v0.31+ and nothing replaced them.
- Q6 Does an agent receive every room message, or only ones that mention it? (decides whether
  ambient deferral spotting is possible)

## Log (newest first)
- 2026-10-31 — Spec pack written.
