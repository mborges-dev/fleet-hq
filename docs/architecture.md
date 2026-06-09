# Architecture

Fleet HQ is three independent pieces that snap together:

```
   ┌──────────────────────────────────────────────────────────────┐
   │   You (the operator)                                         │
   └────────────┬───────────────────────────┬─────────────────────┘
                │ commands                  │ glances
                ▼                           ▼
   ┌──────────────────────┐   ┌──────────────────────────────────┐
   │   fleet (Bash CLI)   │   │   Dashboard (Node + Three.js)    │
   │                      │   │                                  │
   │  - launches agents   │   │  - reads ~/.fleet at 1.5s tick   │
   │    in tmux           │   │  - SSE stream to browser         │
   │  - routes asks       │   │  - 3D worlds + agent avatars     │
   │  - logs earnings     │   │  - chat panel per agent          │
   │  - schedules watcher │   │                                  │
   └──────────┬───────────┘   └──────────────┬───────────────────┘
              │ writes                       │ reads
              ▼                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │   ~/.fleet/  (runtime state, gitignored)                     │
   │                                                              │
   │   config/  → goal, mode, worlds, *.key                       │
   │   data/    → agent-plan, revenue, asks, proposals, ventures, │
   │              chat.log, events.log, watcher.log               │
   │   secrets/ → per-agent credentials                           │
   │   triggers/→ drop-file event queue                           │
   └──────────────────────────────────────────────────────────────┘
              ▲
              │ each agent reads its own CLAUDE.md + ~/.fleet
              │
   ┌──────────────────────────────────────────────────────────────┐
   │   tmux sessions, one per agent (claude -p)                   │
   │                                                              │
   │   ceo · cfo · coo · research/* · intelligence/* ·            │
   │   etsy/* · youtube/* · fiverr/* · ai-dropship/* ·            │
   │   examplebrand/* · …                                         │
   └──────────────────────────────────────────────────────────────┘
```

## Why three pieces

**Fleet (CLI)** is the only thing the operator types into. Every action — launch an agent, ask a question, log a sale, change DND, schedule a recurring task — goes through `fleet`. It's the keyboard surface.

**Dashboard** is the eyes-on surface. It's deliberately read-mostly (chat is the only write). It reads `~/.fleet/` and reflects state in real time, refreshing every 1.5 seconds via SSE. You glance at it dozens of times a day without typing.

**`~/.fleet/`** is the shared truth. Both the CLI and dashboard read and write it. Agents themselves read it (via their CLAUDE.md instructions) to know goals, current revenue, and what the rest of the fleet is doing. Plain files, no database, no daemon required.

## Communication patterns

Agents never call other agents directly. Four patterns:

1. **File handoff** — agent A writes to `agents/A/output.md`, agent B reads it. The simplest and most-used pattern.
2. **`fleet say A --to B "<message>"`** — routed message, appended to B's tmux pane via `tmux paste-buffer`. Use when A needs B to do something specific *now*.
3. **`fleet ask A "<question>"`** — appended to `~/.fleet/data/asks.tsv`. Routed by the watcher to the right answerer (often the operator, sometimes another agent).
4. **`fleet propose A "<pitch>"`** — human-approval queue. Operator approves/rejects in the dashboard or via `fleet proposals`.

## The watcher

`fleet watcher start` runs a daemon that:
- Polls `~/.fleet/data/asks.tsv` every 30s, routes new asks
- Watches agent output dirs, pings downstream consumers on file change
- Sends per-agent heartbeats at adaptive intervals (more frequent for ads/ops, slower for content/strategy)
- Reads `~/.fleet/triggers/*.trigger` files dropped by external events (webhooks, cron, etc.)

It's optional. Fleet works without it — the watcher exists to replace fixed cron schedules with event-driven activation.

## The memory layer

Two things sit on top of plain `~/.fleet/data/`:

**`personality.md` per agent** (committed alongside `CLAUDE.md`) overlays the operator's baseline voice. Same role + different personality file = noticeably different tone and decision profile. The personality inherits from `~/.fleet/memory/shared/voice.md` — the operator's identity is defined once and applied everywhere.

**`~/.fleet/memory/`** is a shared long-term store with two scopes — `shared/` (read by every agent: voice, brand, pricing, playbook, failures, etc.) and `agents/<name>/` (episodic, decisions, lessons per agent). Files are plain markdown; a SQLite FTS5 index sits on top for fast search and recall:

```bash
fleet memory search "cold DM cadence"
fleet memory recall ceo                       # most-relevant blocks for the CEO
fleet memory write shared/failures.md --from coo "Discord SDR cadence too aggressive — account flagged."
```

The DB is a derived artifact. Edit the markdown directly, then `fleet memory reindex`.

This layer is **read-mostly during work**, **append-mostly between cycles** — a useful split because it lets agents read shared context cheaply (memory is small and cached) while keeping write-back explicit so the operator can see what each agent learned.

## Why CLAUDE.md per agent

Each agent's mission lives in `agents/<name>/CLAUDE.md`. Claude Code reads it automatically as project context when `claude` starts. This means:

- Switching an agent is editing one Markdown file
- Forking an agent is `cp -r` of one folder
- Composing two agents is editing two CLAUDE.md files to point at each other's output paths
- You can read the full fleet's behavior by reading 30 Markdown files — no buried config, no DSL, no graph

The cost: there's no central registry of what every agent does. The benefit: every agent's behavior is auditable in plain text, by anyone.
