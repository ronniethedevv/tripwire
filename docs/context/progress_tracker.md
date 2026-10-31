# Progress tracker

## Phases
- [x] Phase 0 — context pack, Switch research, scaffolding (no feature code)
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
- 2026-10-31 — Room-posting path A (SwitchAgentPoster), simplest form — the watcher fires by POSTing
  to the connectionless `POST /agents/{id}/message` route as the tripwire agent (its API key lives in
  VM env only), so reopen cards and wake-notes come from Tripwire itself with no WebSocket or heartbeat
  on the watcher. Native to Switch (strongest for judges), and the fire path is about as simple as
  path C while strictly better. Keep B (confirmed viable by Q3) then C as fallbacks — revisit if the
  live bridge rejects the `/message` route or waking an agent needs more than a name mention.
- 2026-10-31 — Toolchain-only devDeps beyond the allowed list (@types/node, @types/better-sqlite3,
  typescript-eslint, @eslint/js) — required to run the explicitly-requested eslint + TypeScript-strict
  toolchain on Node 20; they add no runtime surface — revisit if the maintainer wants them dropped.
- 2026-10-31 — PR base branch `main` seeded with tripwire-spec.md; Phase 0 work on branch `phase-0`
  (as the kickoff prompt directs) — the repo started empty with no default branch and a PR needs a
  base — revisit if the maintainer wants a different base.

## Switch research — answers
Source of truth: `sandbox-quantum/switch` @ `a620ab610945e006023f54831818f160eaf10b8a`
(fetched 2026-10-31). Agent-protocol contract revision **9**. Rule: source wins over docs
(ai_workflow_rules #3); two live docs were found stale — see Conflicts below.

- **Q1 — Agent Protocol transport, auth, endpoints (custom agent).**
  Transport: **WebSocket is primary now** — one WebSocket per connection, bidirectional ping/pong
  heartbeat carrying the read cursor. SSE down + `POST /agents/{id}/connection/beat` every 2s is the
  **legacy** path, kept only for clients on agent-protocol revision ≤7.
  Source: `core/switch_core/bridges/agent/protocol/agent_connections.py:76`
  (`Transport = Literal["websocket","sse"]`); `.../protocol/stream.py:6,119`;
  client `console/packages/switch-agent-runtime/src/event-stream.ts:12-27`; revision from
  `console/packages/switch-agent-runtime/src/artifacts.ts:44-47` (switch-core & agent-runtime speak 9,
  accept 1).
  Auth: agent API key as `Authorization: Bearer` on every call; a separate registration token used
  once at registration (`core/switch_core/bridges/agent/auth.py`; `docs/official/internals/agent-protocol.md:11-14`).
  Endpoints: open stream `GET /agents/{id}/events?connection_id&scope&filter&start_from[&rooms]`;
  claim room via the `connect_to_room` op or `POST .../connection/subscribe` / `.../connection/placements`;
  discover ops `GET /agents/{id}/ops`; invoke `POST /agents/{id}/ops/{op}` with `X-Switch-Connection-Id`;
  register `POST /agents/register-known`; post `POST /agents/{id}/message`
  (`core/switch_core/bridges/agent/api/handlers.py:467`). Probe the bridge base URL with public
  `GET /health` — it is usually NOT the Gateway URL (`.../agent-protocol.md:17-21`).

- **Q2 — How a custom agent posts into a room.**
  Two ways: (a) the `post_message` operation (`core/switch_core/bridges/agent/operations/definitions.py:773`),
  invoked at `POST /agents/{id}/ops/post_message` with the `X-Switch-Connection-Id` header (binds the
  call to the room); (b) the **connectionless** route `POST /agents/{id}/message` `{room_id, content}` —
  no open connection needed (`handlers.py:467-468`) — the right fit for the watcher.
  `send_targeted_message` (`definitions.py:800`) targets specific participants.

- **Q3 — Does Switch relay bot-/webhook-posted Discord messages to agents? YES.**
  The Discord adapter drops ONLY Switch's own bot posts and the bridge's own minted webhooks; comment
  verbatim: "Third-party bots/webhooks are still bridged."
  Source: `core/switch_core/bridges/collaboration/discord/adapter.py:2880-2886` (`_handle_message`);
  gateway pre-filter `core/.../discord/gateway.py:285-290`. A separate bot or third-party webhook
  message becomes a normal `message` event in the room → agents receive it. This makes path B and
  path C viable.

- **Q4 — What in `examples/` can we reuse for a custom agent?**
  `examples/` holds only declarative YAML (`agent-templates/{triage-pair,switch-expert.v2,support-desk,
  jq-expert}.template.yaml`, `room-templates/red-blue-workroom.template.yaml`) — configs for agents
  Switch Console RUNS, not a runnable client. The reusable CLIENT is
  `console/packages/switch-agent-runtime/` (`@sandboxaq/switch-agent-runtime` v0.8.0):
  `src/event-stream.ts` (connection + WS/SSE), `src/sse.ts`, `src/positions.ts` (resume cursor),
  `src/hosted.ts` (the Switch tool surface), `src/types.ts`. For a from-scratch agent the spec is
  `docs/official/internals/agent-protocol.md` §"Writing a client"; `switch-expert/` shows an agent's
  definition + knowledge. Plan: mirror `switch-agent-runtime` for path A; copy nothing from `examples/`.

- **Q5 — Task tools gone in v0.31+, nothing replaced them? CONFIRMED.**
  `CHANGELOG.md` under `### [0.31.0] - 2026-10-20`, `#### Removed`: the task protocol (`delegate_task`,
  `accept_task`, `update_task`, `finalise_task`, `cancel_task`, `list_tasks`) is gone from MCP and the
  operations door, `/agents/{id}/tasks…` HTTP routes answer `404`, and no task events are delivered.
  Verified absent from the live registry (`core/switch_core/bridges/agent/operations/`). Replacement:
  none — "Agents coordinate with `post_message` and `send_targeted_message`." (Confirms ai_workflow_rules #4.)

- **Q6 — Every room message, or only mentions? EVERY message, by default.**
  Default `filter=all`: a connection is delivered every event in the rooms it covers; the agent acts
  only on what addresses it. `filter=addressed` narrows delivery to notifiable (mentioning) messages.
  Source: `docs/official/internals/agent-protocol.md:44-49,224-237`;
  `.../life-of-a-message.md` ("Delivery is not acting"). So ambient deferral spotting IS technically
  possible (`scope=all, filter=all`) — but it stays out of scope for the 4-day build by choice
  (project_overview.md).

## Conflicts found (docs vs Switch source — source wins; raised per agents.md)
- **C1 — Transport.** Internals doc `docs/official/internals/agent-protocol.md:3,11` says "SSE down,
  HTTP up". Source says WebSocket is primary (protocol revision 9), SSE only legacy for revision ≤7
  (`agent_connections.py:76`, `stream.py:119`, `event-stream.ts:12-27`). Build path A on WebSocket;
  keep SSE as a fallback only. Matches third-party issue
  `Rafa-Innerchispa/innerops-agentic-platform#215`. (For firing cards we avoid the stream entirely —
  the `/message` POST is connectionless.)
- **C2 — Task protocol.** Internals doc `.../agent-protocol.md:211-222,312-327` still lists task
  events/ops as "present but not ready for use"; source removed them in 0.31.0 (CHANGELOG; registry
  empty). Do not build on tasks.

## Day 1 units (in order — one unit at a time, each with tests, per ai_workflow_rules #1–2)
1. **Room-posting spike (path A).** Against the live Switch bridge on the VM: `GET /health` finds the
   bridge base URL, then `POST /agents/{id}/message {room_id, content}` lands a plain message in
   `#launch-room`; confirm waking by posting a message that mentions `@builder`. Record the winner +
   any transport/addressing gotchas here. (De-risks everything; biggest risk first.)
2. **Core loop model + state machine (pure) + tests.** `src/core`: Loop/Condition types, the state
   machine (proposed→armed→fired→closed; rejected transitions throw `InvalidTransition`), typed errors.
   Test every allowed and rejected transition. No I/O, no clock (pass `now` in).
3. **SQLite store + migrations.** `src/store`: schema for loops/conditions/events/firings/audit
   (architecture.md), WAL mode, migrations on startup, `firings.loop_id` unique (I1), transaction
   helper. Test migrations + the fire-once unique constraint.
4. **GitHub webhook ingest (Hono) → events table.** `src/watcher`: validate signature
   (`@octokit/webhooks-methods`) + zod, dedupe on delivery id, store, return 200 immediately — no
   GitHub calls / no posts / no LLM in the request (I3). Test signature-reject, dedupe, store-and-return.
5. **`github.pr_merged` condition (pure) + GitHub source client.** `src/conditions/pr_merged.ts`
   params schema + `evaluate()→true|false|unobserved`; `src/sources` Octokit client with 3× backoff
   (1s/4s/16s) → unobserved on failure (I2). Test true/false/unobserved.
6. **Evaluator + heartbeat wired to the path-A poster — PR-merged fires into the room.** Evaluator
   picks up armed loops matching an event, live re-check (<60s), fires once in one transaction, posts
   via the poster; 120s heartbeat re-checks all armed loops. Day-1 goal: merging a watched PR posts in
   the room. Test fire-once under concurrency, never-fire-on-unobserved, matching-loop selection.

## Log (newest first)
- 2026-10-31 — Phase 0 done. Split the spec pack into `agents.md` + `docs/context/*`; researched
  Switch @ `a620ab6` (answered Q1–Q6 with file+line citations, raised conflicts C1 WebSocket-not-SSE
  and C2 task-protocol-removed); scaffolded Node 20 / TS strict / ESM / vitest / eslint + CI
  (typecheck + test). `typecheck`, `test` and `lint` all green locally. No feature code.
- 2026-10-31 — Spec pack written.
