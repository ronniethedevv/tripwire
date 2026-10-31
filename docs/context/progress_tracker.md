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
1. **Room-posting spike (path A). ✅ VALIDATED 2026-11-01.** On the live Switch `0.31.0` stack
   (Discord bridge, room `launch-room`): registered an **external** agent `tripwire` in the Gateway,
   added it to the room, then `POST /agents/{id}/message {room_id, content}` returned `{"ok":true,
   "event_id":...}` and the message appeared in `#launch-room` under the `tripwire` name. **Path A
   confirmed — no WebSocket/session/heartbeat needed to post; the connectionless `/message` route is
   enough.** Room id comes cleanly from the `list_rooms` op (`{room_id, name, ...}`); no gotchas.
   Still to validate: `@builder` wake (needs builder as a live provider-backed agent, not an external
   one — a later step).
   Run `scripts/spike.sh` on the VM (reads env vars only) to exercise `GET /health` + one
   `POST /message` before Nov 4. **Spike questions — answered in source @ `a620ab6`; confirm live:**
   - **S1 — Does posting as `tripwire` echo back to the Console-run `tripwire` session? NO.** An
     agent's own posts are excluded from its own stream: room messages "it sent" are classified "not
     conversation for this agent" and the stream advances past them without delivery — independent of
     `filter`. So path A posting as `tripwire` creates no self-loop and needs **no separate identity**
     for loop-safety. (`core/switch_core/bridges/agent/protocol/stream.py:465-473`; "own events" are
     "events meant for the agent, not ones it sent" `.../protocol/message_events.py:4-6`;
     `console/packages/switch-agent-runtime/src/positions.ts:9,18-20`.) A separate `tripwire-watcher`
     identity is only wanted if we ever want the `tripwire` *session* to react to a watcher post —
     which we don't (the watcher writes cards deterministically). Fallback if live behaviour differs:
     register `tripwire-watcher` as its own agent (see S2 registration-token path) and post as it.
   - **S2 — API key issue/store/export for a Console-registered agent.** Minted once as
     `secrets.token_urlsafe(32)`; stored BOTH as a SHA-256 hash (auth lookup) AND keyring-encrypted
     (`encrypted_key`). Agent keys are NOT hash-only (only `controller`/`controller_enrollment` are),
     so the owner can get the plaintext to the VM three ways: (a) capture it at registration (returned
     once), (b) reveal it later via Gateway `GET /api-keys/{key_id}/reveal` (owner-only → 403
     otherwise, audited `API_KEY_REVEALED`), or (c) rotate by re-registering with `overwrite=True`.
     Store it in VM env as `SWITCH_AGENT_API_KEY`. (`.../protocol/agent_core.py:513-515,517-528`;
     reveal `core/switch_core/gateway/api_keys.py:114-139`; `HASH_ONLY_KEY_TYPES`
     `core/switch_core/db/models.py:3780`; auth-by-hash `.../bridges/agent/auth.py:481-504`.)
     **Fallback (no Console reveal needed): register the watcher as its own custom agent via a
     registration token** — `POST /agents/register-known` (bearer = the registration token) returns
     `{id, api_key}` once; keep that key in VM env. (`docs/official/internals/agent-protocol.md:331`.)
     Note the reveal route is on the **Gateway**, not the agent bridge — different host.
   - **S3 — Same-owner addressing default + reliable agent-to-agent mentions.** Every new agent
     (registration, `create_agent`, template runs, Switch Console) defaults to
     `owner_and_owner_agents`: the owner plus any agent that owner runs. So `tripwire` and `builder`,
     sharing one owner, can address each other with **no setting change**. For a cross-owner /
     multi-vendor agent, set the policy to `anyone` (an agent with no rules is open — matches the
     setup-video "who can talk to your agent = anyone" note). Choices:
     `owner_only | owner_and_owner_agents | anyone | custom`.
     (`core/switch_core/addressing.py:41,276-306,309`.)
2. **Core loop model + state machine (pure) + tests. ✅ DONE 2026-11-01.** `src/core`: `types.ts`
   (Loop/Condition + enums), `errors.ts` (`TripwireError`/`InvalidTransition`), `stateMachine.ts`
   (pure `applyTransition`/`canApply`), `loop.ts` (`createLoop` factory; agent_block self-arms when
   waiter==creator). 26 tests green (every allowed + rejected transition, no-mutation, factory cases).
   No I/O, no clock reads.
3. **SQLite store + migrations. ✅ DONE 2026-11-01.** `src/store`: `migrations.ts` (versioned runner +
   the 5-table schema — loops/conditions/events/firings/audit — with `firings.loop_id` PK for fire-once
   (I1), `conditions.loop_id` UNIQUE, `events.dedupe_key` UNIQUE) and `store.ts` (WAL + foreign keys,
   zod row-validation at the DB boundary, `transaction` helper, `insertLoop`/`getLoop`/`listLoops`,
   `recordFiring` (one transaction, insert-or-ignore → fired|already_fired), `appendAudit`). 8 tests
   including fire-once across two connections to one file. tsconfig gained `esModuleInterop`.
4. **GitHub webhook ingest (Hono) → events table. ✅ DONE 2026-11-01.** `src/watcher/githubWebhook.ts`:
   pure `normalizeGithubEvent` (pull_request/issues/check_suite/check_run → repo+number/ref, else null)
   + `createWebhookApp` (verify `x-hub-signature-256` via `@octokit/webhooks-methods`, safe delivery-id,
   write raw payload to a file, `store.insertEvent` deduped on delivery id, return 200 — no GitHub
   calls / posts / model work in the request, I3). Added `Store.insertEvent`/`getEventByDedupeKey` and a
   shared redacting pino `src/logger.ts`. 10 tests (normaliser + handler: signature-reject, dedupe,
   store-and-return with payload-on-disk, unknown-event, missing-headers). 44 tests green total.
5. **`github.pr_merged` condition (pure) + GitHub source client.** `src/conditions/pr_merged.ts`
   params schema + `evaluate()→true|false|unobserved`; `src/sources` Octokit client with 3× backoff
   (1s/4s/16s) → unobserved on failure (I2). Test true/false/unobserved.
6. **Evaluator + heartbeat wired to the path-A poster — PR-merged fires into the room.** Evaluator
   picks up armed loops matching an event, live re-check (<60s), fires once in one transaction, posts
   via the poster; 120s heartbeat re-checks all armed loops. Day-1 goal: merging a watched PR posts in
   the room. Test fire-once under concurrency, never-fire-on-unobserved, matching-loop selection.

## Log (newest first)
- 2026-11-01 — Day 1 unit 4 done: GitHub webhook endpoint (`src/watcher/githubWebhook.ts`, Hono) that
  verifies the signature, normalises + stores the event deduped on delivery id, and returns 200 with no
  checking in the request (I3). Added events-table store access and a shared redacting logger. 44 tests
  green. typecheck/test/lint green.
- 2026-11-01 — Day 1 unit 3 done: SQLite store + migrations in `src/store` (WAL, 5-table schema, zod
  row-validation, transaction helper, fire-once `recordFiring`, audit). 34 tests green total, incl.
  fire-once across two connections. typecheck/test/lint green.
- 2026-11-01 — BUILD STARTED. Day 1 unit 2 done: pure core loop model + state machine in `src/core`
  (`types`, `errors`, `stateMachine`, `loop`) with 26 passing tests covering every allowed and rejected
  transition and the create-loop factory. typecheck/test/lint green. First feature code.
- 2026-11-01 — **Room-posting spike PASSED on the live stack (Day 1 unit 1).** Registered an external
  `tripwire` agent in the Gateway, added it to `launch-room`, and posted via
  `POST /agents/{id}/message` → `{"ok":true,...}`, message rendered in Discord `#launch-room` under the
  `tripwire` name. Path A (the preferred room-poster) is confirmed working; the biggest project risk is
  retired. This was done by hand (curl) to validate — the watcher will automate it in feature code.
- 2026-11-01 — Live deploy: Switch Core `0.31.0` is up (switch/gateway/postgres healthy, init-db exits as
  designed); Gateway admin reachable at `localhost:3000`, "System healthy". Finding: the **Gateway web UI**
  covers the spike path in-browser — Apps → `/collaborations` ("Register messaging app") connects Discord,
  `/agents` registers agents (incl. external `session_passive`), `/registration-keys` manages/reveals API
  keys. So the **desktop Switch Console is optional for the spike**; it's still needed later to run
  tripwire/builder as live Claude Code sessions. Env runs in WSL on the laptop for now — move to the
  always-on VM before demo day (risk table).
- 2026-11-01 — Corrected `docs/SETUP.md` section B against the real `standalone-compose:0.31.0` during a
  live VM deploy: the `oras` artifact ships only the compose yml (no `.env.example`), so the runbook now
  gives a ready-to-paste `.env` with `openssl`-generated secrets; the key-guarding secret is `SECRET_KEYS`
  (not `JWT_SECRET_KEY`, now legacy); the server name is hardcoded to `localhost` (not set via env);
  `COMPOSE_PROFILES=gateway` moved into `.env`. Still Phase 0, docs only.
- 2026-10-31 — Setup-day prep (still Phase 0, no feature code). CI on PR #1 is green. Added
  `docs/SETUP.md` (phone runbook: VM base, Switch Core compose deploy, Discord, Console remote host +
  agent onboarding, agent id/key into `/etc/tripwire.env`, spike + wake test, Unknowns), and
  `docs/agents/tripwire.md` (v0 persona) + `docs/agents/builder.md` (paste-ready Console fields). All
  verified against Switch @ `a620ab6`. Flagged a doc-vs-source discrepancy: onboarding doc says the
  addressing form "starts on Only me", but server + Console code default to `owner_and_owner_agents`.
- 2026-10-31 — Phase 0 done. Split the spec pack into `agents.md` + `docs/context/*`; researched
  Switch @ `a620ab6` (answered Q1–Q6 with file+line citations, raised conflicts C1 WebSocket-not-SSE
  and C2 task-protocol-removed); scaffolded Node 20 / TS strict / ESM / vitest / eslint + CI
  (typecheck + test). `typecheck`, `test` and `lint` all green locally. No feature code.
- 2026-10-31 — Spec pack written.
