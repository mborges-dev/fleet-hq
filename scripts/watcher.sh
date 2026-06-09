#!/bin/bash
# fleet-watcher — continuous activator for Fleet agents
# Replaces fixed cron schedules with a single daemon that:
#   1. Polls ~/.fleet/data/asks.tsv every 30s — routes new asks to owners
#   2. Watches agent output dirs — pings downstream consumers on file change
#   3. Sends per-agent heartbeats at adaptive intervals
#   4. Reads ~/.fleet/triggers/*.trigger files dropped by external events
#
# Start:  fleet watcher start
# Stop:   fleet watcher stop
# Status: fleet watcher status

set -u
FLEET="${FLEET_BIN:-$(command -v fleet)}"
DATA="${FLEET_HOME:-$HOME/.fleet}/data"
TRIG="${FLEET_HOME:-$HOME/.fleet}/triggers"
STATE="${FLEET_HOME:-$HOME/.fleet}/data/watcher-state"
LOG="${FLEET_HOME:-$HOME/.fleet}/data/watcher.log"
PID="${FLEET_HOME:-$HOME/.fleet}/data/watcher.pid"

mkdir -p "$TRIG" "$STATE"

# ── Heartbeat intervals (seconds) per agent ─────────────────────────────
# Adaptive: more frequent for ads/ops, slower for content/strategy
heartbeat_for() {
  case "$1" in
    ceo|cfo|coo)                          echo 3600 ;;   # 1h
    ad-manager|community-relations|fulfillment-bot|gig-responder)
                                          echo 900 ;;    # 15min
    intel-synth|data-synthesizer)         echo 7200 ;;   # 2h
    brand-editor|newsletter-writer|script-writer|carousel-designer|video-producer)
                                          echo 14400 ;;  # 4h
    regulatory-watcher|trend-pattern-detector|competitor-watcher)
                                          echo 1800 ;;   # 30min
    *)                                    echo 1800 ;;   # default 30min
  esac
}

# Has enough time passed since this agent's last heartbeat?
should_heartbeat() {
  local agent="$1"
  local file="$STATE/last-$agent"
  local interval; interval=$(heartbeat_for "$agent")
  local now; now=$(date +%s)
  local last=0
  [ -f "$file" ] && last=$(cat "$file" 2>/dev/null || echo 0)
  local elapsed=$((now - last))
  [ "$elapsed" -ge "$interval" ]
}

stamp_heartbeat() { date +%s > "$STATE/last-$1"; }

# List active agents (those with a tmux session)
list_agents() {
  /opt/homebrew/bin/tmux ls 2>/dev/null | awk -F: '{print $1}'
}

# ── Main loop ──────────────────────────────────────────────────────────
log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }

watcher_loop() {
  log "watcher started (pid $$)"
  echo $$ > "$PID"
  trap 'log "watcher stopping (pid $$)"; rm -f "$PID"; exit 0' INT TERM

  while true; do
    # 1. External triggers — files dropped in ~/.fleet/triggers/<agent>.trigger
    for trigger in "$TRIG"/*.trigger; do
      [ -e "$trigger" ] || continue
      local agent
      agent=$(basename "$trigger" .trigger)
      local msg
      msg=$(cat "$trigger" 2>/dev/null)
      log "trigger fired: $agent ← $msg"
      "$FLEET" tell "$agent" --from watcher "$msg" >/dev/null 2>&1
      rm -f "$trigger"
      stamp_heartbeat "$agent"
    done

    # 2. New asks — route to owner agent
    if [ -f "$DATA/asks.tsv" ]; then
      local seen="$STATE/last-ask-id"
      local last=0
      [ -f "$seen" ] && last=$(cat "$seen" 2>/dev/null || echo 0)
      # asks format: id<TAB>agent<TAB>...
      awk -F'\t' -v last="$last" '$1+0 > last' "$DATA/asks.tsv" | \
      while IFS=$'\t' read -r id agent rest; do
        log "new ask #$id ← $agent — routing to coo"
        "$FLEET" tell coo --from watcher "Ask #$id from $agent: triage" >/dev/null 2>&1
        echo "$id" > "$seen"
      done
    fi

    # 3. Heartbeats — wake each agent on its own cadence
    list_agents | while read -r agent; do
      [ -z "$agent" ] && continue
      if should_heartbeat "$agent"; then
        log "heartbeat: $agent"
        "$FLEET" tell "$agent" --from watcher \
          "Continuous cycle — check inbox, read upstream outputs, do ONE bounded unit of work per your CLAUDE.md, then stop." \
          >/dev/null 2>&1
        stamp_heartbeat "$agent"
      fi
    done

    sleep 30
  done
}

case "${1:-start}" in
  start)
    if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then
      echo "watcher already running (pid $(cat "$PID"))"
      exit 0
    fi
    nohup bash "$0" __loop >/dev/null 2>&1 &
    sleep 0.5
    if [ -f "$PID" ]; then
      echo "watcher started (pid $(cat "$PID")) — log: $LOG"
    else
      echo "watcher failed to start; check $LOG"
      exit 1
    fi
    ;;
  __loop)
    watcher_loop
    ;;
  stop)
    if [ -f "$PID" ]; then
      kill "$(cat "$PID")" 2>/dev/null
      rm -f "$PID"
      echo "watcher stopped"
    else
      echo "watcher not running"
    fi
    ;;
  status)
    if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then
      echo "watcher running (pid $(cat "$PID"))"
      echo "last 10 log lines:"
      tail -10 "$LOG" 2>/dev/null
    else
      echo "watcher not running"
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
