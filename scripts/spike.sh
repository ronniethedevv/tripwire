#!/usr/bin/env bash
#
# Tripwire Day-1 room-posting spike (path A). Run this on the VM BEFORE Nov 4.
#
# It (1) probes the agent bridge base URL with the public GET /health, then
# (2) posts ONE plain message into the room as the tripwire agent via the
# connectionless POST /agents/{id}/message.
#
# Reads env vars ONLY — it writes no config and never prints the API key.
# Set these first (see .env.example), e.g.  `set -a; . ./.env; set +a`:
#   SWITCH_BRIDGE_URL     agent bridge base URL (NOT the Gateway URL)
#   SWITCH_AGENT_ID       the tripwire agent id
#   SWITCH_AGENT_API_KEY  the tripwire agent API key
#   ROOM_ID               target room id
#   SPIKE_MESSAGE         optional; the message body (single line)
#
# Verified against sandbox-quantum/switch @ a620ab6:
#   - GET /health is public and is the correct base-URL probe
#     (docs/official/internals/agent-protocol.md:17-21)
#   - POST /agents/{id}/message  body {room_id, content}, Bearer agent API key,
#     returns {"ok":true,"event_id":...}
#     (core/switch_core/bridges/agent/api/handlers.py:467-486)
set -euo pipefail

: "${SWITCH_BRIDGE_URL:?set SWITCH_BRIDGE_URL to the agent bridge base URL (not the Gateway URL)}"
: "${SWITCH_AGENT_ID:?set SWITCH_AGENT_ID to the tripwire agent id}"
: "${SWITCH_AGENT_API_KEY:?set SWITCH_AGENT_API_KEY to the tripwire agent API key}"
: "${ROOM_ID:?set ROOM_ID to the target room id}"

BASE="${SWITCH_BRIDGE_URL%/}"
MESSAGE="${SPIKE_MESSAGE:-Tripwire path-A spike: if you can read this in the room, POST /message works.}"

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

# Escape a string for a JSON double-quoted value (backslash and quote only; keep
# the message single-line so no control-char escaping is needed).
json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  printf '%s' "$s"
}

echo "== 1/2  GET ${BASE}/health =="
health_code="$(curl -sS -o "$body" -w '%{http_code}' "${BASE}/health" || echo "000")"
echo "HTTP ${health_code}"
sed 's/^/  /' "$body" 2>/dev/null || true
echo
if [ "${health_code}" != "200" ]; then
  echo "WARN: /health did not return 200. A 401 means the right host but the wrong path;"
  echo "      anything else likely means SWITCH_BRIDGE_URL is not the bridge base URL."
  echo
fi

payload="{\"room_id\":\"$(json_escape "$ROOM_ID")\",\"content\":\"$(json_escape "$MESSAGE")\"}"

echo "== 2/2  POST ${BASE}/agents/${SWITCH_AGENT_ID}/message =="
post_code="$(curl -sS -o "$body" -w '%{http_code}' \
  -X POST "${BASE}/agents/${SWITCH_AGENT_ID}/message" \
  -H "Authorization: Bearer ${SWITCH_AGENT_API_KEY}" \
  -H 'Content-Type: application/json' \
  --data "$payload" || echo "000")"
echo "HTTP ${post_code}"
sed 's/^/  /' "$body" 2>/dev/null || true
echo

case "$post_code" in
  200) echo "OK — message posted. Confirm it appeared in the room, then check an @builder mention wakes it." ;;
  401) echo "401 — bad or missing SWITCH_AGENT_API_KEY." ;;
  403) echo "403 — not permitted: check the agent's addressing policy / room membership (see S3)." ;;
  404) echo "404 — unknown agent id or room id." ;;
  422) echo "422 — blocked by a Switch guardrail." ;;
  429) echo "429 — budget exceeded; retry later." ;;
  *)   echo "Unexpected status ${post_code}; see the body above." ;;
esac

[ "$post_code" = "200" ]
