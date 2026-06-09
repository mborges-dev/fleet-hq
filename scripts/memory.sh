#!/bin/bash
# memory.sh — Fleet memory operations.
#
# Used by the CLI dispatcher `fleet memory <verb> <args>`.
#
# Verbs:
#   write <scope>/<file> "<content>"      append a new block (auto-dated)
#   write <scope>/<file> --from <agent> "<content>"
#   read  <scope>/<file> [--section "..."]
#   list  [<scope>]                        list files in a scope
#   search "<query>" [--scope X] [--limit N]
#   recall <agent>                         pull most-relevant memories for this agent
#   reindex                                rebuild FTS from disk
#   stats                                  database stats

set -u
ROOT=${FLEET_HOME:-$HOME/.fleet}/memory
DB="$ROOT/index.db"

mkdir -p "$ROOT/shared" "$ROOT/agents"

# Make sure DB exists
[ -f "$DB" ] || "$(dirname "$0")/memory-init.sh" >/dev/null

# Resolve a scope/file pair to a real filesystem path.
# - shared/<file>     → ~/.fleet/memory/shared/<file>
# - <agent>/<file>    → ~/.fleet/memory/agents/<agent>/<file>
resolve_path() {
  local spec="$1"
  local scope="${spec%%/*}"
  local file="${spec#*/}"
  if [ "$scope" = "shared" ]; then
    echo "$ROOT/shared/$file"
  else
    mkdir -p "$ROOT/agents/$scope"
    echo "$ROOT/agents/$scope/$file"
  fi
}

# Insert content into the FTS index. Used by both write and reindex.
fts_insert() {
  local scope="$1" filename="$2" section="$3" content="$4" \
        written_at="$5" written_by="$6"
  # Escape single quotes for SQL by doubling them.
  local sc
  sc=$(printf %s "$scope" | sed "s/'/''/g")
  local fn
  fn=$(printf %s "$filename" | sed "s/'/''/g")
  local sect
  sect=$(printf %s "$section" | sed "s/'/''/g")
  local cnt
  cnt=$(printf %s "$content" | sed "s/'/''/g")
  local wa
  wa=$(printf %s "$written_at" | sed "s/'/''/g")
  local wb
  wb=$(printf %s "$written_by" | sed "s/'/''/g")
  sqlite3 "$DB" "INSERT INTO memory(scope,filename,section,content,written_at,written_by)
                  VALUES('$sc','$fn','$sect','$cnt','$wa','$wb');"
}

cmd_write() {
  local spec="${1:-}"; shift || true
  [ -z "$spec" ] && { echo "Usage: fleet memory write <scope>/<file> [--from <agent>] \"<content>\"" >&2; return 1; }
  local from="${USER:-human}"
  if [ "${1:-}" = "--from" ]; then from="${2:-me}"; shift 2 || true; fi
  local content="$*"
  [ -z "$content" ] && { echo "Error: content required." >&2; return 1; }

  local file
  file=$(resolve_path "$spec")
  local scope="${spec%%/*}"
  local fname="${spec#*/}"
  local ts
  ts=$(date '+%F %T')
  local section="$ts — by $from"

  # Append a dated block. Create file with H1 from filename if missing.
  if [ ! -f "$file" ]; then
    printf "# %s — shared memory\n\n" "$fname" > "$file"
  fi
  printf "\n## %s\n%s\n" "$section" "$content" >> "$file"

  # Index the new block.
  fts_insert "$scope" "$fname" "$section" "$content" "$(date +%s)" "$from"

  echo "✓ memory write: $spec  ($(printf %s "$content" | wc -w | tr -d ' ') words)"
}

cmd_read() {
  local spec="${1:-}"
  [ -z "$spec" ] && { echo "Usage: fleet memory read <scope>/<file> [--section \"text\"]" >&2; return 1; }
  shift
  local section_filter=""
  if [ "${1:-}" = "--section" ]; then section_filter="${2:-}"; shift 2 || true; fi

  local file
  file=$(resolve_path "$spec")
  [ -f "$file" ] || { echo "(no memory at $spec)" >&2; return 1; }

  if [ -n "$section_filter" ]; then
    # Print only sections whose H2 line contains the filter
    awk -v f="$section_filter" '
      /^## / { if (capture) print buf; capture = index($0, f) > 0; buf = $0 ORS; next }
      capture { buf = buf $0 ORS }
      END { if (capture) print buf }
    ' "$file"
  else
    cat "$file"
  fi
}

cmd_list() {
  local scope="${1:-}"
  if [ -z "$scope" ]; then
    echo "=== shared ==="
    ls "$ROOT/shared/" 2>/dev/null
    echo
    echo "=== agents ==="
    ls "$ROOT/agents/" 2>/dev/null
  elif [ "$scope" = "shared" ]; then
    ls "$ROOT/shared/" 2>/dev/null
  else
    ls "$ROOT/agents/$scope/" 2>/dev/null || echo "(no memory for agent: $scope)"
  fi
}

cmd_search() {
  local query="${1:-}"; shift || true
  [ -z "$query" ] && { echo "Usage: fleet memory search \"<query>\" [--scope X] [--limit N]" >&2; return 1; }
  local scope_filter=""
  local limit=20
  while [ $# -gt 0 ]; do
    case "$1" in
      --scope) scope_filter="$2"; shift 2 ;;
      --limit) limit="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  local q
  q=$(printf %s "$query" | sed "s/'/''/g")
  local where="memory MATCH '$q'"
  [ -n "$scope_filter" ] && where="$where AND scope = '$(printf %s "$scope_filter" | sed "s/'/''/g")'"

  sqlite3 -separator $'\t' "$DB" "
    SELECT scope || '/' || filename, section,
           substr(content, 1, 180),
           datetime(written_at, 'unixepoch', 'localtime'),
           written_by
    FROM memory
    WHERE $where
    ORDER BY rank
    LIMIT $limit;
  " | awk -F'\t' '
    NR == 1 { print "=== matches (top by relevance) ===" }
    {
      print ""
      print "● " $1 "  (" $4 " · " $5 ")"
      print "  § " $2
      print "  " $3 "..."
    }
  '
}

cmd_recall() {
  local agent="${1:-}"
  [ -z "$agent" ] && { echo "Usage: fleet memory recall <agent>" >&2; return 1; }

  echo "=== shared/goals.md ==="
  cmd_read "shared/goals.md" 2>/dev/null | head -40

  echo
  echo "=== shared/brand.md (top blocks) ==="
  cmd_read "shared/brand.md" 2>/dev/null | head -40

  echo
  echo "=== your latest 5 episodic blocks ==="
  cmd_read "$agent/episodic.md" 2>/dev/null | tail -50 || echo "(none yet)"

  echo
  echo "=== your learned lessons ==="
  cmd_read "$agent/learned.md" 2>/dev/null | head -60 || echo "(none yet)"

  echo
  echo "=== recent failures (avoid repeating) ==="
  cmd_read "shared/failures.md" 2>/dev/null | tail -30
}

cmd_reindex() {
  # Rebuild FTS from the markdown source of truth.
  echo "Rebuilding FTS index from disk..."
  sqlite3 "$DB" "DELETE FROM memory; DELETE FROM source_files;"

  local count=0
  while IFS= read -r -d '' file; do
    local rel="${file#$ROOT/}"
    local scope
    if [[ "$rel" == shared/* ]]; then
      scope="shared"
    else
      scope=$(echo "$rel" | cut -d/ -f2)
    fi
    local fname
    fname=$(basename "$file")

    # Parse markdown by ## sections.
    awk -v scope="$scope" -v fname="$fname" '
      BEGIN { section=""; content="" }
      /^## / {
        if (section != "" && content != "") print scope "\t" fname "\t" section "\t" content "\t" 0 "\t" "indexer"
        section = substr($0, 4)
        content = ""
        next
      }
      /^# / { next }
      { content = content $0 "\n" }
      END { if (section != "" && content != "") print scope "\t" fname "\t" section "\t" content "\t" 0 "\t" "indexer" }
    ' "$file" | while IFS=$'\t' read -r sc fn sect cnt wa wb; do
      [ -z "$cnt" ] && continue
      fts_insert "$sc" "$fn" "$sect" "$cnt" "$wa" "$wb"
      count=$((count+1))
    done
  done < <(find "$ROOT" -name "*.md" -type f -print0)

  local total
  total=$(sqlite3 "$DB" "SELECT COUNT(*) FROM memory;")
  echo "✓ indexed $total blocks"
}

cmd_stats() {
  echo "=== memory stats ==="
  echo "Database: $DB"
  echo
  sqlite3 -column -header "$DB" "
    SELECT scope, COUNT(*) AS blocks, COUNT(DISTINCT filename) AS files
    FROM memory
    GROUP BY scope
    ORDER BY scope;
  "
  echo
  echo "Total blocks: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM memory;')"
  echo "DB size: $(du -h "$DB" | cut -f1)"
}

# Dispatch
case "${1:-}" in
  write)    shift; cmd_write   "$@" ;;
  read|get) shift; cmd_read    "$@" ;;
  list|ls)  shift; cmd_list    "$@" ;;
  search|s) shift; cmd_search  "$@" ;;
  recall)   shift; cmd_recall  "$@" ;;
  reindex)  shift; cmd_reindex "$@" ;;
  stats)    shift; cmd_stats   "$@" ;;
  ""|help|-h|--help)
    cat <<EOF
Fleet memory — hybrid markdown + SQLite FTS5

USAGE
  fleet memory write   <scope>/<file> [--from <agent>] "<content>"
  fleet memory read    <scope>/<file> [--section "text"]
  fleet memory list    [<scope>]
  fleet memory search  "<query>" [--scope X] [--limit N]
  fleet memory recall  <agent>
  fleet memory reindex
  fleet memory stats

SCOPES
  shared/<file>    cross-fleet memory (brand, playbook, failures, etc)
  <agent>/<file>   per-agent memory (episodic, learned, watching, backlog)

EXAMPLES
  fleet memory write shared/customer.md --from listing-bot \\
    "Boho bride buyers spike Apr-Jun. Lavender > sage in 2026."
  fleet memory search "boho wedding"
  fleet memory recall ceo
EOF
    ;;
  *)
    echo "Unknown verb: $1. Try 'fleet memory help'" >&2
    exit 1
    ;;
esac
