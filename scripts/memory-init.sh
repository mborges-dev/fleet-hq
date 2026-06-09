#!/bin/bash
# memory-init.sh — initialize the SQLite FTS5 index for Fleet memory.
# Idempotent: safe to re-run; only creates tables if missing.

set -u
DB=${FLEET_HOME:-$HOME/.fleet}/memory/index.db

sqlite3 "$DB" <<'SQL'
-- FTS5 virtual table for full-text search across all memory files.
-- `scope` = 'shared' OR the agent name.
-- `filename` = the markdown filename (brand.md, episodic.md, ...).
-- `section` = optional H2 heading the block lives under (for context).
-- `content` = the actual text body.
-- Unindexed columns carry metadata without bloating the FTS index.
CREATE VIRTUAL TABLE IF NOT EXISTS memory USING fts5(
  scope,
  filename,
  section,
  content,
  written_at UNINDEXED,
  written_by UNINDEXED,
  tokenize = 'porter unicode61 remove_diacritics 2'
);

-- Auxiliary table tracking source files so we can re-index on change.
CREATE TABLE IF NOT EXISTS source_files (
  path     TEXT PRIMARY KEY,
  mtime    INTEGER NOT NULL,
  size     INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL
);

-- Convenience view: most recent entries per scope.
CREATE VIEW IF NOT EXISTS recent_memory AS
SELECT scope, filename, section,
       substr(content, 1, 240) AS preview,
       written_at, written_by
FROM memory
ORDER BY written_at DESC;
SQL

echo "✓ memory index ready at $DB"
sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' OR type='view'"
