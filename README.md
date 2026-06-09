# Fleet HQ

**A single-operator command center for running teams of Claude agents — CLI + live 3D dashboard + opinionated runtime.**

Fleet HQ is the operating system for working alongside dozens of autonomous AI agents from one keyboard. You define each agent's mission in a Markdown file. Fleet launches them in parallel tmux sessions. The dashboard renders the whole fleet as a cyberpunk command bridge — agents move around 3D worlds, ask you questions, log earnings, propose decisions.

This is the full setup, not a framework. It replaces a folder of scripts I'd been running personally for months ([previously published as `mini-miguel`](https://github.com/mborges-dev/mini-miguel)) and the standalone `fleet` CLI repo. One canonical project from here on.

---

## The three pieces

```
   ┌──────────────────────────────────────────────────────────────┐
   │   You (the operator)                                         │
   └────────────┬───────────────────────────┬─────────────────────┘
                │ commands                  │ glances
                ▼                           ▼
   ┌──────────────────────┐   ┌──────────────────────────────────┐
   │  fleet (Bash CLI)    │   │  Dashboard (Node + Three.js)     │
   │  cli surface         │   │  ambient HUD                     │
   └──────────┬───────────┘   └──────────────┬───────────────────┘
              │                              │
              └──────────────┬───────────────┘
                             ▼
                ┌──────────────────────────┐
                │  ~/.fleet/  (runtime)    │
                │  shared state, plain     │
                │  files, gitignored       │
                └──────────────────────────┘
```

**1. The CLI** (`fleet`, 1100+ lines of Bash) — every action goes through it. Launch an agent, ask a question, log a sale, schedule a recurring task, change DND, broadcast a directive. Single typing surface.

**2. The dashboard** (`dashboard/`, Node + Three.js + SSE) — read-mostly. Sits open on a second monitor all day. Renders the fleet as a stage with 3D worlds and agent avatars. Refreshes every 1.5 seconds. Click an agent, chat with it, close the loop in under 30 seconds.

**3. The runtime layout** (`~/.fleet/`) — plain files, no database. Both CLI and dashboard read and write here. Agents read it via their CLAUDE.md instructions. Backed by tmux sessions; survives terminal closes and machine sleeps.

---

## What you actually get when you clone this

```
fleet-hq/
├── fleet                    # the Bash CLI (1100+ lines, ~45KB)
├── scripts/                 # tokens, scheduler, watcher
├── dashboard/               # Node + Three.js dashboard
│   ├── server.js
│   ├── three-sprites.js
│   ├── index.html
│   └── assets/              # 3D model placeholders + README
├── agents/                  # 30 working agent CLAUDE.md + 10 templates
│   ├── example/             # starter agent
│   ├── templates/           # reusable mission templates
│   └── <role>/CLAUDE.md     # ceo · cfo · coo · research/* · …
├── runtime/                 # shape of ~/.fleet (example configs)
│   ├── config/
│   └── data/README.md
├── docs/
│   ├── architecture.md
│   ├── operating-model.md
│   └── writing-an-agent.md
├── DESIGN.md                # cyberpunk design system (colors, motion, copy)
├── PRODUCT.md               # the dashboard's product vision
├── README.md                # this file
└── LICENSE                  # MIT
```

The agents shipped here are **real working CLAUDE.md files** — anonymized but functional. They cover an 8-world setup: HQ (CEO/CFO/COO), Research, Intelligence, Etsy, YouTube, Fiverr, AI Dropshipping, and one example consumer brand. Use them as scaffolding for your own fleet.

---

## Quick start

**Requirements:** macOS · [Claude Code](https://claude.ai/download) · `tmux` · `jq` · `node` ≥ 18

```bash
# 1. Clone and add to PATH
git clone https://github.com/mborges-dev/fleet-hq ~/fleet-hq
echo 'export PATH="$HOME/fleet-hq:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 2. Bootstrap runtime
mkdir -p ~/.fleet/{config,data,secrets,triggers}
cp ~/fleet-hq/runtime/config/*.example.* ~/.fleet/config/
for f in ~/.fleet/config/*.example.*; do mv "$f" "${f/.example./.}"; done
# Edit ~/.fleet/config/fleet.conf, goal.tsv, mode.tsv, worlds.tsv

# 3. (Optional) 3D models for the dashboard
#    See dashboard/assets/README.md for sources (Tripo3D, Meshy, Mixamo, Sketchfab)

# 4. Launch your first agent
fleet new ceo ~/fleet-hq/agents/ceo
fleet tell ceo "review revenue.tsv and set this week's top 3 priorities"

# 5. Open the dashboard
fleet dashboard          # → http://localhost:4242
```

---

## Core commands

```
fleet                              Status overview (agents · inbox · DND)
fleet new <name> <path>            Launch an agent in tmux
fleet tell <name> "message"        Brief an agent (no attach needed)
fleet say <from> --to <to> "msg"   Routed agent-to-agent message
fleet ask <name> "question"        Queue a question for routing
fleet propose <name> "pitch"       Human-approval queue
fleet watch <name>                 Attach to an agent's session
fleet log <name> [N=200]           Show last N lines of output
fleet list                         List running agents
fleet kill <name>                  Stop an agent
fleet pending [today|clear]        Inbox
fleet dnd [on|off|HH:MM-HH:MM]    Do Not Disturb
fleet dashboard [port=4242]        Open live dashboard
fleet tokens [name|all]            Token usage + USD cost per agent
fleet earn <agent> <amount> "note" Log earnings
fleet schedule "cron-expr" "cmd"   Schedule a recurring fleet command
fleet scheduler [start|stop|status] Daemon for scheduled tasks
fleet watcher [start|stop|status]  Event-driven activator daemon
fleet world | worlds               List / inspect worlds
fleet events [N=50]                Show recent audit log
fleet help                         Full reference
```

Full command reference: `fleet help`.

---

## Why this exists

I tried LangGraph. I tried CrewAI. I tried AutoGen. They all demanded I express my work as graphs, YAML, role schemas, or pip-installable orchestration runtimes. By the time I'd modeled the problem in the framework's vocabulary, I'd lost the thread of the work itself.

What I actually wanted was simpler than any of them:

- Spin up an agent
- Tell it what to do
- Walk away
- See what they're all doing without attaching to a terminal
- Get notified when they need me — but not at 2am
- Watch them earn money (or burn it) in real time

The cleanest version of this is **Claude Code + tmux + a Bash CLI + a small Node dashboard + plain files in `~/.fleet`.** No framework, no orchestration runtime, no message queue, no DAG.

That's Fleet HQ.

---

## Design

The dashboard is intentionally **not a SaaS dashboard.** It's a cyberpunk command-bridge HUD over deep space. Death Stranding's chiral UI and Halo's UNSC battle screens, not Linear or Notion.

Design rationale, color tokens, motion language, copy voice — all in [DESIGN.md](DESIGN.md).
Product vision and user model — in [PRODUCT.md](PRODUCT.md).

---

## Docs

- **[Architecture](docs/architecture.md)** — the three pieces in detail, communication patterns, the watcher daemon, why CLAUDE.md per agent
- **[Operating model](docs/operating-model.md)** — worlds, dry-run vs live, spend discipline, the ask/propose protocols
- **[Writing an agent](docs/writing-an-agent.md)** — the Mission/Never/Output/KPIs pattern, composition patterns, anti-patterns

---

## Status

**v0.1 — single-operator alpha.** Used daily by the author. macOS-only. The repo is a working snapshot, not a curated product. Things will move.

Roadmap (loose, not committed):
- **v0.2** — Linux support, `npx fleet` / `brew install` distribution, dashboard token bars, smarter inbox routing
- **v0.3** — pluggable agent runners (so Fleet can host non-Claude agents alongside Claude), public agent template gallery
- **v0.4** — observability hooks (Helicone / Langfuse / OpenTelemetry exporters)

If any of that is useful to you, issues and PRs welcome.

---

## Acknowledgements

This consolidates two earlier projects:

- **mini-miguel** — the personal-companion prototype with the 3D avatar and CLAUDE.md-per-agent pattern
- **fleet** — the generic multi-agent CLI extracted from mini-miguel

Both are archived in favor of this repo. The avatar pattern, the personality layer, and the file-based agent contract all live here now.

---

Built by [Miguel Borges](https://miguelborges.dev) · [hello@miguelborges.dev](mailto:hello@miguelborges.dev)
