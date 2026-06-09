# Changelog

All notable changes to Fleet HQ will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Planned for v0.2
- Linux support (the bash is portable, the path detection needs work)
- `npx fleet` and `brew install` distribution
- Per-agent token bars in the dashboard
- Smarter inbox routing — per-agent thresholds for "interrupt now" vs "queue"
- Public agent template gallery

## [0.1.0] — 2026-06-09

Initial public release. Consolidates two earlier projects (`fleet` CLI and `mini-miguel`) into a single, opinionated command-center for running teams of Claude agents.

### Added

- **`fleet` CLI** (1100+ lines of Bash, no dependencies beyond `tmux` and `jq`)
  - Agent lifecycle: `new`, `tell`, `watch`, `log`, `kill`, `list`
  - Inter-agent messaging: `say`, `ask`, `propose`
  - Worlds: `world add/rm`, `assign`, multi-world routing
  - Scheduling: `schedule`, `unschedule`, `scheduler` daemon
  - Watcher daemon for event-driven activation
  - DND windows: `dnd on|off|HH:MM-HH:MM`
  - Token tracking: `fleet tokens [name|all] [--json]` aggregates Claude Code transcripts
  - Earnings ledger: `fleet earn <agent> <amount> "<note>"`

- **Dashboard** (Node + Three.js + SSE)
  - 3D world view with rigged agent characters
  - Live activity extraction from tmux pane output
  - Per-world stages, agent chat overlay
  - 1.5s SSE refresh cycle

- **Runtime layout** under `~/.fleet/`
  - `config/` — goal, mode, worlds, fleet.conf
  - `data/` — agent-plan, revenue, asks, proposals, ventures, logs
  - `secrets/` — per-agent credentials
  - `triggers/` — drop-file event queue

- **30 working agent templates** spanning HQ (CEO/CFO/COO), Research, Intelligence, Etsy, YouTube, Fiverr, AI-Dropship, and one example consumer brand. Plus 10 reusable mission templates.

- **Documentation**
  - `README.md` — overview + quick start
  - `DESIGN.md` — cyberpunk design system (colors, motion, copy voice)
  - `PRODUCT.md` — product vision and operator model
  - `docs/architecture.md` — three-piece architecture detail
  - `docs/operating-model.md` — worlds, dry-run vs live, ask/propose protocols
  - `docs/writing-an-agent.md` — Mission/Never/Output/KPIs pattern

- **CI**
  - `shellcheck` lint on `fleet` and `scripts/*.sh`
  - `bash -n` syntax check on every script

### Known limitations

- macOS only. Linux works in theory; path detection assumes `/opt/homebrew`.
- Dashboard 3D models not included (licensing on originals uncertain). Drop your own `.glb` files into `dashboard/assets/`.
- No `npx fleet` / `brew install` distribution yet.
- No automated tests beyond linting.

[Unreleased]: https://github.com/mborges-dev/fleet-hq/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mborges-dev/fleet-hq/releases/tag/v0.1.0
