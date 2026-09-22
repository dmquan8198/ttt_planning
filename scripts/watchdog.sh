#!/bin/bash
# Watchdog for the local AI backend (tailscaled+Funnel, ollama-bridge,
# Ollama) that Render's chatbot depends on. Runs on a timer via launchd
# (see README's "Dùng Ollama local cho app đang deploy trên Render"
# section for the LaunchAgent setup) rather than relying only on
# `brew services`/launchd KeepAlive on each piece individually, because
# the real failure mode observed twice in production was Ollama staying
# alive but WEDGED — `ollama ps` stuck at "Stopping..." forever, every
# request hanging — which looks perfectly healthy to a plain
# process-liveness check. Only an actual bounded-timeout generate call
# reveals that, so that's what step 3 below does.
set -uo pipefail

STATE_DIR="/Users/dmquan8198/.tailscale"
LOG="$STATE_DIR/watchdog.log"
TS_SOCKET="$STATE_DIR/tailscaled.sock"
TS_BIN="/opt/homebrew/opt/tailscale/bin/tailscale"
MODEL="${OLLAMA_MODEL:-qwen2.5:7b-instruct}"
UID_N="$(id -u)"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

# tailscaled and ollama-bridge each have their OWN LaunchAgent with
# KeepAlive=true (com.tttplanning.tailscaled / .ollama-bridge) — that's
# what restarts them if the process dies. This script must never
# pkill+nohup them itself: doing that races launchd's own supervision of
# the same process (this exact race killed tailscaled seconds after this
# watchdog's own first run, when both were loaded together) and ends up
# with two supervisors fighting over one process. `launchctl kickstart -k`
# is the correct way to force a restart THROUGH launchd instead.
kickstart() { launchctl kickstart -k "gui/$UID_N/$1" >> "$LOG" 2>&1; }

# --- 1. tailscaled + Funnel ---
if ! "$TS_BIN" --socket="$TS_SOCKET" status >/dev/null 2>&1; then
  log "tailscaled không phản hồi — kickstart lại qua launchd"
  kickstart com.tttplanning.tailscaled
  sleep 5
fi

if ! "$TS_BIN" --socket="$TS_SOCKET" status 2>/dev/null | grep -q "Funnel on"; then
  log "Funnel chưa bật — bật lại (proxy vào bridge, port 8787)"
  "$TS_BIN" --socket="$TS_SOCKET" funnel --bg 8787 >> "$LOG" 2>&1
fi

# --- 2. ollama-bridge (the small authenticated proxy — see
#     scripts/ollama-bridge.js for why it exists instead of exposing
#     Ollama directly) ---
if ! curl -s -o /dev/null -m 5 http://localhost:8787/api/health 2>/dev/null; then
  log "Bridge không phản hồi — kickstart lại qua launchd"
  kickstart com.tttplanning.ollama-bridge
  sleep 3
fi

# --- 3. Ollama itself: a REAL generate call with a bounded timeout, not
#     just /api/tags — /api/tags kept answering 200 both times Ollama was
#     actually wedged, since that endpoint doesn't touch the loaded model
#     at all. brew services restart is what has reliably unwedged it.
if ! curl -s -m 25 -X POST http://localhost:11434/api/generate \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"prompt\":\"hi\",\"stream\":false}" \
    2>/dev/null | grep -q '"done":true'; then
  log "Ollama không phản hồi trong 25s (nghi bị kẹt) — brew services restart ollama"
  brew services restart ollama >> "$LOG" 2>&1
  sleep 3
fi

log "Kiểm tra xong — tailscaled/Funnel/bridge/Ollama đều ổn."
