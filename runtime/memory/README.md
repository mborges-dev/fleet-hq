# `~/.fleet/memory/` — shared and per-agent memory

Fleet's memory system lives under `~/.fleet/memory/` (override with `FLEET_HOME`). Two scopes:

```
~/.fleet/memory/
├── index.db                 ← SQLite FTS5 full-text index (auto-built)
├── shared/                  ← read by every agent
│   ├── voice.md             ← operator's baseline tone, risk, ethics, time
│   ├── pricing.md           ← pricing decisions and rationale
│   ├── brand.md             ← brand voice + visual guidelines
│   ├── customer.md          ← who buys, who doesn't, why
│   ├── competitive.md       ← what competitors do, how we differ
│   ├── playbook.md          ← reusable plays
│   ├── failures.md          ← post-mortems — what didn't work and why
│   ├── glossary.md          ← in-house vocabulary
│   └── goals.md             ← current OKRs / KPI targets
└── agents/
    └── <agent>/
        ├── episodic.md      ← what this agent did, week by week
        ├── decisions.md     ← decisions this agent made + rationale
        └── lessons.md       ← what this agent learned from its own runs
```

## How it's used

Each agent's `personality.md` (in the repo at `agents/<name>/personality.md`) inherits from `shared/voice.md` — the personality file only documents the role overlay, not the baseline.

At work time, agents read what they need via the `fleet memory` CLI:

```bash
fleet memory read shared/voice.md            # the baseline
fleet memory read shared/pricing.md          # current pricing logic
fleet memory recall ceo                      # most-relevant blocks for ceo
fleet memory search "pricing experiments"    # FTS query across everything
```

And write back what's worth keeping:

```bash
fleet memory write ceo/decisions.md --from ceo "Killed pep-vault dropship test. Burn $47, no signal."
fleet memory write shared/failures.md --from coo "Discord SDR cadence — too aggressive, account flagged."
```

## Bootstrap

```bash
mkdir -p ~/.fleet/memory/{shared,agents}

# Copy the example voice.md template and edit
cp runtime/memory/shared/voice.example.md ~/.fleet/memory/shared/voice.md
$EDITOR ~/.fleet/memory/shared/voice.md

# Build the search index (idempotent — safe to re-run)
fleet memory reindex
```

The index DB rebuilds itself if you ever delete `index.db` — it's a derived artifact, not source-of-truth.

## Why SQLite + FTS5

- **Plain markdown** stays human-editable, diff-able, git-able. The DB is just a search index over it.
- **FTS5** gives sub-millisecond search across hundreds of memory blocks without external dependencies.
- **Idempotent re-index** means the source of truth is always the markdown files. If they change outside the CLI (e.g. you edit `voice.md` directly), re-run `fleet memory reindex`.

## Privacy

`~/.fleet/memory/` is **gitignored at the runtime level** — it stays on your machine. The agent `personality.md` files in this repo are the *public-facing* layer (no operator secrets, no client data). All operator memory lives under `~/.fleet/memory/` and never leaves your disk.
