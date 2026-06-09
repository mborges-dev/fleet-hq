# Writing an agent

Every Fleet agent is a folder with a `CLAUDE.md` inside. That file is the agent's mission, rules, output, and KPIs in plain Markdown. Claude Code reads it automatically when `claude` starts inside the folder.

## The minimum viable agent

```markdown
# Researcher

## Mission
Map the competitive landscape in <vertical> each cycle.

## Procedure
1. Read your `report.md` to see what you've covered.
2. Pick the next vendor / segment / question to research.
3. Search company sites, Reddit, G2, industry news.
4. Append findings to `report.md` (one section per vendor).
5. If you need a decision: `fleet ask researcher "<question>"`
6. If you need human approval: `fleet propose researcher "<pitch>"`

## Never
- Contact anyone, spend money, or publish without approval.
- Make anything up — cite sources or mark as "uncertain".

## Output
- `report.md` — append-only, one section per finding

## KPIs
- # vendors mapped per cycle
- Source citation rate (≥ 95%)
```

That's a complete, runnable agent. Five sections: Mission, Procedure, Never, Output, KPIs.

## The five sections

### Mission — one sentence

Specific, narrow, output-shaped. The mission is what every step of every cycle serves.

✅ "Map the competitive landscape in B2B logistics software, focusing on vendors with 50–500 employee customers in Europe."

❌ "Help with research."

A focused agent outperforms a generalist one every time. If you find yourself writing "and also X" in the mission, that's a second agent.

### Procedure — numbered steps the agent runs each cycle

Five to ten steps. Each step is one bounded unit of work. The procedure should be readable as "this is what I do, in this order, each time I wake up."

The first step should almost always be "read your own output file" — agents that don't know their own state thrash.

Steps that need a decision or human approval should explicitly invoke `fleet ask` or `fleet propose`.

### Never — explicit constraints

The most underrated section. Defining what an agent *won't* do is more powerful than defining what it will.

- What belongs to other agents (so it doesn't step on them)
- What requires human sign-off (so it doesn't act without approval)
- What's out of scope (so it doesn't sprawl)

Every agent's `Never` section should at minimum include: *"Contact anyone, spend money, or publish without approval."*

### Output — one specific file, one specific format

Agents that write incrementally are easier to monitor, recover from, and compose with downstream agents. Pick one file per agent and describe its format.

If you find yourself writing multiple output files in the same agent, that's probably two agents.

### KPIs — what success looks like

Two or three measurable things. These show up in the dashboard. The KPIs you choose shape the agent's behavior more than the procedure — choose carefully.

## Extending with `_preamble.md`

`agents/templates/_preamble.md` is a global preamble injected at the top of every CLAUDE.md. Use it for:

- Global rules every agent must follow (e.g. "never post without `fleet propose`")
- Shared vocabulary (what "venture" means, what "world" means)
- Standard tool invocations (how to use `fleet say`, `fleet ask`, `fleet propose`)

If you find yourself repeating the same boilerplate across every CLAUDE.md, move it to the preamble.

## Composing agents

Agents compose via files. Three patterns:

**Linear handoff:** A → B → C
```
research/report.md  ──read──►  writer/draft.md  ──read──►  fact-check/review.md
```

**Fan-out:** A produces, N consume
```
research/report.md  ──read──►  writer/draft.md
                    └─read──►  ad-creator/concepts.md
                    └─read──►  analyst/insights.md
```

**Fan-in:** N produce, one consumes
```
research/report.md ──┐
intel/briefs.md   ──┼──read──►  ceo/decisions.md
data/numbers.md   ──┘
```

The CLAUDE.md of the consumer agent should explicitly name the producer files it reads. Don't make agents discover each other.

## Anti-patterns

- **Over-broad mission** — "Handle marketing" is not a mission. Pick one channel, one output, one KPI.
- **Procedure that branches** — if your procedure has "if X then Y else Z" 3 levels deep, you're using an agent where you should use code.
- **Vague Never** — "be careful" is not a constraint. "Don't spend over €100 without propose" is.
- **Multiple outputs** — split into two agents.
- **Implicit dependencies** — if agent B reads `A/report.md` but A doesn't know it, document it on both sides.
- **No KPIs** — if you can't measure it, you can't tell if the agent is working. Even a soft metric ("# threads replied to") is better than none.
