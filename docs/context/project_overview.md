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
