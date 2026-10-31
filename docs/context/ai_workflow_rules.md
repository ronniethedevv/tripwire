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
