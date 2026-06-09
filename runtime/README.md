# Runtime layout (`~/.fleet/`)

Fleet's runtime state lives in `$HOME/.fleet` (override with `FLEET_HOME`). This folder is the **shape of that layout** — copy the relevant `.example` files into `~/.fleet/` and edit them.

```
~/.fleet/
├── config/
│   ├── fleet.conf          ← global config (owner, language, DND, sound)
│   ├── goal.tsv            ← monthly revenue target
│   ├── mode.tsv            ← per-world execution mode (dry-run | live)
│   ├── worlds.tsv          ← world definitions (key, name, color, kind, …)
│   └── *.key               ← per-service API keys (NEVER commit)
│
├── data/                   ← runtime state, written by Fleet
│   ├── agent-plan.md       ← your strategic plan (free-form)
│   ├── revenue.tsv         ← earnings ledger
│   ├── proposals.tsv       ← human-approval queue
│   ├── asks.tsv            ← inter-agent question queue
│   ├── ventures.tsv        ← active ventures per world
│   ├── chat.log            ← human ↔ agent transcript
│   ├── events.log          ← audit log
│   └── watcher.log         ← watcher daemon log
│
├── memory/                 ← long-term shared + per-agent memory
│   ├── index.db            ← SQLite FTS5 (auto-built, derived)
│   ├── shared/             ← voice, brand, pricing, customer, …
│   └── agents/<name>/      ← per-agent episodic, decisions, lessons
│
├── secrets/                ← per-agent credentials, gitignored
└── triggers/               ← drop-file trigger queue
```

See [memory/README.md](memory/README.md) for how the memory system works (it's its own thing — markdown files + SQLite FTS index).

## Bootstrap

```bash
mkdir -p ~/.fleet/config ~/.fleet/data ~/.fleet/secrets ~/.fleet/triggers
cp runtime/config/*.example.* ~/.fleet/config/
# Remove the .example. infix from each filename, then edit
for f in ~/.fleet/config/*.example.*; do
  mv "$f" "${f/.example./.}"
done
```

## Notes on each file

**`fleet.conf`** — sourced by `fleet` at startup. Owner name shows up in agent context. Language influences agent reply style.

**`goal.tsv`** — one row per month. `target` is the revenue target in whatever currency you operate in. Several agents read this to compute progress.

**`mode.tsv`** — `dry-run` agents log what they would do but don't spend money or post anything. `live` agents act. Switch one world at a time.

**`worlds.tsv`** — defines the worlds your fleet operates in. Columns: `id  name  icon  color  theme  kind  description`. `kind` is `command` (HQ), `support` (research, intelligence), or `revenue` (everything that makes money).

**`*.key`** — drop API keys here as plain files (e.g. `tripo3d.key`, `openai.key`). The `.fleet/secrets/` folder is also available for per-agent credentials. **Never commit these.**

**`data/agent-plan.md`** — your living strategic plan. Free-form Markdown. Agents read this for context. Treat it as your runbook.

**Empty TSVs** (`revenue.tsv`, `asks.tsv`, etc.) get populated as agents run. Don't pre-fill; Fleet creates them on demand.
