#!/bin/bash
# fleet tokens — aggregate token usage per agent by reading Claude Code transcripts.
#
# Claude Code writes per-session JSONL transcripts to:
#   ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
#
# where <encoded-cwd> replaces '/' with '-' in the project path.
# Each line is a message; assistant messages carry .message.usage with
# input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens.
#
# This script maps a tmux session name → its cwd → its newest transcript →
# aggregate usage. Pass a session name or 'all'.
#
# Usage:
#   scripts/tokens.sh                 # all running agents
#   scripts/tokens.sh <name>          # single agent
#   scripts/tokens.sh <name> --json   # machine-readable

set -euo pipefail

CLAUDE_ROOT="${CLAUDE_ROOT:-$HOME/.claude/projects}"
TMUX_BIN=$(command -v tmux 2>/dev/null \
  || ls /opt/homebrew/bin/tmux /usr/local/bin/tmux /usr/bin/tmux 2>/dev/null | head -1 \
  || echo "tmux")
JQ_BIN=$(command -v jq 2>/dev/null || echo "")

if [[ -z "$JQ_BIN" ]]; then
  echo "Error: jq is required. Install with: brew install jq" >&2
  exit 1
fi

# ── Encode a cwd into Claude Code's project-dir convention ───────────────────
# Example: /Users/foo/agents/research → -Users-foo-agents-research
encode_cwd() {
  local p="$1"
  echo "${p//\//-}"
}

# ── Find the newest JSONL transcript for a given cwd ────────────────────────
find_transcript() {
  local cwd="$1"
  local encoded; encoded="$(encode_cwd "$cwd")"
  local dir="$CLAUDE_ROOT/$encoded"
  [[ -d "$dir" ]] || return 1
  # Newest .jsonl by mtime
  ls -t "$dir"/*.jsonl 2>/dev/null | head -1
}

# ── Sum tokens across all assistant messages in a transcript ────────────────
# Outputs four numbers space-separated: input cache_creation cache_read output
sum_tokens() {
  local transcript="$1"
  [[ -f "$transcript" ]] || { echo "0 0 0 0"; return; }
  "$JQ_BIN" -s '
    [ .[] | .message.usage // empty ]
    | reduce .[] as $u ({i:0, cc:0, cr:0, o:0};
        .i  += ($u.input_tokens                 // 0)
      | .cc += ($u.cache_creation_input_tokens  // 0)
      | .cr += ($u.cache_read_input_tokens      // 0)
      | .o  += ($u.output_tokens                // 0)
      )
    | "\(.i) \(.cc) \(.cr) \(.o)"
  ' "$transcript" 2>/dev/null | tr -d '"' || echo "0 0 0 0"
}

# ── Cost estimate (rough — Sonnet 4.5 pricing as default) ───────────────────
# Override via env: INPUT_PRICE_PER_MTOK, OUTPUT_PRICE_PER_MTOK,
#                   CACHE_WRITE_PRICE_PER_MTOK, CACHE_READ_PRICE_PER_MTOK
estimate_cost_usd() {
  local input="$1" cwrite="$2" cread="$3" output="$4"
  local ip="${INPUT_PRICE_PER_MTOK:-3.00}"
  local op="${OUTPUT_PRICE_PER_MTOK:-15.00}"
  local cwp="${CACHE_WRITE_PRICE_PER_MTOK:-3.75}"
  local crp="${CACHE_READ_PRICE_PER_MTOK:-0.30}"
  awk -v i="$input" -v cw="$cwrite" -v cr="$cread" -v o="$output" \
      -v ip="$ip" -v op="$op" -v cwp="$cwp" -v crp="$crp" \
      'BEGIN { printf "%.4f", (i*ip + cw*cwp + cr*crp + o*op) / 1000000 }'
}

# ── Get cwd for a tmux session ──────────────────────────────────────────────
session_cwd() {
  local s="$1"
  $TMUX_BIN display-message -p -t "$s" '#{pane_current_path}' 2>/dev/null
}

# ── List session names ──────────────────────────────────────────────────────
list_sessions() {
  $TMUX_BIN ls -F '#{session_name}' 2>/dev/null || true
}

# ── Format a number with thousands separators ───────────────────────────────
fmt() {
  printf "%'d" "$1" 2>/dev/null || echo "$1"
}

# ── Report a single agent ───────────────────────────────────────────────────
report_one() {
  local name="$1" json="${2:-}"
  local cwd; cwd="$(session_cwd "$name")"
  if [[ -z "$cwd" ]]; then
    [[ "$json" == "--json" ]] \
      && printf '{"agent":"%s","error":"session not found"}\n' "$name" \
      || echo "  $name: session not found"
    return
  fi
  local transcript; transcript="$(find_transcript "$cwd" || true)"
  if [[ -z "$transcript" ]]; then
    [[ "$json" == "--json" ]] \
      && printf '{"agent":"%s","cwd":"%s","error":"no transcript yet"}\n' "$name" "$cwd" \
      || printf '  %-20s no transcript yet (cwd: %s)\n' "$name" "$cwd"
    return
  fi
  read -r in cw cr out < <(sum_tokens "$transcript")
  local cost; cost="$(estimate_cost_usd "$in" "$cw" "$cr" "$out")"
  if [[ "$json" == "--json" ]]; then
    printf '{"agent":"%s","input":%s,"cache_write":%s,"cache_read":%s,"output":%s,"cost_usd":%s}\n' \
      "$name" "$in" "$cw" "$cr" "$out" "$cost"
  else
    printf '  %-20s in:%s  c-write:%s  c-read:%s  out:%s  ≈$%s\n' \
      "$name" "$(fmt "$in")" "$(fmt "$cw")" "$(fmt "$cr")" "$(fmt "$out")" "$cost"
  fi
}

# ── Main ────────────────────────────────────────────────────────────────────
arg="${1:-}"
flag="${2:-}"

if [[ "$arg" == "--json" ]]; then flag="--json"; arg=""; fi

if [[ -z "$arg" || "$arg" == "all" ]]; then
  sessions=$(list_sessions)
  if [[ -z "$sessions" ]]; then
    [[ "$flag" == "--json" ]] && echo '[]' || echo "No agents running."
    exit 0
  fi
  if [[ "$flag" == "--json" ]]; then
    echo "["
    first=1
    while IFS= read -r s; do
      [[ -z "$s" ]] && continue
      [[ $first -eq 0 ]] && echo ","
      report_one "$s" --json
      first=0
    done <<< "$sessions"
    echo "]"
  else
    echo "Token usage (cumulative per session)"
    while IFS= read -r s; do
      [[ -z "$s" ]] && continue
      report_one "$s"
    done <<< "$sessions"
  fi
else
  report_one "$arg" "$flag"
fi
