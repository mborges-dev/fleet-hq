#!/bin/bash
# fleet scheduler daemon — runs inside a tmux session named "fleet-scheduler".
#
# Reads $FLEET_HOME/data/schedules.tsv every $TICK seconds and fires any
# schedule whose (last_run + interval_sec) has passed. Firing = calling
# `fleet tell <agent> "<prompt>"`.
#
# Each row in schedules.tsv:
#   <id>\t<agent>\t<interval_sec>\t<last_run>\t<enabled>\t<prompt>
#
# Re-reads the file on every tick, so schedule/unschedule from the CLI
# is picked up live.

set -u

FLEET_HOME="${FLEET_HOME:-$HOME/.fleet}"
FLEET_BIN="${FLEET_BIN:-fleet}"
SCHEDULES_FILE="$FLEET_HOME/data/schedules.tsv"
TICK="${TICK:-15}"   # seconds between checks

TMUX_BIN=$(command -v tmux 2>/dev/null \
  || ls /opt/homebrew/bin/tmux /usr/local/bin/tmux /usr/bin/tmux 2>/dev/null | head -1 \
  || echo "tmux")

mkdir -p "$FLEET_HOME/data"

log()  { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

echo "Fleet scheduler started (tick=${TICK}s, schedules=$SCHEDULES_FILE)"
echo "FLEET_BIN=$FLEET_BIN"

while true; do
  if [[ -f "$SCHEDULES_FILE" ]]; then
    now=$(date +%s)
    tmp="$(mktemp)"
    while IFS=$'\t' read -r id agent interval last enabled prompt; do
      [[ -z "${id:-}" ]] && continue
      if [[ "${enabled:-1}" != "1" ]]; then
        printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
          "$id" "$agent" "$interval" "$last" "$enabled" "$prompt" >> "$tmp"
        continue
      fi
      due_at=$(( ${last:-0} + ${interval:-0} ))
      if (( now >= due_at )); then
        if $TMUX_BIN has-session -t "$agent" 2>/dev/null; then
          log "fire  ${id}  → ${agent}"
          # Fire via fleet tell so chat gets the entry, with sender 'scheduler'
          "$FLEET_BIN" tell "$agent" --from "scheduler" "$prompt" >/dev/null 2>&1 \
            || log "warn  tell failed for $agent"
          new_last=$now
        else
          log "skip  ${id}  (agent '${agent}' not running)"
          new_last="${last:-0}"
        fi
        printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
          "$id" "$agent" "$interval" "$new_last" "$enabled" "$prompt" >> "$tmp"
      else
        printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
          "$id" "$agent" "$interval" "$last" "$enabled" "$prompt" >> "$tmp"
      fi
    done < "$SCHEDULES_FILE"
    mv "$tmp" "$SCHEDULES_FILE"
  fi
  sleep "$TICK"
done
