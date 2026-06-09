# `~/.fleet/data/` — runtime state

Fleet writes here. You read. Most files are populated on demand — don't pre-create them unless you want to seed a value.

| File | Created by | Format | Notes |
|---|---|---|---|
| `agent-plan.md` | you | Markdown | Living strategic plan. Agents read this for context. |
| `revenue.tsv` | `fleet earn` | TSV: `ts  agent  amount  note` | Append-only earnings ledger |
| `proposals.tsv` | `fleet propose` | TSV: `ts  agent  status  pitch` | Human-approval queue |
| `asks.tsv` | `fleet ask` | TSV: `ts  from  to  question  status` | Inter-agent question queue |
| `ventures.tsv` | `fleet venture` | TSV: per-world venture tracking | One row per active venture |
| `agent-worlds.tsv` | `fleet assign` | TSV: `agent  world` | Routing table |
| `chat.log` | `fleet chat` / `fleet say` | append-only text | Human ↔ agent transcript |
| `events.log` | every `fleet` invocation | append-only text | Audit log |
| `watcher.log` | `fleet watcher` | append-only text | Watcher daemon activity |
| `watcher-state/` | `fleet watcher` | per-file state | Internal watcher bookkeeping |

Everything here is gitignored. If you want to back it up, do it outside git.
