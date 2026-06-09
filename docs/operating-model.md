# Operating model

How a single operator runs a fleet of dozens of autonomous Claude agents without losing the thread.

## The shape of the day

Fleet HQ is designed for "ambient supervision": the dashboard sits open all day on a second monitor; the operator glances at it dozens of times, intervenes when an agent asks a question or surfaces a proposal, and otherwise lets the fleet run.

A typical day:

- **Morning (1× active session)** — read overnight inbox, approve/reject proposals queued during DND, set the day's top-3 priorities by `fleet say ceo --world hq "<priorities>"`.
- **Throughout the day (passive glances)** — dashboard shows who's working, what's burning tokens, where revenue is coming in. Click into a world, message an agent, close the loop. Target: under 30 seconds per interaction.
- **Evening (1× active session)** — review what shipped, log earnings via `fleet earn`, mark experiments done, set DND for overnight.

## Worlds

A "world" is a vertical with its own revenue model and team of agents. The default worlds shipped here:

| World | Kind | Purpose |
|---|---|---|
| `hq` | command | Operator's command center. Cross-world view, ceo/cfo/coo agents live here. |
| `research` | support | Lead gen, niche scouting, market intel. Feeds revenue worlds. |
| `intelligence` | support | Synthesis of research into decision briefs. Feeds revenue worlds. |
| `etsy` | revenue | Etsy storefronts. |
| `youtube` | revenue | YouTube channels. |
| `fiverr` | revenue | Fiverr AI services. |
| `ai-dropship` | revenue | Dropshipping with AI-generated creatives. |
| `examplebrand` | revenue | Example consumer brand — replace with your own. |

Worlds are defined in `~/.fleet/config/worlds.tsv`. Add your own by appending a row.

## Modes: dry-run vs live

Every world has a mode (`dry-run` or `live`) in `~/.fleet/config/mode.tsv`.

- **`dry-run`** — agents log what they *would* do but don't post anything, don't spend money, don't contact anyone. Safe to leave running.
- **`live`** — agents act. Spend tokens, post content, send messages, place orders within their per-agent spend limits.

Promote one world at a time. The first 48h after going live, watch the dashboard closely.

## Spend discipline

A 30-agent fleet running `claude-sonnet-4-6` for 8 hours/day will burn through tokens fast. Three controls:

1. **Per-world dry-run gate.** Default everything to dry-run. Promote one world to live when you've reviewed its agents' CLAUDE.md.
2. **`fleet tokens`** — aggregates token usage per agent by reading Claude Code transcripts. Run daily. If one agent is burning 10× more than the median, read its log and figure out why.
3. **`fleet propose` for spend ≥ €X** — every agent's CLAUDE.md should mandate `fleet propose` for spend above a per-agent threshold (default in templates is €100). The operator approves in the dashboard.

## The ask protocol

When an agent doesn't know what to do, it runs `fleet ask <its-name> "<question>"`. The watcher routes this to the right answerer:

- Questions about strategy → CEO
- Questions about money → CFO
- Questions about other agents' availability → COO
- Questions only the operator can answer (legal, brand voice exceptions, personal preference) → human approval queue

Agents wait for a reply before proceeding. If no answer in 1h, they continue with their best-guess default and log the assumption.

## The propose protocol

When an agent wants to do something that needs human approval (spend money, ship a public post, contact someone, change strategy), it runs `fleet propose <its-name> "<pitch>"`. The dashboard shows the proposal queue. Operator approves or rejects in one click.

Approved proposals are written back to the agent's pane via `fleet say` so the agent knows to proceed.

## What this is not

This model is **not** a fully autonomous business. It's a force multiplier for one operator. The fleet works in parallel; the operator stays in the loop on every consequential action. Anything labelled "autonomous AI business" out there is either marketing or unsupervised — neither is what this is.
