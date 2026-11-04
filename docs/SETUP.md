# Tripwire setup runbook (prep, Nov 1–3)

A numbered, phone-followable runbook to stand up the demo environment before Nov 4.
Steps that must be done on your **laptop** (in Switch Console or Discord's portal) are marked
**[LAPTOP]**. Everything else is run on the VM over SSH (a phone SSH app is fine).

**Provenance.** Verified against the Switch source `sandbox-quantum/switch` @
`a620ab610945e006023f54831818f160eaf10b8a`. Deploy commands drift between releases — Switch's own
docs say to take the server version from the registry at deploy time, not from this file
(`docs/official/deploy/self-host.md:36-50`). File citations below are paths in that repo at that commit.

See **Unknowns** at the end for the few things the source could not settle; confirm those on the day.

> **Placeholders.** Anything written like `<VERSION>`, `<VM_IP>` or `<tripwire agent id>` is a blank to
> fill in — replace the **whole** token, including the `<` and `>`. Never type the angle brackets into a
> shell: bash reads `<` as a file redirect and fails with `syntax error near unexpected token`. Where a
> value is reused, the steps set it once as a shell variable (e.g. `VERSION=0.31.0`) so you paste it plain.

---

## A. Fresh Ubuntu VM — Docker, Node 20, git, Claude Code

Requirements (from `docs/official/deploy/host-remotely.md`): Ubuntu 22.04 or 24.04 (not Windows),
x86_64 or arm64, **2 vCPU / 4 GB / 20 GB**, SSH with your public key + `sudo`, a public IP, and it
must be able to reach itself on the ports below.

1. Provision the VM and SSH in. Update: `sudo apt-get update && sudo apt-get upgrade -y`.
2. Install Docker (official convenience script), then add yourself to the `docker` group:
   ```sh
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker "$USER"   # log out and back in for this to take effect
   ```
3. Install git and Node 20 (NodeSource):
   ```sh
   sudo apt-get install -y git
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node --version   # expect v20.x
   ```
4. Install Claude Code and sign in:
   ```sh
   sudo npm install -g @anthropic-ai/claude-code
   claude            # complete the one-time sign-in; agents run under these credentials
   ```
5. Install `oras` (used to pull the published compose artifact in section B). Check the latest release
   tag at <https://github.com/oras-project/oras/releases> and install the matching Linux binary, e.g.:
   ```sh
   ORAS_VERSION=1.2.0
   curl -fsSLO "https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}/oras_${ORAS_VERSION}_linux_amd64.tar.gz"
   mkdir -p oras-install && tar -zxf "oras_${ORAS_VERSION}_linux_amd64.tar.gz" -C oras-install
   sudo mv oras-install/oras /usr/local/bin/ && rm -rf "oras_${ORAS_VERSION}_linux_amd64.tar.gz" oras-install
   oras version
   ```

> Note: Switch Console can also install the agent-provider CLIs, Node 18+, git and `tmux` for you when
> you onboard the VM as a remote host (section D) — so Claude Code and `tmux` can wait until then if you
> prefer. Docker, git, Node and `oras` are needed on the VM now for the manual Switch Core deploy.

---

## B. Deploy Switch Core on the VM

Switch publishes an all-in-one Docker Compose stack as an OCI artifact; it is a versioned contract
(`deploy/local/standalone-docker-compose.yml` header; `docs/official/deploy/self-host.md`).

1. Pick a version from the **registry** (not the GitHub releases page — server artifacts cut no GitHub
   release) (`self-host.md:36-48`):
   ```sh
   oras repo tags ghcr.io/sandbox-quantum/standalone-compose
   ```
   Choose the newest **stable** tag — a plain `x.y.z`, not an `-rc.N` candidate. Set it once (replace
   the value with the tag you picked; **no angle brackets**):
   ```sh
   VERSION=0.31.0
   ```
2. Pull the compose file (`RELEASING.md:423-424`):
   ```sh
   oras pull ghcr.io/sandbox-quantum/standalone-compose:"$VERSION"
   ```
3. Write the `.env` next to the compose file. The `oras pull` ships **only** the compose yml — there is
   no `.env.example` to copy — so create one. This block fills it with fresh random secrets (var names
   and defaults from `deploy/local/standalone-docker-compose.yml:203-240` and the repo's `.env.example`):
   ```sh
   cat > .env <<EOF
   SWITCH_VERSION=0.31.0
   COMPOSE_PROFILES=gateway
   SECRET_KEYS=k1:$(openssl rand -hex 32)
   DB_NAME=switch
   DB_USER=switch_app
   DB_PASSWORD=$(openssl rand -hex 24)
   DB_OWNER_USER=postgres
   DB_OWNER_PASSWORD=$(openssl rand -hex 24)
   AGENT_REGISTRATION_TOKEN=$(openssl rand -hex 24)
   GATEWAY_ADMIN_EMAIL=admin@switch.local
   GATEWAY_ADMIN_PASSWORD=$(openssl rand -hex 24)
   FRONTEND_BASE_URL=http://127.0.0.1:3000
   SWITCH_BIND_ADDR=0.0.0.0
   GATEWAY_PUBLIC_URL=http://127.0.0.1:3000
   EOF
   chmod 600 .env
   ```
   What matters, and why:
   - `SWITCH_VERSION` — required, no default; a wrong/missing value refuses to start.
   - `SECRET_KEYS` (`id:secret`, secret 32+ chars) — **the master key that encrypts stored API keys.
     Guard it.** Lose it and keys can't be read back (the section E reveal breaks). This supersedes the
     self-host doc's `JWT_SECRET_KEY`, which this release treats as legacy/optional
     (`standalone-docker-compose.yml:221-224`).
   - `AGENT_REGISTRATION_TOKEN` — agents register against this; reused in section E. **Save it.**
   - `GATEWAY_ADMIN_EMAIL` / `GATEWAY_ADMIN_PASSWORD` — your Gateway login, needed for the section E
     reveal. **Save the password.**
   - `SWITCH_BIND_ADDR=0.0.0.0` — publishes the ports beyond `127.0.0.1` so Switch Console on your laptop
     can reach them.
   - The server name is **hardcoded to `localhost`** in this compose (`MATRIX_SERVER_NAME`/`ID_SERVER_NAME`,
     lines 215/219) — you don't set it, and it can't change later.
   - For clickable Discord "Open in Switch Console" links, set `GATEWAY_PUBLIC_URL` (and `FRONTEND_BASE_URL`)
     to `http://<YOUR_VM_PUBLIC_IP>:3000` instead of `127.0.0.1`
     (`docs/official/deploy/messaging-apps/discord.md:122`).

   Save what you'll reuse: `grep -E 'AGENT_REGISTRATION_TOKEN|GATEWAY_ADMIN|SECRET_KEYS' .env`.
4. Start the core + Gateway (profiles come from `.env`; Mattermost/`collab` stays off — we use Discord):
   ```sh
   docker compose -f standalone-docker-compose.yml up -d
   docker compose -f standalone-docker-compose.yml ps     # services Up/healthy
   ```
   Harmless `MATTERMOST_* variable is not set` warnings are expected — those services are in the
   unused `collab` profile. If Docker says **"permission denied"**, log out and back in (so the `docker`
   group applies) or prefix with `sudo`. If it says **"Cannot connect to the Docker daemon"**, the daemon
   isn't running: on a systemd VM `sudo systemctl start docker`; on WSL (no systemd) `sudo service docker
   start`, or `sudo dockerd >/tmp/dockerd.log 2>&1 &` then `sudo docker ps` to confirm.
5. The three URLs (`self-host.md:61`; `/health` + `/agents` live on the bridge app
   `core/switch_core/main.py:1241`, `core/switch_core/bridges/agent/app.py:162-168`; Gateway mount
   `core/switch_core/gateway/app.py:212`):
   | URL | Address | What it is |
   | --- | --- | --- |
   | **API URL = agent bridge base URL** | `http://<VM_IP>:8000` | What Switch Console talks to, and where the watcher posts (`/health`, `/agents/...`). |
   | **Gateway URL** | `http://<VM_IP>:3000` | Admin surface; the `/api-keys/.../reveal` route (section E) lives here. |

   Confirm the bridge (from the VM itself, so localhost works): `curl http://127.0.0.1:8000/health` →
   `200` (a `401` means right host, wrong path;
   `docs/official/internals/agent-protocol.md:17-21`). **The agent API key travels in a header — put
   these behind TLS (a reverse proxy) or restrict the ports to your own IP / an SSH tunnel.**

> A VM reboot stops the stack (no restart policy); data is in Docker volumes and survives
> (`self-host.md`, `host-remotely.md`). Bring it back with the same `up -d`.

---

## C. Discord: bot, server, connect, channels

From `docs/official/deploy/messaging-apps/discord.md`. Discord reaches Switch over an **outbound**
connection, so nothing needs to be publicly reachable for Discord itself.

1. **[LAPTOP]** Discord Developer Portal → **New Application** ("Agent Switch") → **Bot** tab → copy the
   bot token (reset it if hidden). Save it in a password manager (`discord.md:18-22`).
2. **[LAPTOP]** Bot → **Privileged Gateway Intents**: enable **Server Members Intent** and **Message
   Content Intent** (without the latter, agents receive messages with no text), then **Save Changes**
   (`discord.md:24-31`).
3. **[LAPTOP]** **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permissions: View
   Channels, Send Messages, Send Messages in Threads, Manage Webhooks, Manage Channels, Manage Roles,
   Read Message History, Attach Files. Open the generated URL and add the bot to your Discord server
   (`discord.md:35-50`).
4. **[LAPTOP]** In Discord, create the server (if new) and two text channels: `#launch-room` (demo) and
   `#tripwire-dev`.
5. **[LAPTOP]** User Settings → Advanced → **Developer Mode** on. Right-click the server icon → **Copy
   Server ID** (this is the **Guild Id**) (`discord.md:52-56`).
6. **[LAPTOP]** Switch Console → pick the server → **Home** → **Messaging apps** → **Connect** →
   **Discord** → set Name, paste Bot Token and Guild Id → **Connect** (a bad token is reported here)
   (`discord.md:58-82`).
7. **[LAPTOP]** When prompted, **Link your Discord account** → search yourself → **This is me**. Without
   this, an owner-only agent treats your messages as a stranger's (`discord.md:84-87`).
8. **[LAPTOP]** Create the rooms: **post any ordinary message** in `#launch-room` and in `#tripwire-dev`.
   Posting is what creates the room (inviting the bot does not); each then shows under **Your Rooms**.
   A slash/`!` command can't be the first thing typed (`discord.md:89-103`).

---

## D. [LAPTOP] Switch Console: connect server, add VM as a remote host, register agents

From `docs/official/getting-started/{add-a-server,set-up-agent-providers,onboard-your-agents,create-a-room}.md`
and `host-remotely.md`. **All of section D is laptop work.**

1. Install Switch Console (desktop app; links in the Switch repo README). **Add a server → Connect to an
   existing server** → enter the **Gateway URL** (`:3000`) and **API URL** (`:8000`) from B5
   (`self-host.md:94-96`).
2. **Settings → Agent providers**: make sure **Claude Code** reads **Installed** (install it here if
   not). "Auto-trust worktree directories" is on by default, so Claude Code sessions don't hang on the
   folder-trust prompt (`set-up-agent-providers.md`).
3. **Settings → Remote hosts → Add host**: **SSH host** = an alias from your `~/.ssh/config` that points
   at the VM; **Display name** = something memorable. Work down the install rows (provider CLIs, git,
   `tmux`, Node 18+) until status is **Ready** (`host-remotely.md`).
4. Prepare the agents' working directories **on the VM first** — Switch Console **never clones your
   repo**, and an agent sees only what is already in its directory (`host-remotely.md` warning). The
   `tripwire` agent works **inside the Tripwire repo clone** — the same one the watcher runs in — so it
   has the MCP server on hand and shares the watcher's SQLite file:
   ```sh
   git clone https://github.com/ronniethedevv/tripwire ~/tripwire && (cd ~/tripwire && npm ci)   # tripwire agent + watcher both live here
   git clone <demo-app repo> ~/agents/builder/demo-app   # builder works only here; commit+push first
   ```
5. **Wire the Tripwire MCP tools into `~/tripwire` first** — without this the agent can only *talk*; it
   can't create or arm loops. Copy the example config, set the human handle(s), and auto-approve the
   server so the headless agent loads it without a prompt:
   ```sh
   cd ~/tripwire
   cp .mcp.json.example .mcp.json
   # HUMAN_HANDLES = the Discord handle(s) allowed to arm/cancel a *decision*. Include the BARE username
   # the agent actually passes (e.g. "ronnie_thedev"), not only the "@"-prefixed form — a mismatch here
   # makes arm fail with "doesn't recognise <handle> as a human handle".
   sed -i 's/@your-handle/ronnie_thedev,@ronnie_thedev/' .mcp.json
   mkdir -p .claude
   printf '{\n  "enableAllProjectMcpServers": true\n}\n' > .claude/settings.json
   ```
   Then **Your Agents → new agent → tripwire.** Run location = the VM host (or **This computer** if you
   run Switch Console locally); Provider = **Claude Code**; **Working directory = `~/tripwire`** (so it
   loads `.mcp.json` and shares the watcher's SQLite); **Name** = `tripwire`; **Description** and **Agent
   instructions** = paste from `docs/agents/tripwire.md`; **Who can talk to your agent** = **Anyone** (any
   teammate can park a loop) or **Only me and my agents** to keep it private; Auto mode on. Create.
   (`onboard-your-agents.md`)

   > **Restart the agent's session after any `.mcp.json` / `HUMAN_HANDLES` change** — the MCP server only
   > reloads on a fresh session (quit & reopen Switch Console, or end the session so the next mention
   > starts a new one).
6. **Your Agents → new agent → builder.** Run location = the VM host; Provider = Claude Code (or Codex);
   Working directory = `~/agents/builder/demo-app`; **Name** = `builder`; Description + instructions =
   paste from `docs/agents/builder.md`; **Who can talk** = **Only me and my agents** (so `tripwire` can
   wake it). Create.
7. In `#launch-room`, invite both (the room must already exist from C8) (`create-a-room.md:87-93`):
   ```text
   !invite-agent @tripwire
   !invite-agent @builder
   ```
8. If you had either agent already running in a terminal, restart it in its registered directory with
   `claude --continue` so it picks up the Switch identity (`onboard-your-agents.md`,
   "If the agent is already running").

> **Addressing note.** The onboarding doc's prose says the form "starts on Only me (default)", but both
> the server (`core/switch_core/addressing.py:299-306`) and Console
> (`console/apps/switch-console-desktop/src/shared/core/switch-servers/owner-policy.ts:60-63`) actually
> default to **owner + my agents**. Since `tripwire` and `builder` share one owner, they can address each
> other either way — but set it explicitly to be safe. For the "any vendor's agents" demo moment, set the
> relevant agent to **Anyone** (an agent with no rules is open, `addressing.py:41`).

---

## E. Get tripwire's agent id + API key into `/etc/tripwire.env` (chmod 600)

The watcher posts as `tripwire` via the connectionless `POST /agents/{id}/message`
(`core/switch_core/bridges/agent/api/handlers.py:467`), so it needs tripwire's **agent id** and **API
key**. The key is minted once as `secrets.token_urlsafe(32)` and stored as a SHA-256 hash **plus** a
keyring-encrypted copy (`core/switch_core/bridges/agent/protocol/agent_core.py:513-515`). Two ways to
get the plaintext onto the VM:

**Option 1 — register the posting identity via the registration token (captures the key once).** On the
VM, register `tripwire` (or a dedicated `tripwire-watcher`) directly; the response returns `{id, api_key}`
**once** (`agent-protocol.md:331`). Use `session_passive` for a post-only watcher (it holds no stream;
`agent-protocol.md:24-34`):
```sh
set -a; . ./switch.env; set +a   # a file holding API_URL and AGENT_REGISTRATION_TOKEN
curl -sS -X POST "$API_URL/agents/register-known" \
  -H "Authorization: Bearer $AGENT_REGISTRATION_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"agent_type":"session_passive","name":"tripwire","description":"Tripwire watcher poster"}'
# → {"id":"...","api_key":"..."}   (register the name in EXACTLY one place — here OR in Console, not both)
```

**Option 2 — reveal a Console-registered agent's key via the Gateway.** Agent keys are revealable (only
`controller` keys are hash-only, `core/switch_core/db/models.py:3780`). Authenticated as the owner on the
Gateway (`:3000`): list keys to find the id, then reveal it (`core/switch_core/gateway/api_keys.py:47,114-139`;
mounted at `/api-keys`, `gateway/app.py:212`):
```text
GET  {GATEWAY_URL}/api-keys                 → find the tripwire key's {key_id}
GET  {GATEWAY_URL}/api-keys/{key_id}/reveal → { "key": "<plaintext>" }   (owner-only, audited)
```
This needs `SECRET_KEYS` unchanged since registration (the master key that encrypts stored keys,
`standalone-docker-compose.yml:221`); if it changed, rotate by re-registering with `overwrite=True` instead.

Find the **agent id** from the Option 1 response, or in Console (Your Agents) / the `list_agents`
operation. Find the **room id** for `#launch-room` from Console (room details) or the `list_rooms`
operation.

Write the file, root-only:
```sh
sudo tee /etc/tripwire.env >/dev/null <<EOF
SWITCH_BRIDGE_URL=http://127.0.0.1:8000
SWITCH_AGENT_ID=<tripwire agent id>
SWITCH_AGENT_API_KEY=<key from Option 1 or 2>
ROOM_ID=<#launch-room room id>
EOF
sudo chmod 600 /etc/tripwire.env
ls -l /etc/tripwire.env     # expect -rw------- ; never commit this file
```

---

## F. Run the spike and confirm success

1. On the VM, in the Tripwire repo clone, load the env and run the read-only spike:
   ```sh
   cd ~/tripwire
   set -a; . /etc/tripwire.env; set +a
   bash scripts/spike.sh
   ```
2. **Success looks like:**
   - `GET /health` → **HTTP 200**.
   - `POST /message` → **HTTP 200** with `{"ok":true,"event_id":...}`
     (`core/switch_core/bridges/agent/api/handlers.py:486`).
   - The message appears in `#launch-room`, posted **under tripwire's own name** (Discord per-channel
     webhook, `discord.md:7,117`).
   - Prerequisite: tripwire is a member of `#launch-room` (D7) and `ROOM_ID` is that room — otherwise
     `403`/`404`.
3. **Builder wake test** (one real event wakes a blocked agent — the heart of the demo):
   - Re-run with a mention, e.g. `SPIKE_MESSAGE='@builder ping — reply in the room to confirm wake.' bash scripts/spike.sh`,
     or just type `@builder ...` in `#launch-room`.
   - Success: builder's session **starts on being addressed** and it replies in the room — Switch starts a
     session when an agent is addressed and none is running (`onboard-your-agents.md`, "Switch starts it
     for you"). This proves a mention reaches and wakes a same-owner agent.
   - If builder stays silent: check its addressing admits tripwire/you (section D note), that your Discord
     account is linked (C7), and that builder is in the room (D7).

---

## Unknowns (confirm on setup day)

- **U1 — Switch Core version.** Not knowable from this snapshot; read it at deploy time from
  `oras repo tags ghcr.io/sandbox-quantum/standalone-compose` (`self-host.md:36-48`).
- **U2 — "Who can talk" default.** Doc prose says "Only me (default)"; server + Console code both default
  to `owner_and_owner_agents` (`addressing.py:299-306`, `owner-policy.ts:60-63`). Resolved in favour of
  source, but set the policy explicitly in the form regardless.
- **U3 — Revealing a Console-registered agent's key.** The Gateway `/api-keys/{key_id}/reveal` route
  exists and agent keys are revealable, but a one-click "reveal" control in the Console add-agent UI was
  not confirmed in source. The reliable path for the watcher is Option 1 (register its posting identity
  via the token). Confirm the Console UI on the day.
- **U4 — Bridge URL under a Console-managed (SSH) server.** With the manual compose deploy here the bridge
  is the API URL `:8000`. If instead you let Switch Console run the server on the onboarded host, its
  address isn't one you hand out — the watcher on the VM would use `http://127.0.0.1:8000`. Settle it with
  `GET /health` during the spike.
- **U5 — Posting as tripwire vs a separate identity.** Source shows an agent's own posts are excluded from
  its own stream (no self-loop, `stream.py:465-473`) and `/message` is connectionless, but confirm live
  that posting needs only room membership, not an active session. Fallback: a dedicated `tripwire-watcher`
  identity (Option 1).
